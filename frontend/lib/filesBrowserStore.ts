import { useDefaultDirectories } from "@tokenring-ai/one-frontend/rpc.ts";
import { useSyncExternalStore } from "react";

/**
 * Browser state shared by the Files views (tree, editors, previews). Each
 * view is its own React subtree, so the current directory and
 * multi-selection live here rather than in component state. In memory only.
 */

export interface FilesBrowserState {
  /** Directory the tree shows; null means the launch directory. */
  pathOverride: string | null;
  showHidden: boolean;
  /** Whether .gitignore/.aiignore matches are listed. */
  showIgnored: boolean;
  /** Files ticked for the agent launch panel. */
  selectedPaths: ReadonlySet<string>;
  searchQuery: string;
  /** What the search box matches: file names (workspace-wide) or file contents (under the current directory). */
  searchMode: "names" | "contents";
}

const INITIAL: FilesBrowserState = {
  pathOverride: null,
  showHidden: false,
  showIgnored: false,
  selectedPaths: new Set(),
  searchQuery: "",
  searchMode: "names",
};

let state: FilesBrowserState = INITIAL;
const listeners = new Set<() => void>();

function update(next: FilesBrowserState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFilesBrowserStore(): FilesBrowserState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

export function getFilesBrowserState(): FilesBrowserState {
  return state;
}

export function setFilesBrowserState(patch: Partial<FilesBrowserState> | ((current: FilesBrowserState) => Partial<FilesBrowserState>)): void {
  const next = typeof patch === "function" ? patch(state) : patch;
  update({ ...state, ...next });
}

export function toggleSelectedPath(file: string): void {
  const next = new Set(state.selectedPaths);
  if (next.has(file)) next.delete(file);
  else next.add(file);
  update({ ...state, selectedPaths: next });
}

export function toggleSelectAll(files: string[]): void {
  const allIn = files.every(f => state.selectedPaths.has(f));
  const next = new Set(state.selectedPaths);
  for (const file of files) {
    if (allIn) next.delete(file);
    else next.add(file);
  }
  update({ ...state, selectedPaths: next });
}

export function removeSelectedPaths(files: Iterable<string>): void {
  const next = new Set(state.selectedPaths);
  let changed = false;
  for (const file of files) {
    if (next.delete(file)) changed = true;
  }
  if (changed) update({ ...state, selectedPaths: next });
}

/** Test helper. */
export function resetFilesBrowserStore(): void {
  update(INITIAL);
}

// ─── Unsaved editor drafts ─────────────────────────────────────────────────────

/** Edits not yet written to disk, keyed by path, so closing a tab does not lose them. */
const drafts = new Map<string, string>();
const draftListeners = new Set<() => void>();

export function fileDraftKey(path: string): string {
  return path;
}

export function getFileDraft(key: string): string | null {
  return drafts.get(key) ?? null;
}

export function setFileDraft(key: string, content: string | null): void {
  if (content === null) {
    if (!drafts.delete(key)) return;
  } else {
    if (drafts.get(key) === content) return;
    drafts.set(key, content);
  }
  for (const listener of draftListeners) listener();
}

export function useFileDraft(key: string | null): string | null {
  return useSyncExternalStore(
    listener => {
      draftListeners.add(listener);
      return () => {
        draftListeners.delete(listener);
      };
    },
    () => (key ? (drafts.get(key) ?? null) : null),
    () => null,
  );
}

function trimDirectory(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/** True when `path` is `target` itself or, for a directory target, anything inside it. */
export function isPathAtOrUnder(path: string, target: string, isDir: boolean): boolean {
  if (!isDir) return path === target;
  const dir = trimDirectory(target);
  return path === dir || path === `${dir}/` || path.startsWith(`${dir}/`);
}

/** Re-points a path at or under `oldPath` to `newPath`; returns null when it is unaffected. */
export function renamedPath(path: string, oldPath: string, newPath: string, isDir: boolean): string | null {
  if (!isPathAtOrUnder(path, oldPath, isDir)) return null;
  if (!isDir) return newPath;
  const from = trimDirectory(oldPath);
  return trimDirectory(newPath) + path.slice(from.length);
}

/**
 * Moves unsaved drafts after a rename so a panel re-keyed to the new path finds
 * them. For a directory, every draft of a file inside it follows.
 */
export function moveFileDrafts(oldPath: string, newPath: string, isDir: boolean): void {
  // Collect first: inserting keys while iterating the map would visit them again.
  const moves: [from: string, to: string, content: string][] = [];
  for (const [key, content] of drafts) {
    const next = renamedPath(key, oldPath, newPath, isDir);
    if (next !== null && next !== key) moves.push([key, fileDraftKey(next), content]);
  }
  if (moves.length === 0) return;
  for (const [from] of moves) drafts.delete(from);
  for (const [, to, content] of moves) drafts.set(to, content);
  for (const listener of draftListeners) listener();
}

/** Drops the drafts of a deleted file, or of every file inside a deleted directory. */
export function discardFileDrafts(path: string, isDir: boolean): void {
  let changed = false;
  // Deleting the entry being visited is safe while iterating a Map.
  for (const key of drafts.keys()) {
    if (!isPathAtOrUnder(key, path, isDir)) continue;
    drafts.delete(key);
    changed = true;
  }
  if (changed) for (const listener of draftListeners) listener();
}

/**
 * Clears a draft after its content was written, but only if nothing was typed
 * while the write was in flight; a newer draft is kept.
 */
export function clearSavedFileDraft(key: string, savedContent: string): void {
  if (drafts.get(key) === savedContent) setFileDraft(key, null);
}

/** Test helper. */
export function clearFileDrafts(): void {
  drafts.clear();
  for (const listener of draftListeners) listener();
}

// ─── Home directory ───────────────────────────────────────────────────────────

/** Browsing starts in the launch directory; walking up past it via breadcrumbs is allowed. */
export function useFilesHome() {
  const defaultDirectories = useDefaultDirectories();
  return { homePath: defaultDirectories.data?.workingDirectory ?? null, defaultDirectories };
}
