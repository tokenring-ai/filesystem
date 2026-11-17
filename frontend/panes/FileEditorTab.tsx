import { usePanelBadge, usePanelTitle } from "@tokenring-ai/one-frontend/apps/panelHooks.ts";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { useKeyboardShortcuts } from "@tokenring-ai/one-frontend/hooks/useKeyboardShortcuts.ts";
import { usePanel } from "@tokenring-ai/one-frontend/layout/hooks.ts";
import { filesystemRPCClient, useFileContents } from "@tokenring-ai/one-frontend/rpc.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import FileEditorPane from "../features/filesystem/components/FileEditorPane.tsx";
import FileVersionsPanel from "../features/filesystem/components/FileVersionsPanel.tsx";
import { getBasename, isLikelyTextFile } from "../features/filesystem/fsUtils.ts";
import { consumeRevealLine, revealLineIn, usePendingReveal } from "../lib/contentSearch.ts";
import { clearSavedFileDraft, fileDraftKey, setFileDraft, useFileDraft } from "../lib/filesBrowserStore.ts";
import { fileVersionsKey } from "../lib/fileVersions.ts";

/** How long an "open at line" request waits for the editor to mount before giving up. */
const REVEAL_ATTEMPTS = 20;
const REVEAL_INTERVAL_MS = 150;

/** The editor of one text file, with its save/restore flow and version history. */
export default function FileEditorTab({ path }: { path: string }) {
  const panel = usePanel();
  const isText = isLikelyTextFile(path);
  const fileContent = useFileContents(isText ? path : undefined);
  const draftKey = fileDraftKey(path);
  const draft = useFileDraft(draftKey);
  const [saving, setSaving] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const { mutate: globalMutate } = useSWRConfig();
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const pendingReveal = usePendingReveal(path);
  const loaded = fileContent.data !== undefined;

  // A content-search hit asked for this file at a line: scroll there once the editor is up.
  useEffect(() => {
    if (!pendingReveal || !loaded) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tryReveal = async () => {
      const container = editorAreaRef.current;
      const done = container ? await revealLineIn(container, pendingReveal.line) : false;
      if (cancelled) return;
      attempts += 1;
      if (done || attempts >= REVEAL_ATTEMPTS) {
        consumeRevealLine(pendingReveal.nonce);
        return;
      }
      timer = setTimeout(() => void tryReveal(), REVEAL_INTERVAL_MS);
    };
    timer = setTimeout(() => void tryReveal(), 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loaded, pendingReveal]);

  const diskContent = fileContent.data?.content ?? "";
  const editorContent = draft ?? diskContent;
  const isDirty = draft !== null && draft !== diskContent;

  usePanelTitle(getBasename(path));
  // Unsaved edits show as a dot on the tab; the draft itself survives closing the panel.
  usePanelBadge(isDirty ? { tone: "warning", label: "Unsaved changes" } : null);

  const handleSave = useCallback(async () => {
    if (!isText || draft === null) return;
    setSaving(true);
    try {
      await filesystemRPCClient.writeFile({ path, content: draft });
      await fileContent.mutate(() => ({ content: draft }));
      // Text typed while the write was in flight stays as the new draft.
      clearSavedFileDraft(draftKey, draft);
      // The save archived the previous content.
      void globalMutate(fileVersionsKey(path));
      toastManager.success("Saved", { duration: 2000 });
    } catch (e: unknown) {
      toastManager.error(`Save failed: ${formatError(e)}`, { duration: 3000 });
    } finally {
      setSaving(false);
    }
  }, [draft, draftKey, fileContent, globalMutate, isText, path]);

  /** Restore = the normal save path with the archived text; the current text is archived first. */
  const handleRestore = useCallback(
    async (content: string): Promise<boolean> => {
      try {
        await filesystemRPCClient.writeFile({ path, content });
        await fileContent.mutate(() => ({ content }));
        setFileDraft(draftKey, null);
        toastManager.success("Version restored", { duration: 2000 });
        return true;
      } catch (e: unknown) {
        toastManager.error(`Restore failed: ${formatError(e)}`, { duration: 3000 });
        return false;
      }
    },
    [draftKey, fileContent, path],
  );

  // ⌘/Ctrl+S saves the editor on screen.
  useKeyboardShortcuts([{ key: "s", allowInEditable: true, enabled: panel.isActive && isDirty, handler: () => void handleSave() }]);

  return (
    <ViewShell scroll={false}>
      <div className="h-full flex min-h-0">
        <div ref={editorAreaRef} className="flex-1 min-w-0 h-full">
          <FileEditorPane
            file={path}
            content={editorContent}
            onContentChange={next => setFileDraft(draftKey, next === diskContent ? null : next)}
            isLoading={isText && fileContent.isLoading}
            hasData={!!fileContent.data}
            isDirty={isDirty}
            saving={saving}
            onSave={() => void handleSave()}
            loadError={fileContent.error ? formatError(fileContent.error) : null}
            onToggleVersions={() => setVersionsOpen(open => !open)}
            versionsOpen={versionsOpen}
          />
        </div>
        {versionsOpen && (
          <div className="w-72 max-w-[45%] shrink-0 h-full">
            <FileVersionsPanel path={path} isDirty={isDirty} onRestore={handleRestore} onClose={() => setVersionsOpen(false)} />
          </div>
        )}
      </div>
    </ViewShell>
  );
}
