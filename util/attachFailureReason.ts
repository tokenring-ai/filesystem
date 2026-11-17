import formatError from "@tokenring-ai/utility/error/formatError";

/** Why a file couldn't be attached, in words for the chat rather than a stack trace. A missing file is the common case. */
export default function attachFailureReason(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "ENOENT") return "it no longer exists.";
  if (code === "EACCES" || code === "EPERM") return "permission denied.";
  if (code === "EISDIR") return "it is a folder.";
  return formatError(err, { includeStack: false });
}
