import type { FileSystemProvider, IgnorePredicate } from "../FileSystemProvider.ts";

type IndexEntry = {
  files: string[];
  builtAt: number;
};

const INDEX_TTL_MS = 30_000;
const indexByProviderRoot = new Map<string, IndexEntry>();

function indexKey(providerName: string, root: string, variant: string): string {
  return `${providerName}\0${root}\0${variant}`;
}

/** Invalidate cached workspace file lists (e.g. after writes). */
export function invalidateWorkspaceFileIndex(providerName?: string) {
  if (providerName) {
    for (const key of indexByProviderRoot.keys()) {
      if (key.startsWith(`${providerName}\0`)) indexByProviderRoot.delete(key);
    }
    return;
  }
  indexByProviderRoot.clear();
}

/**
 * Cached recursive listing of the files under one absolute root, used by
 * `searchWorkspaceFiles` and contextual search. Results are absolute paths.
 */
export async function listWorkspaceFiles(
  providerName: string,
  provider: FileSystemProvider,
  root: string,
  options: { ignoreFilter?: IgnorePredicate; variant?: string } = {},
): Promise<string[]> {
  const now = Date.now();
  const key = indexKey(providerName, root, options.variant ?? "");
  const cached = indexByProviderRoot.get(key);
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

  indexByProviderRoot.set(key, { files, builtAt: now });
  return files;
}
