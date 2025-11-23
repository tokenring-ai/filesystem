import Agent from "@tokenring-ai/agent/Agent";
import type {GenerateRequest} from "@tokenring-ai/ai-client/client/AIChatClient";
import ModelRegistry from "@tokenring-ai/ai-client/ModelRegistry";
import {ChatService} from "@tokenring-ai/chat";
import {TokenRingToolDefinition} from "@tokenring-ai/chat/types";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";

const systemPrompt = `
:The user has provided a file, and a natural language description of an adjustment or patch that needs to be made to the file.
:Apply the adjustment to the file, and return the raw updated file content.
:`.trim();

// Export tool name with package prefix
const name = "file/patchFilesNaturalLanguage";

/**
 * Executes the natural language patch tool.
 *
 * Returns a success message string. Errors are thrown.
 */
async function execute(
  {
    files,
    naturalLanguagePatch,
  }: z.infer<typeof inputSchema>,
  agent: Agent,
): Promise<string> {
  const chatService = agent.requireServiceByType(ChatService);
  const modelRegistry = agent.requireServiceByType(ModelRegistry);
  const fileSystem = agent.requireServiceByType(FileSystemService);

  const patchedFiles: string[] = [];

  if (!files || files.length === 0) {
    const msg = "No files provided to patch";
    throw new Error(`[${name}] ${msg}`);
  }

  if (!naturalLanguagePatch) {
    throw new Error(`[${name}] Natural language patch description is required`);
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
      const patchRequest: GenerateRequest = {
        messages: [
          {role: "system", content: systemPrompt},
          {
            role: "user",
            content: `Original File Content (${file}):\n\`\`\`\n${originalContent}\n\`\`\`\n\nNatural Language Patch Description:\n\`\`\`${naturalLanguagePatch}\`\`\``,
          },
        ],
        schema: z.object({
          patchedContent: z
            .string()
            .describe("The complete file contents for the patched file"),
        }),
        tools: {},
      };

      // Get an online chat client
      const patchClient = await modelRegistry.chat.getFirstOnlineClient(
        chatService.getModel(agent),
      );

      // Get patched content from LLM
      const [{patchedContent}] = await patchClient.generateObject(
        patchRequest,
        agent,
      );

      // Validate that we got meaningful content back
      if (!patchedContent || patchedContent.trim() === "") {
        throw new Error("Received empty content from LLM");
      }

      // Check if the patched content is different from the original
      if (patchedContent.trim() === originalContent.trim()) {
        agent.warningLine(
          `[${name}] No changes made to file: ${file} - content is identical`,
        );
        continue;
      }

      await fileSystem.writeFile(file, patchedContent);

      patchedFiles.push(file);
      agent.infoLine(`[${name}] Successfully patched file: ${file}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`[${name}] Failed to patch file ${file}: ${errMsg}`);
    }
  }

  fileSystem.setDirty(true);
  return `Patched ${patchedFiles.length} files successfully`;
}

const description =
  "Patches multiple files using a natural language description, processed by an LLM. Includes code extraction from markdown, line ending preservation, file type validation, and optional diff preview for critical files.";

const inputSchema = z.object({
  files: z
    .array(z.string())
    .describe("List of file paths to patch, relative to the source directory."),
  naturalLanguagePatch: z
    .string()
    .describe(
      "Detailed natural language description of the patch to apply to the code.",
    ),
});

export default {
  name, description, inputSchema, execute,
} as TokenRingToolDefinition<typeof inputSchema>;
