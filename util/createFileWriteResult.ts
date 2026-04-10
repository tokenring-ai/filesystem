import type {TokenRingToolResult} from "@tokenring-ai/chat/schema";
import {createPatch} from "diff";
import mime from "mime-types";

export default function createFileWriteResult(
  filePath: string,
  previousContent: string | null,
  nextContent: string,
  maxReturnedDiffSize: number,
  validationSuffix = "",
): TokenRingToolResult {
  if (previousContent !== null) {
    const diff = createPatch(filePath, previousContent, nextContent);

    return {
      type: "text",
      text:
        (diff.length <= maxReturnedDiffSize
          ? `File successfully written. Changes made:\n${diff}`
          : "File successfully overwritten.") + validationSuffix,
      artifact: {
        name: filePath,
        encoding: "text",
        mimeType: "text/x-diff",
        body: diff,
      },
    };
  }

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
}
