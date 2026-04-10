import type Agent from "@tokenring-ai/agent/Agent";
import path from "node:path";
import FileSystemService from "../FileSystemService.ts";

export default async function runFileValidator(
  filePath: string,
  content: string,
  agent: Agent,
): Promise<string> {
  const ext = path.extname(filePath);
  const validator = agent
    .requireServiceByType(FileSystemService)
    .getFileValidatorForExtension(ext);

  if (!validator) return "";
  const result = await validator(filePath, content);
  return result ? `\n\nValidation (${ext}):\n${result}` : "";
}
