import { BaseAttachmentSchema } from "@tokenring-ai/agent/AgentEvents";
import type { TokenRingFullToolResult } from "@tokenring-ai/chat/schema";
import { createPatch } from "diff";
import mime from "mime-types";

export default function createFileWriteResult(
  filePath: string,
  previousContent: string | null,
  nextContent: string,
  maxReturnedDiffSize: number,
  validationSuffix: string | null,
): TokenRingFullToolResult {
  const attachments: TokenRingFullToolResult["attachments"] = [];

  if (previousContent) {
    const mimeType = BaseAttachmentSchema.shape.mimeType.safeParse(mime.lookup(filePath));
    if (mimeType.success) {
      attachments.push({
        name: filePath,
        description: `Original content of ${filePath}`,
        encoding: "text",
        mimeType: mimeType.data,
        body: previousContent,
      });
    }
  }
  const results = [`[${filePath}] Success.`];

  if (previousContent !== null) {
    const diff = createPatch(filePath, previousContent, nextContent);

    if (diff.length <= maxReturnedDiffSize) {
      attachments.push({
        name: `${filePath}.diff`,
        encoding: "text",
        mimeType: "text/x-diff",
        body: diff,
      });
      results.push(`[${filePath}] File Diff:`, diff);
    }
  }

  if (validationSuffix) {
    attachments.push({
      name: `${filePath}.validation.txt`,
      encoding: "text",
      mimeType: "text/plain",
      body: validationSuffix,
    });
    results.push(`[${filePath}] File Validation Results:`, validationSuffix);
  }
  return {
    result: results.join("\n"),
    attachments,
  };
}

/*

  return {
    type: "text",
    text: "File successfully created." + validationSuffix,
    artifact: {
      name: filePath,
      encoding: "text",
      mimeType: mime.lookup(filePath) || "text/plain",
      body: nextContent,
    },
  };
}*/
