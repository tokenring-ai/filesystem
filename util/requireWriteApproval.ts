import type Agent from "@tokenring-ai/agent/Agent";
import { ApprovalLevel } from "@tokenring-ai/chat/schema";
import { requireToolApproval } from "@tokenring-ai/chat/util/requireToolApproval";
import FileSystemService from "../FileSystemService.ts";

/** File writes, edits and appends: every overwritten version is archived, so the change is recoverable. */
export const FILE_WRITE_SAFETY_LEVEL = ApprovalLevel.RecoverableChange;

/**
 * Rates a file write by the allowed-path entry covering the destination: the level is the larger of the
 * tool's own level and that entry's `approvalLevel`. Throws a ToolCallError when the user does not approve.
 */
export default async function requireWriteApproval(agent: Agent, toolName: string, filePath: string, verb: string): Promise<void> {
  const entry = agent.requireService(FileSystemService).findCoveringEntry(filePath);
  const entryLevel = entry?.permission === "write" ? entry.approvalLevel : undefined;
  const raised = entryLevel !== undefined && entryLevel > FILE_WRITE_SAFETY_LEVEL;
  const safetyLevel = raised ? entryLevel : FILE_WRITE_SAFETY_LEVEL;
  await requireToolApproval(agent, {
    toolName,
    message: raised ? `${verb} ${filePath}? (allowed path ${entry?.path} is rated level ${entryLevel})` : `${verb} ${filePath}?`,
    detailedDescription: raised
      ? `The allowed-path entry ${entry?.path} sets approvalLevel ${entryLevel}, so changes under it ask at or below that threshold.`
      : "The previous version is archived and can be restored.",
    safetyLevel,
    default: false,
  });
}
