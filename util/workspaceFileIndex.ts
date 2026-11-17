import type { IgnorePredicate } from "../FileSystemTypes.ts";
import type HostFileSystem from "../HostFileSystem.ts";

type IndexEntry = {
  files: string[];
  builtAt: number;
};

const INDEX_TTL_MS = 30_000;
const indexByRoot = new Map<string, IndexEntry>();

function indexKey(root: string, variant: string): string {
  return `${root}\0${variant}`;
}

/** Invalidate cached workspace file lists (e.g. after writes). */
export function invalidateWorkspaceFileIndex() {
  indexByRoot.clear();
}

/**
 * Cached recursive listing of the files under one absolute root, used by
 * `searchWorkspaceFiles` and contextual search. Results are absolute paths.
 */
export async function listWorkspaceFiles(
  provider: HostFileSystem,
  root: string,
  options: { ignoreFilter?: IgnorePredicate; variant?: string } = {},
): Promise<string[]> {
  const now = Date.now();
  const key = indexKey(root, options.variant ?? "");
  const cached = indexByRoot.get(key);
  if (cached && now - cached.builtAt < INDEX_TTL_MS) {
    return cached.files;
  }

  const ignoreFilter = options.ignoreFilter ?? (() => false);
  const files: string[] = [];
  try {
    for await (const entry of provider.getDirectoryTree(root, { recursive: true, ignoreFilter })) {
      if (entry.endsWith("/")) continue;
      files.push(entry);
    }
  } catch {
    // Root missing or unreadable — treat as empty rather than failing the search.
  }

  indexByRoot.set(key, { files, builtAt: now });
  return files;
}
