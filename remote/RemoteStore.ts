/**
 * Remote stores: places like Google Drive, S3, WebDAV or FTP that hold files but are not
 * the host's disk. They are addressed by URL (`<scheme>://<authority>/<path or id>`), where
 * the authority names a configured mount (an account, bucket or server). Unlike the host
 * filesystem there is no grep, glob, watch or terminal access; agents copy a file to the
 * host when they need those.
 */

export type RemoteEntryKind = "file" | "folder";

export interface RemoteEntry {
  /** Canonical URL of the entry, e.g. `googledrive://work/1AbC…`. */
  url: string;
  /** Display name. Not unique: two entries in a folder may share a name. */
  name: string;
  kind: RemoteEntryKind;
  mimeType?: string | undefined;
  /** Bytes, when the store knows it (Google-native documents have none). */
  size?: number | undefined;
  /** ISO 8601. */
  modified?: string | undefined;
  /** Where to open the entry in the store's own UI. */
  webUrl?: string | undefined;
  /** Set when `read` converts the entry (a Google Doc reads as Markdown). */
  readsAs?: string | undefined;
}

export interface RemoteMount {
  scheme: string;
  /** Account, bucket or server name; the URL authority. */
  authority: string;
  /** Root URL of the mount, e.g. `googledrive://work/`. */
  url: string;
  label: string;
  writable: boolean;
  /** Include this mount in chat `@` mention search. */
  contextualSearch: boolean;
}

export interface RemoteContent {
  name: string;
  mimeType: string;
  content: Buffer;
}

export interface RemoteListing {
  entries: RemoteEntry[];
  /** Pass back to `list` for the next page. */
  cursor?: string | undefined;
}

export interface RemoteSearchOptions {
  authority: string;
  limit: number;
  signal?: AbortSignal | undefined;
}

/** One URL scheme's implementation. Optional methods are capabilities the store may lack. */
export interface RemoteStore {
  readonly scheme: string;
  /** e.g. "Google Drive". */
  readonly label: string;
  mounts(): RemoteMount[];
  list(url: string, options?: { cursor?: string | undefined }): Promise<RemoteListing>;
  stat(url: string): Promise<RemoteEntry | null>;
  read(url: string): Promise<RemoteContent>;
  search?(query: string, options: RemoteSearchOptions): Promise<RemoteEntry[]>;
  /** Create a file in a folder. */
  create?(folderUrl: string, name: string, content: Buffer, mimeType: string): Promise<RemoteEntry>;
  /** Replace an existing file's content. */
  update?(url: string, content: Buffer, mimeType: string): Promise<RemoteEntry>;
}

export interface ParsedRemoteUrl {
  scheme: string;
  authority: string;
  /** Everything after the authority, without the leading slash; empty for the mount root. */
  path: string;
}

const REMOTE_URL = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)(?:\/(.*))?$/i;

/** Parses `<scheme>://<authority>/<path>`; null when `url` is not one. */
export function parseRemoteUrl(url: string): ParsedRemoteUrl | null {
  const match = REMOTE_URL.exec(url.trim());
  if (!match) return null;
  return { scheme: match[1]!.toLowerCase(), authority: decodeURIComponent(match[2]!), path: match[3] ?? "" };
}

export function formatRemoteUrl(scheme: string, authority: string, path = ""): string {
  return `${scheme}://${encodeURIComponent(authority)}/${path}`;
}

/** True for content an agent can read as text. */
export function isTextMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    /^application\/(json|xml|javascript|x-yaml|yaml|toml|x-sh|sql|csv|markdown)(;|$)/.test(mimeType) ||
    mimeType.endsWith("+json") ||
    mimeType.endsWith("+xml")
  );
}
