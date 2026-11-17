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

async function execute({ files, cwd }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const fileSystem = agent.requireService(FileSystemService);
  const { maxFileReadCount, maxTextFileReadSize, imageFileMaxResolution } = agent.getState(FileSystemState).settings;

  const matchedFiles = new Set<string>();

  // Handle glob patterns in files array
  for (const filePattern of files) {
    try {
      if (filePattern.includes("*") || filePattern.includes("?")) {
        for (const matchedFile of await fileSystem.glob(filePattern, { includeDirectories: true, ...(cwd !== undefined && { cwd }) }, agent)) {
          matchedFiles.add(matchedFile);
        }
      } else {
        matchedFiles.add(fileSystem.resolvePath(filePattern));
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

  // First the paths: a directory is expanded once (its tree is already recursive, and lists the
  // directories themselves ending in "/"). Past the limit only names are returned, so nothing is
  // read just to be thrown away.
  const paths = new Set<string>();
  for (const file of matchedFiles) {
    try {
      const stat = await fileSystem.stat(file, agent);
      if (stat.exists && stat.isDirectory) {
        for await (const dirFile of fileSystem.getDirectoryTree(file, {}, agent)) {
          if (!dirFile.endsWith("/")) paths.add(dirFile);
        }
      } else {
        paths.add(file);
      }
    } catch (err) {
      retrievedFiles.set(file, { mimeType: "text/plain", encoding: "text", contents: `[Could not read: ${formatError(err)}]` });
    }
    if (paths.size > maxFileReadCount) break;
  }

  if (paths.size > maxFileReadCount) {
    agent.infoMessage(`[${name}] Too many files were matched. Returning only the names.`);

    return {
      message: `**File Read** Matched more than ${maxFileReadCount} files`,
      actions: [`Too many files matched, summarizing results...`],
      result: `
The file read operation matched more than ${maxFileReadCount} files, the user specified limit.
The list of matched files will be returned as a directory listing instead. To retrieve the files, you will need to request no more than ${maxFileReadCount} files at a time

${fileListing(paths)}
`.trim(),
    };
  }

  async function retrieveFile(file: string) {
    const stat = await fileSystem.stat(file, agent);
    if (!stat.exists) {
      retrievedFiles.set(file, { mimeType: "text/plain", encoding: "text", contents: "[File does not exist]" });
      return;
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

  for (const file of paths) {
    try {
      await retrieveFile(file);
    } catch (err) {
      // One unreadable file (outside the allowed paths through a symlink, say) does not fail the rest.
      retrievedFiles.set(file, { mimeType: "text/plain", encoding: "text", contents: `[Could not read: ${formatError(err)}]` });
    }
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
- File paths must be ABSOLUTE paths inside one of the allowed directories listed in your context (e.g. '/project/src/main.ts').
- Glob patterns may be absolute ('/project/src/**/*.ts'), or relative when the 'cwd' argument names the absolute directory to search from.
`.trim();

const inputSchema = z
  .object({
    files: z.array(z.string()).describe("List of absolute file paths or glob patterns (e.g., '/project/src/**/*.ts', '/project/README.md')."),
    cwd: z.string().exactOptional().describe("Absolute, allowed directory that relative glob patterns are resolved against."),
  })
  .strict();

export default {
  name,
  displayName,
  description,
  inputSchema,
  requiredContextHandlers: ["allowed-paths"],
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
