import Agent from "@tokenring-ai/agent/Agent";
import {ChatModelRegistry} from "@tokenring-ai/ai-client/ModelRegistry";
import {ChatService} from "@tokenring-ai/chat";
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import FileSystemService from "../FileSystemService.ts";

const systemPrompt = `
:The user has provided a file, and a natural language description of an adjustment or patch that needs to be made to the file.
:Apply the adjustment to the file, and return the raw updated file content.
:`.trim();

const name = "file_patchFilesNaturalLanguage";
const displayName = "Filesystem/patchFilesNaturalLanguage";

/**
 * Executes the natural language patch tool.
 *
 * Returns a success message string. Errors are thrown.
 */
async function execute(
  {
    files,
    naturalLanguagePatch,
  }: z.output<typeof inputSchema>,
  agent: Agent,
): Promise<string> {
  const chatService = agent.requireServiceByType(ChatService);
  const chatModelRegistry = agent.requireServiceByType(ChatModelRegistry);
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
      // Check if the file exists
      if (!(await fileSystem.exists(file, agent))) {
        throw new Error(`File does not exist: ${file}`);
      }

      // Read the original file content
      const originalContent = await fileSystem.readTextFile(file, agent);
      if (!originalContent) {
        throw new Error(`Failed to read file content: ${file}`);
      }

      // Get an online chat client
      const patchClient = await chatModelRegistry.getClient(
        chatService.requireModel(agent),
      );

      // Get patched content from LLM
      const [{patchedContent}] = await patchClient.generateObject(
        {
          messages: [
            {role: "system", content: systemPrompt},
            {
              role: "user",
              content: `Original File Content (${file}):\n\`\`\`\n${originalContent}\n\`\`\`\n\nNatural Language Patch Description:\n\`\`\`${naturalLanguagePatch}\`\`\``,
            },
          ],
          schema: z.object({
            patchedContent: z.string().describe("The complete file contents for the patched file"),
          }),
          tools: {},
        },
        agent,
      );

      // Validate that we got meaningful content back
      if (!patchedContent || patchedContent.trim() === "") {
        throw new Error("Received empty content from LLM");
      }

      // Check if the patched content is different from the original
      if (patchedContent.trim() === originalContent.trim()) {
        agent.warningMessage(
          `[${name}] No changes made to file: ${file} - content is identical`,
        );
        continue;
      }

      await fileSystem.writeFile(file, patchedContent, agent);

      patchedFiles.push(file);
      agent.infoMessage(`[${name}] Successfully patched file: ${file}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`[${name}] Failed to patch file ${file}: ${errMsg}`);
    }
  }

  fileSystem.setDirty(true, agent);
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
  name, displayName, description, inputSchema, execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
