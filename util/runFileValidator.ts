import path from "node:path";
import type Agent from "@tokenring-ai/agent/Agent";
import { AgentLifecycleService } from "@tokenring-ai/lifecycle";
import type { Hook } from "@tokenring-ai/lifecycle/types";
import { z } from "zod";

export const FileValidationResultSchema = z
  .object({
    valid: z.boolean(),
    result: z.string(),
  })
  .nullable();

export type FileValidationResult = z.infer<typeof FileValidationResultSchema>;

export class FileValidationAfterFileWrite implements Hook<typeof FileValidationResultSchema> {
  readonly type = "hook";
  readonly returnType = FileValidationResultSchema;

  constructor(
    readonly filePath: string,
    readonly fileExtension: string,
    readonly content: string,
  ) {}
}

/** @deprecated Use FileValidationAfterFileWrite */
export const FileValidatonAfterFileWrite = FileValidationAfterFileWrite;

export default async function runFileValidator(filePath: string, content: string, agent: Agent): Promise<string> {
  const ext = path.extname(filePath);
  const lifecycleService = agent.getService(AgentLifecycleService);
  if (!lifecycleService) return "";

  const validations = await lifecycleService.executeHooks(new FileValidationAfterFileWrite(filePath, ext, content), agent);

  const results: string[] = [];
  for (const validation of validations) {
    if (validation && !validation.valid) {
      results.push(`Validation (${ext}):\n${validation.result}`);
    }
  }

  const joinedResults = results.join("\n\n");
  return joinedResults.length > 0 ? `\n\n${joinedResults}` : "";
}
