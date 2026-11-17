import type { ViewParams } from "@tokenring-ai/one-frontend/layout/types.ts";

/**
 * Route params for a remote URL: `googledrive://work/<id>` or `s3://bucket/a/b.csv` →
 * `{ scheme, authority, "*": path }`. The whole path is kept, since S3 keys contain slashes.
 */
export function remoteParams(url: string): ViewParams {
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/]+)\/?(.*)$/i.exec(url);
  if (!match) return {};
  const path = match[3]!;
  return { scheme: match[1]!, authority: decodeURIComponent(match[2]!), ...(path ? { "*": path } : {}) };
}

/** The remote URL route params name; null until the route carries one. */
export function remoteUrl(params: ViewParams): string | null {
  if (!params.scheme || !params.authority) return null;
  return `${params.scheme}://${encodeURIComponent(params.authority)}/${params["*"] ?? ""}`;
}

/** "Google Drive", "Amazon S3": the store behind a scheme, for "Open in …" links. */
export function storeLabel(stores: readonly { scheme: string; label: string }[] | undefined, scheme: string | undefined): string {
  return stores?.find(store => store.scheme === scheme)?.label ?? "browser";
}

export function formatBytes(size: number | undefined): string {
  if (size === undefined) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
