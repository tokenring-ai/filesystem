import type { FileSystemProvider } from "../FileSystemProvider.ts";
import fallbackGlob from "./fallbackGlob.ts";

type GlobOptions = { ignoreFilter: (path: string) => boolean };

type IndexEntry = {
  files: string[];
  builtAt: number;
};

const INDEX_TTL_MS = 30_000;
const indexByProvider = new Map<string, IndexEntry>();

/** Invalidate cached workspace file lists (e.g. after writes). */
export function invalidateWorkspaceFileIndex(providerName?: string) {
  if (providerName) {
    indexByProvider.delete(providerName);
    return;
  }
  indexByProvider.clear();
}

/** Cached `**/*` listing used by `searchWorkspaceFiles`. */
export async function listWorkspaceFiles(
  providerName: string,
  provider: FileSystemProvider,
  globOptions: GlobOptions,
): Promise<string[]> {
  const now = Date.now();
  const cached = indexByProvider.get(providerName);
  if (cached && now - cached.builtAt < INDEX_TTL_MS) {
    return cached.files;
  }

  const files = provider.glob
    ? await provider.glob("**/*", globOptions)
    : await fallbackGlob(provider, "**/*", globOptions);

  indexByProvider.set(providerName, { files, builtAt: now });
  return files;
}