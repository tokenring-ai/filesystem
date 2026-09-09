import path from "node:path";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";

/**
 * Agent tool inputs must be absolute paths (the allow-list is injected into
 * context); returns the normalized path or throws a tool error naming the rule.
 */
export default function requireAbsolutePath(toolName: string, filePath: string): string {
  if (!path.isAbsolute(filePath)) {
    throw new ToolCallError(toolName, `Path "${filePath}" must be an absolute path inside one of the allowed directories listed in your context.`);
  }
  return path.resolve(filePath);
}
