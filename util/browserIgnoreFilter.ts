import path from "node:path";
import type { IgnorePredicate } from "../FileSystemTypes.ts";
import type HostFileSystem from "../HostFileSystem.ts";
import { TreeIgnore } from "./treeIgnore.ts";

function hostIO(provider: HostFileSystem) {
  return {
    readFile: async (filePath: string) => {
      try {
        return await provider.readFile(filePath);
      } catch {
        return null;
      }
    },
    exists: async (filePath: string) => {
      try {
        return await provider.exists(filePath);
      } catch {
        return false;
      }
    },
  };
}

/**
 * Root ignore state at the enclosing git repository (nearest ancestor with a
 * `.git`) when there is one, so ancestor .gitignore files apply while browsing
 * a subdirectory. Falls back to the directory itself.
 */
async function findIgnoreRoot(provider: HostFileSystem, dir: string): Promise<string> {
  if (!path.isAbsolute(dir)) return dir;
  let current = path.resolve(dir);
  for (;;) {
    if (await hostIO(provider).exists(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(dir);
}

/** Walk filter for browser listings: gitignore/aiignore rules only — hidden files stay a client-side toggle. */
export default async function browserIgnoreFilter(provider: HostFileSystem, dir: string): Promise<IgnorePredicate> {
  const root = await findIgnoreRoot(provider, dir);
  const treeIgnore = new TreeIgnore(root, { includeHidden: true }, hostIO(provider));
  return treeIgnore.shouldIgnore;
}
