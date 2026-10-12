import { useDefaultDirectories, useFilesystemProviders } from "@tokenring-ai/one-frontend/rpc.ts";
import { useMemo, useSyncExternalStore } from "react";

/**
 * Browser state shared by the Files views (tree, editors, previews). Each
 * view is its own React subtree, so the current provider, directory and
 * multi-selection live here rather than in component state. In memory only.
 */

export interface FilesBrowserState {
  /** Provider chosen in the tree; null means the first available one. */
  providerOverride: string | null;
  /** Directory the tree shows; null means the provider's home. */
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
  providerOverride: null,
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

/** Edits not yet written to disk, keyed by provider + path, so closing a tab does not lose them. */
const drafts = new Map<string, string>();
const draftListeners = new Set<() => void>();

export function fileDraftKey(provider: string | null, path: string): string {
  return `${provider ?? ""}\0${path}`;
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

function splitDraftKey(key: string): { provider: string; path: string } {
  const index = key.indexOf("\0");
  return { provider: key.slice(0, index), path: key.slice(index + 1) };
}

/**
 * Moves unsaved drafts after a rename so a panel re-keyed to the new path finds
 * them. For a directory, every draft of a file inside it follows.
 */
export function moveFileDrafts(provider: string | null, oldPath: string, newPath: string, isDir: boolean): void {
  // Collect first: inserting keys while iterating the map would visit them again.
  const moves: [from: string, to: string, content: string][] = [];
  for (const [key, content] of drafts) {
    const parsed = splitDraftKey(key);
    if (parsed.provider !== (provider ?? "")) continue;
    const next = renamedPath(parsed.path, oldPath, newPath, isDir);
    if (next !== null && next !== parsed.path) moves.push([key, fileDraftKey(provider, next), content]);
  }
  if (moves.length === 0) return;
  for (const [from] of moves) drafts.delete(from);
  for (const [, to, content] of moves) drafts.set(to, content);
  for (const listener of draftListeners) listener();
}

/** Drops the drafts of a deleted file, or of every file inside a deleted directory. */
export function discardFileDrafts(provider: string | null, path: string, isDir: boolean): void {
  let changed = false;
  // Deleting the entry being visited is safe while iterating a Map.
  for (const key of drafts.keys()) {
    const parsed = splitDraftKey(key);
    if (parsed.provider !== (provider ?? "") || !isPathAtOrUnder(parsed.path, path, isDir)) continue;
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

// ─── Provider resolution ───────────────────────────────────────────────────────

export function useFilesProvider() {
  const fsProviders = useFilesystemProviders();
  const defaultDirectories = useDefaultDirectories();
  const { providerOverride } = useFilesBrowserStore();

  const providers = useMemo(() => fsProviders.data?.providers ?? [], [fsProviders.data]);
  const provider = useMemo(() => {
    if (providerOverride && providers.includes(providerOverride)) return providerOverride;
    return providers[0] ?? null;
  }, [providerOverride, providers]);

  // Browsing starts in the launch directory (host filesystem); other providers
  // keep their own root. Walking up past it via breadcrumbs is allowed.
  const homePath = useMemo(() => {
    if (!defaultDirectories.data || !provider) return null;
    return provider === defaultDirectories.data.defaultProvider ? defaultDirectories.data.workingDirectory : ".";
  }, [defaultDirectories.data, provider]);

  return { provider, providers, homePath, fsProviders, defaultDirectories };
}
