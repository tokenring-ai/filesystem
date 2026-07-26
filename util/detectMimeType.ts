import type { ImageMimeTypes, TextMimeTypes } from "@tokenring-ai/agent/AgentEvents";

export default function detectMimeType(filename: string): TextMimeTypes | ImageMimeTypes {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "diff":
      return "text/x-diff";
    case "html":
      return "text/html";
    case "json":
      return "application/json";
    case "md":
      return "text/markdown";
    case "txt":
      return "text/plain";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      //TODO: not really correct, but we don't want to have to build special handlers for every file type
      return "text/plain";
  }
}
