import { usePanelTitle, useRouteParamsFor } from "@tokenring-ai/one-frontend/apps/panelHooks.ts";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { usePanel } from "@tokenring-ai/one-frontend/layout/hooks.ts";
import { filesystemRPCClient, useFileContents } from "@tokenring-ai/one-frontend/rpc.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import { useState } from "react";
import PreviewMetadataPane from "../features/filesystem/components/PreviewMetadataPane.tsx";
import { getBasename, getParentPath, isLikelyTextFile } from "../features/filesystem/fsUtils.ts";
import { FILE_VIEW_ID } from "../ids.ts";
import { clearSavedFileDraft, fileDraftKey, toggleSelectedPath, useFileDraft, useFilesBrowserStore, useFilesProvider } from "../lib/filesBrowserStore.ts";
import { useFileMutations } from "../lib/useFilesLayoutNavigation.ts";

/** Preview and metadata for one file. Offers to save an unsaved editor draft of the same file. */
export default function FilePreviewTab({ path }: { path: string }) {
  const panel = usePanel();
  const routeFile = useRouteParamsFor(FILE_VIEW_ID)?.fileId ?? null;
  const { provider } = useFilesProvider();
  const { selectedPaths } = useFilesBrowserStore();
  const { openRename, requestDelete, modals } = useFileMutations(provider, getParentPath(path), routeFile);
  const draftKey = fileDraftKey(provider, path);
  const draft = useFileDraft(draftKey);
  const fileContent = useFileContents(isLikelyTextFile(path) && draft !== null ? path : undefined, provider ?? undefined);
  const [saving, setSaving] = useState(false);

  usePanelTitle(getBasename(path));

  const handleSave = async () => {
    if (!provider || draft === null) return;
    setSaving(true);
    try {
      await filesystemRPCClient.writeFile({ path, content: draft, provider });
      await fileContent.mutate(() => ({ content: draft }));
      // Text typed while the write was in flight stays as the new draft.
      clearSavedFileDraft(draftKey, draft);
      toastManager.success("Saved", { duration: 2000 });
    } catch (e: unknown) {
      toastManager.error(`Save failed: ${formatError(e)}`, { duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ViewShell tone="sidebar" scroll={false}>
      <PreviewMetadataPane
        file={path}
        provider={provider}
        selectedPaths={selectedPaths as Set<string>}
        onToggleSelected={toggleSelectedPath}
        onClose={() => panel.close()}
        isDirty={draft !== null}
        saving={saving}
        onSave={handleSave}
        onRename={openRename}
        onDelete={requestDelete}
      />
      {modals}
    </ViewShell>
  );
}
