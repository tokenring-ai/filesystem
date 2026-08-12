import type Agent from "@tokenring-ai/agent/Agent";
import type { ImageMimeTypes, TextMimeTypes } from "@tokenring-ai/agent/AgentEvents";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { isBinaryData } from "@tokenring-ai/utility/buffer/isBinaryData";
import formatError from "@tokenring-ai/utility/error/formatError";
import EnhancedMap from "@tokenring-ai/utility/map/enhancedMap";
import { z } from "zod";
import FileSystemService from "../FileSystemService.ts";
import { FileSystemState } from "../state/fileSystemState.ts";
import detectMimeType from "../util/detectMimeType.ts";
import fileListing from "../util/fileListing.ts";

const name = "file_read";
const displayName = "Filesystem/read";

async function downsampleImageTo(contents: Buffer<ArrayBufferLike>, imageFileMaxResolution: number) {
  const image = new Bun.Image(contents);

  const totalPixels = image.height * image.width;
  if (totalPixels <= 0 || totalPixels <= imageFileMaxResolution) {
    return contents;
  }

  // Scale each dimension by sqrt(ratio) so total pixels approach the max while preserving aspect ratio
  const scale = Math.sqrt(imageFileMaxResolution / totalPixels);
  const width = Math.max(1, Math.floor(image.width * scale));
  const height = Math.max(1, Math.floor(image.height * scale));
  return await image.resize(width, height).toBuffer();
}

async function execute({ files }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const fileSystem = agent.requireService(FileSystemService);
  const { maxFileReadCount, maxTextFileReadSize, imageFileMaxResolution } = agent.getState(FileSystemState).settings;

  const matchedFiles = new Set<string>();

  // Handle glob patterns in files array
  for (let filePattern of files) {
    try {
      // Paths are relative to the filesystem root
      if (filePattern.startsWith("/")) filePattern = filePattern.substring(1);
      if (filePattern.includes("*") || filePattern.includes("?")) {
        for (const matchedFile of await fileSystem.glob(filePattern, { includeDirectories: true }, agent)) {
          matchedFiles.add(matchedFile);
        }
      } else {
        matchedFiles.add(filePattern);
      }
    } catch (err) {
      agent.warningMessage(`[${name}] Error resolving pattern ${filePattern}: ${formatError(err)}`);
    }
  }

  //agent.infoMessage(`[${name}] files=${files.join(", ")} matchedFiles=${matchedFiles.size}`);

  if (matchedFiles.size === 0) {
    return {
      failed: true,
      message: `**File Read** Read 0 files`,
      result: `No files were found that matched the search criteria`,
    };
  }

  const retrievedFiles = new EnhancedMap<
    string,
    {
      mimeType: TextMimeTypes | ImageMimeTypes;
      contents: string;
      encoding: "text" | "base64";
      modificationTime?: number | undefined;
    }
  >();

  async function retrieveFile(file: string) {
    const stat = await fileSystem.stat(file, agent);
    if (!stat.exists) {
      retrievedFiles.set(file, { mimeType: "text/plain", encoding: "text", contents: "[File does not exist]" });
      return;
    } else if (stat.isDirectory) {
      for await (const dirFile of fileSystem.getDirectoryTree(file, {}, agent)) {
        await retrieveFile(dirFile);
      }
    }

    const mimeType = detectMimeType(file);
    switch (mimeType) {
      case "image/jpeg":
      case "image/png":
      case "image/webp":
        {
          const contents = await fileSystem.readFile(file, agent);
          if (!contents) {
            agent.warningMessage(`[${name}] Failed to read image file ${file}`);
            break;
          }
          try {
            const downsampledImage = await downsampleImageTo(contents, imageFileMaxResolution);
            retrievedFiles.set(file, {
              encoding: "base64",
              contents: downsampledImage.toBase64(),
              mimeType,
              modificationTime: stat.modified?.getTime(),
            });
          } catch (err) {
            agent.warningMessage(`[${name}] Failed to downsample image file ${file}`, err);
          }
        }
        break;
      default: {
        // TODO: everything else is interpreted as text types
        if (maxTextFileReadSize > 0 && stat.size && stat.size > maxTextFileReadSize) {
          retrievedFiles.set(file, { mimeType: "text/plain", encoding: "text", contents: "[File is too large to retrieve]" });
        } else {
          const contents = await fileSystem.readFile(file, agent);
          if (contents) {
            if (isBinaryData(contents)) {
              retrievedFiles.set(file, {
                mimeType: "text/plain",
                encoding: "text",
                contents: "[File is binary and cannot be displayed]",
              });
            } else {
              retrievedFiles.set(file, {
                mimeType: "text/plain",
                encoding: "text",
                contents: contents.toString("utf-8"),
                modificationTime: stat.modified?.getTime(),
              });
            }
          } else {
            agent.infoMessage(`[${name}] Couldn't read file ${file}`);
          }
        }
      }
    }
  }

  for (const file of matchedFiles) {
    await retrieveFile(file);
  }

  if (retrievedFiles.size > maxFileReadCount) {
    agent.infoMessage(`[${name}] Too many files were matched. Returning only the names.`);

    return {
      message: `**File Read** Read ${retrievedFiles.size} files`,
      actions: [`Too many files matched, summarizing results...`],
      result: `
The file read operation matched ${retrievedFiles.size} files, which is higher than the user specified limit of ${maxFileReadCount}.
The list of matched files will be returned as a directory listing instead. To retrieve the files, you will need to request no more than ${maxFileReadCount} files at a time

${fileListing(retrievedFiles.keys())}
`.trim(),
    };
  }

  agent.mutateState(FileSystemState, state => {
    for (const [fileName, { modificationTime }] of retrievedFiles) {
      if (modificationTime) {
        state.readFiles.set(fileName, modificationTime);
      }
    }
  });

  return {
    message: `**File Read** Read ${retrievedFiles.size} files`,
    actions: retrievedFiles.mapKeys(file => `Read ${file}`),
    result: `The file read operation matched ${retrievedFiles.size} files, the file contents are provided below`,
    attachments: retrievedFiles.mapEntries(([file, { mimeType, contents, encoding }]) => ({
      name: file,
      encoding,
      body: contents,
      mimeType,
      sendToLLM: true,
    })),
  };
}

const description = `
Read files from the filesystem. Retrieves file contents based on file paths or glob patterns.
- The filesystem scope is the entire sandboxed root directory accessible by the FileSystemService (e.g., the project's root folder).
- File paths use Unix-style '/' separators and are relative to the root folder defined by the user.
`.trim();

const inputSchema = z
  .object({
    files: z.array(z.string()).describe("List of file paths or glob patterns (e.g., '**/*.ts', 'path/to/file.txt')."),
  })
  .strict();

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
