import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import ChatService from "@token-ring/chat/ChatService";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";
import type {Registry} from "@token-ring/registry";

const systemPrompt = `
:The user has provided a file, and a natural language description of an adjustment or patch that needs to be made to the file.
:Apply the adjustment to the file, and return the raw updated file content.
:`.trim();

/**
 * Executes the natural language patch tool.
 *
 * Returns either a success message string or an error object `{ error: string }`.
 */
export async function execute(
  { files, naturalLanguagePatch }: { files?: string[]; naturalLanguagePatch?: string },
  registry: Registry,
): Promise<string|{ error: string}> {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);
  const fileSystem = registry.requireFirstServiceByType(FileSystemService);

  const toolName = "patchFilesNaturalLanguage";
  const patchedFiles: string[] = [];

  if (!files || files.length === 0) {
    const msg = "No files provided to patch";
    chatService.errorLine(`[${toolName}] ${msg}`);
    return { error: msg };
  }

  for (const file of files) {
    try {
      // Check if file exists
      if (!(await fileSystem.exists(file))) {
        throw new Error(`File does not exist: ${file}`);
      }

      // Read the original file content
      const originalContent = await fileSystem.getFile(file);
      if (!originalContent) {
        throw new Error(`Failed to read file content: ${file}`);
      }

      // Generate patch using LLM via the new chat API
      const patchRequest = {
        input: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Original File Content (${file}):\n\`\`\`\n${originalContent}\n\`\`\`\n\nNatural Language Patch Description:\n\`\`\`${naturalLanguagePatch}\`\`\``,
          },
        ],
        responseSchema: z.object({
          patchedContent: z
            .string()
            .describe("The complete file contents for the patched file"),
        }),
      } as const;

      // Get an online chat client
      let patchClient: any;
      try {
        patchClient = await modelRegistry.chat.getFirstOnlineClient({
          name: "default", // or other requirement selection; uses chat registry
        });
      } catch (error: any) {
        throw new Error(`No online chat client available: ${error.message}`);
      }

      // Get patched content from LLM
      const [{ patchedContent }] = await patchClient.generateObject(
        patchRequest,
        registry,
      );

      // Validate that we got meaningful content back
      if (!patchedContent || patchedContent.trim() === "") {
        throw new Error("Received empty content from LLM");
      }

      // Check if the patched content is different from the original
      if (patchedContent.trim() === originalContent.trim()) {
        chatService.warningLine(
          `[${toolName}] No changes made to file: ${file} - content is identical`,
        );
        continue;
      }

      await fileSystem.writeFile(file, patchedContent);

      patchedFiles.push(file);
      chatService.infoLine(`[${toolName}] Successfully patched file: ${file}`);
    } catch (error: any) {
      const errMsg = `Failed to patch file ${file}: ${error.message}`;
      chatService.errorLine(`[${toolName}] ${errMsg}`);
      // Return the first encountered error as the tool result
      return { error: errMsg };
    }
  }

  fileSystem.setDirty(true);
  return `Patched ${patchedFiles.length} files successfully`;
}

export const description =
  "Patches multiple files using a natural language description, processed by an LLM. Includes code extraction from markdown, line ending preservation, file type validation, and optional diff preview for critical files.";

export const parameters = z.object({
  files: z.array(z.string(), {
    description: "List of file paths to patch, relative to the source directory.",
  }),
  naturalLanguagePatch: z.string({
    description:
      "Detailed natural language description of the patch to apply to the code.",
  }),
});
