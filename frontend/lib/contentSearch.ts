import { filesystemRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { useSyncExternalStore } from "react";
import useSWR from "swr";

/** Most file:line matches one content search returns. */
export const CONTENT_SEARCH_LIMIT = 200;

/** SWR key prefix shared with the Files "Refresh" action. */
export const CONTENT_SEARCH_KEY_PREFIX = "/filesystem/searchFileContents/";

export interface ContentMatch {
  file: string;
  line: number;
  match: string;
}

/**
 * Searches file contents under `path` (gitignored and hidden files skipped).
 * Idle until the query is at least two characters.
 */
export function useContentSearch(path: string | null, query: string) {
  const trimmed = query.trim();
  const key = path && trimmed.length >= 2 ? `${CONTENT_SEARCH_KEY_PREFIX}${path}\0${trimmed}` : null;
  return useSWR(key, () =>
    filesystemRPCClient.searchFileContents({
      path: path!,
      query: trimmed,
      limit: CONTENT_SEARCH_LIMIT,
      ignoreCase: true,
      gitignore: true,
      includeHidden: false,
    }),
  );
}

/** Groups matches by file, keeping the order files were first matched in. */
export function groupMatchesByFile(matches: readonly ContentMatch[]): { file: string; matches: ContentMatch[] }[] {
  const groups = new Map<string, ContentMatch[]>();
  for (const match of matches) {
    const list = groups.get(match.file);
    if (list) list.push(match);
    else groups.set(match.file, [match]);
  }
  return [...groups].map(([file, list]) => ({ file, matches: list }));
}

// ─── "Open at line" requests ──────────────────────────────────────────────────

/**
 * A line the next editor showing `path` should scroll to. Opening a search
 * result sets it before the editor panel opens (or is focused); the editor
 * consumes it once the text is on screen.
 */
let pendingReveal: { path: string; line: number; nonce: number } | null = null;
let revealNonce = 0;
const revealListeners = new Set<() => void>();

export function requestRevealLine(path: string, line: number): void {
  revealNonce += 1;
  pendingReveal = { path, line, nonce: revealNonce };
  for (const listener of revealListeners) listener();
}

/** Clears the request once handled, unless a newer one replaced it. */
export function consumeRevealLine(nonce: number): void {
  if (pendingReveal?.nonce !== nonce) return;
  pendingReveal = null;
  for (const listener of revealListeners) listener();
}

/** The pending reveal for `path`, or null. */
export function usePendingReveal(path: string): { line: number; nonce: number } | null {
  return useSyncExternalStore(
    listener => {
      revealListeners.add(listener);
      return () => {
        revealListeners.delete(listener);
      };
    },
    () => (pendingReveal?.path === path ? pendingReveal : null),
    () => null,
  );
}

/** Test helper: the pending reveal, outside React. */
export function getPendingRevealForTest(): { path: string; line: number } | null {
  return pendingReveal;
}

/** Test helper. */
export function resetRevealRequests(): void {
  pendingReveal = null;
}

/** The slice of Monaco's editor API used to reveal a line. */
interface RevealableEditor {
  getContainerDomNode(): HTMLElement;
  revealLineInCenter(line: number): void;
  setPosition(position: { lineNumber: number; column: number }): void;
  focus(): void;
}

/**
 * Scrolls the Monaco editor mounted inside `container` to `line` and puts the
 * cursor there. Returns false when no editor is mounted there (yet), or when
 * the file is shown by an editor without line navigation (Markdown).
 */
export async function revealLineIn(container: HTMLElement, line: number): Promise<boolean> {
  try {
    // Optional chaining: under test the module is mocked without a loader.
    const { loader } = (await import("@monaco-editor/react")) as { loader?: typeof import("@monaco-editor/react").loader };
    if (!loader) return false;
    const monaco = (await loader.init()) as { editor: { getEditors(): RevealableEditor[] } };
    const editor = monaco.editor.getEditors().find(candidate => container.contains(candidate.getContainerDomNode()));
    if (!editor) return false;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
    return true;
  } catch {
    return false;
  }
}
