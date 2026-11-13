import ConfirmModal from "@tokenring-ai/one-frontend/components/ui/ConfirmModal.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import { useEntityDelete } from "@tokenring-ai/one-frontend/hooks/useEntityDelete.ts";
import { useRefSync } from "@tokenring-ai/one-frontend/hooks/useRefSync.ts";
import { runOrConfirm } from "@tokenring-ai/one-frontend/lib/uiPreferences.ts";
import { filesystemRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import { useCallback, useState } from "react";
import { useSWRConfig } from "swr";
import NamePromptModal from "../features/filesystem/components/NamePromptModal.tsx";
import { duplicateName, getBasename, getParentPath, joinPath } from "../features/filesystem/fsUtils.ts";
import { CONTENT_SEARCH_KEY_PREFIX } from "./contentSearch.ts";
import { discardFileDrafts, isPathAtOrUnder, moveFileDrafts, removeSelectedPaths, renamedPath, setFilesBrowserState } from "./filesBrowserStore.ts";

const MAX_DUPLICATE_ATTEMPTS = 50;

type FolderCount = { files: number; directories: number; truncated: boolean };

function trimTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

/** Confirmation copy for a recursive folder delete, naming what goes with it. */
export function folderDeleteMessage(path: string, count: FolderCount | null, countError: string | null): string {
  const name = getBasename(trimTrailingSlash(path));
  if (countError) return `Delete folder “${name}” and everything in it? Its contents could not be counted (${countError}). This cannot be undone.`;
  if (!count) return `Delete folder “${name}” and everything in it? Counting its contents… This cannot be undone.`;
  if (count.files === 0 && count.directories === 0) return `Delete the empty folder “${name}”? This cannot be undone.`;
  const contents = [count.files > 0 ? plural(count.files, "file") : null, count.directories > 0 ? plural(count.directories, "folder") : null]
    .filter(Boolean)
    .join(" and ");
  return `Delete folder “${name}” and the ${count.truncated ? "more than " : ""}${contents} inside it? This cannot be undone.`;
}

type NamePrompt = { mode: "new-file" } | { mode: "new-folder" } | { mode: "rename"; path: string; isDir: boolean };

function validateEntryName(name: string): string | null {
  if (!name.trim()) return "Name is required";
  if (name.includes("/") || name.includes("\\")) return "Name cannot contain path separators";
  if (name === "." || name === "..") return "Invalid name";
  return null;
}

/**
 * What the file mutations need from the app hosting them: which files have open
 * panels, how to open, re-point and close them, and how to move the URL
 * (provided by `useFilesLayoutNavigation.ts`).
 */
export interface FilesHost {
  /** The file the URL currently names, if any. */
  routeFile: string | null;
  /** Opens a file's tab and takes focus. */
  openFile: (path: string) => void;
  /** Every open editor/preview panel with the file path it shows. */
  listFilePanels: () => { panelId: string; path: string }[];
  closePanel: (panelId: string) => void;
  /** Makes the panel show another path (renames). */
  repointPanel: (panelId: string, path: string) => void;
  /** Moves the URL to a file (or the app root for null) without adding history. */
  replaceRoute: (path: string | null) => void;
}

/** Revalidates every directory listing and workspace search. */
export function useRefreshListing() {
  const { mutate: globalMutate } = useSWRConfig();
  return useCallback(
    () =>
      globalMutate(
        key =>
          typeof key === "string" &&
          (key.startsWith("/filesystem/listDirectory/") || key.startsWith("/filesystem/searchWorkspaceFiles/") || key.startsWith(CONTENT_SEARCH_KEY_PREFIX)),
        undefined,
        { revalidate: true },
      ),
    [globalMutate],
  );
}

export interface UseFileMutationsResult {
  newFile: () => void;
  newFolder: () => void;
  openRename: (file: string) => void;
  requestDelete: (file: string) => void;
  /** Copies a file next to itself as "name copy.ext" (or "name copy N.ext"). */
  duplicate: (file: string) => Promise<void>;
  deleting: boolean;
  /** Mount once in the view. */
  modals: React.ReactNode;
}

/**
 * Create / rename / delete for the current directory, shared by the tree and
 * preview views. Keeps open editor/preview panels in step: a renamed file's
 * panel follows the new path, a deleted file's panels close.
 */
export function useFileMutationsCore(host: FilesHost, provider: string | null, path: string | null): UseFileMutationsResult {
  const { routeFile, openFile } = host;
  const refreshListing = useRefreshListing();
  const [namePrompt, setNamePrompt] = useState<NamePrompt | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  /** A folder awaiting delete confirmation, with what it contains once counted. */
  const [folderDelete, setFolderDelete] = useState<{ path: string; count: FolderCount | null; countError: string | null } | null>(null);

  /** Editor/preview panels showing `target`, or any file inside it when it is a directory. */
  const filePanelsUnder = (target: string, isDir: boolean) => host.listFilePanels().filter(panel => isPathAtOrUnder(panel.path, target, isDir));

  const entityDelete = useEntityDelete({
    currentRouteId: routeFile ?? null,
    navigateToOverview: () => host.replaceRoute(null),
    refreshList: () => void refreshListing(),
    clearLocalState: id => {
      const isDir = id.endsWith("/");
      removeSelectedPaths([id]);
      // The deleted file's (or folder's) unsaved edits have nothing left to save to.
      discardFileDrafts(provider, id, isDir);
      for (const { panelId } of filePanelsUnder(id, isDir)) host.closePanel(panelId);
    },
    successMessage: name => `Deleted ${getBasename(name)}`,
    errorMessage: error => `Delete failed: ${formatError(error)}`,
    successDuration: 2000,
    errorDuration: 4000,
  });

  const handleNamePromptSubmit = async (name: string) => {
    if (!provider || !namePrompt) return;
    const action = namePrompt.mode === "rename" ? "Rename" : namePrompt.mode === "new-file" ? "Create file" : "Create folder";
    try {
      if (namePrompt.mode === "new-file") {
        const dest = joinPath(path ?? ".", name);
        await filesystemRPCClient.writeFile({ path: dest, content: "", provider });
        await refreshListing();
        setNamePrompt(null);
        openFile(dest);
        toastManager.success(`Created ${name}`, { duration: 2000 });
        return;
      }
      if (namePrompt.mode === "new-folder") {
        const dest = joinPath(path ?? ".", name);
        await filesystemRPCClient.createDirectory({ path: dest, provider, recursive: true });
        await refreshListing();
        setNamePrompt(null);
        toastManager.success(`Created folder ${name}`, { duration: 2000 });
        return;
      }
      const parent = getParentPath(namePrompt.path);
      const newPath = joinPath(parent, name);
      const oldPath = namePrompt.isDir ? (namePrompt.path.endsWith("/") ? namePrompt.path.slice(0, -1) : namePrompt.path) : namePrompt.path;
      if (oldPath === newPath) {
        setNamePrompt(null);
        return;
      }
      await filesystemRPCClient.rename({ oldPath, newPath, provider });
      await refreshListing();
      // Unsaved drafts and open panels follow the file — or, for a folder, every
      // file inside it — to the new path. Drafts move first so the re-keyed
      // editor finds its draft when it remounts.
      moveFileDrafts(provider, oldPath, newPath, namePrompt.isDir);
      for (const panel of filePanelsUnder(oldPath, namePrompt.isDir)) {
        const next = renamedPath(panel.path, oldPath, newPath, namePrompt.isDir);
        if (next !== null) host.repointPanel(panel.panelId, next);
      }
      const nextRoute = routeFile ? renamedPath(routeFile, oldPath, newPath, namePrompt.isDir) : null;
      if (nextRoute !== null) host.replaceRoute(nextRoute);
      removeSelectedPaths([namePrompt.path, oldPath]);
      if (!namePrompt.isDir)
        setFilesBrowserState(current => ({ selectedPaths: current.selectedPaths.has(oldPath) ? current.selectedPaths : new Set(current.selectedPaths) }));
      setNamePrompt(null);
      toastManager.success(`Renamed to ${name}`, { duration: 2000 });
    } catch (e: unknown) {
      const message = `${action} failed: ${formatError(e)}`;
      toastManager.error(message, { duration: 4000 });
      // Re-throw so NamePromptModal keeps the dialog open and shows the error.
      throw new Error(message);
    }
  };

  const handleDeleteConfirm = async (pathToDelete = deleteTarget) => {
    if (!provider || !pathToDelete) return;
    setDeleteTarget(null);
    await entityDelete.deleteEntity(pathToDelete, pathToDelete, async () => {
      await filesystemRPCClient.deleteFile({ path: pathToDelete, provider });
    });
  };

  const handleFolderDeleteConfirm = async () => {
    if (!provider || !folderDelete) return;
    const folder = folderDelete.path;
    setFolderDelete(null);
    // The id keeps its trailing slash so clearLocalState treats it as a directory.
    await entityDelete.deleteEntity(folder, folder, async () => {
      await filesystemRPCClient.deleteDirectory({ path: trimTrailingSlash(folder), provider });
    });
  };

  // Read through a ref so the stable callback always deletes with the current provider.
  const handleDeleteConfirmRef = useRefSync(handleDeleteConfirm);
  const providerRef = useRefSync(provider);
  const requestDelete = useCallback(
    (file: string) => {
      if (file.endsWith("/")) {
        // Folders always ask (no "don't ask again"), and say how much goes with them.
        const currentProvider = providerRef.current;
        setFolderDelete({ path: file, count: null, countError: null });
        if (!currentProvider) return;
        filesystemRPCClient
          .countDirectoryEntries({ path: trimTrailingSlash(file), provider: currentProvider })
          .then(count => setFolderDelete(current => (current?.path === file ? { ...current, count } : current)))
          .catch((error: unknown) => setFolderDelete(current => (current?.path === file ? { ...current, countError: formatError(error) } : current)));
        return;
      }
      runOrConfirm(
        "Delete",
        () => setDeleteTarget(file),
        () => void handleDeleteConfirmRef.current(file),
      );
    },
    [handleDeleteConfirmRef, providerRef],
  );

  const deleting = entityDelete.isDeleting;

  const duplicate = useCallback(
    async (file: string) => {
      if (!provider || file.endsWith("/")) return;
      const parent = getParentPath(file);
      const name = getBasename(file);
      try {
        let destination: string | null = null;
        for (let attempt = 1; attempt <= MAX_DUPLICATE_ATTEMPTS; attempt++) {
          const candidate = joinPath(parent, duplicateName(name, attempt));
          const { exists } = await filesystemRPCClient.exists({ path: candidate, provider });
          if (!exists) {
            destination = candidate;
            break;
          }
        }
        if (!destination) throw new Error("too many copies already exist");
        await filesystemRPCClient.copy({ provider, source: file, destination, overwrite: false });
        await refreshListing();
        toastManager.success(`Duplicated as ${getBasename(destination)}`, { duration: 2000 });
      } catch (e: unknown) {
        toastManager.error(`Duplicate failed: ${formatError(e)}`, { duration: 4000 });
      }
    },
    [provider, refreshListing],
  );

  const modals = (
    <>
      {namePrompt && (
        <NamePromptModal
          title={namePrompt.mode === "new-file" ? "New file" : namePrompt.mode === "new-folder" ? "New folder" : "Rename"}
          label={namePrompt.mode === "new-folder" ? "Folder name" : "File name"}
          initialValue={namePrompt.mode === "rename" ? getBasename(namePrompt.path) : ""}
          placeholder={namePrompt.mode === "new-folder" ? "my-folder" : "example.ts"}
          confirmText={namePrompt.mode === "rename" ? "Rename" : "Create"}
          validate={validateEntryName}
          onSubmit={handleNamePromptSubmit}
          onClose={() => setNamePrompt(null)}
        />
      )}
      {folderDelete && (
        <ConfirmModal
          title="Delete folder"
          message={folderDeleteMessage(folderDelete.path, folderDelete.count, folderDelete.countError)}
          confirmLabel="Delete folder"
          onConfirm={handleFolderDeleteConfirm}
          onClose={() => {
            if (!deleting) setFolderDelete(null);
          }}
          variant="danger"
          showDontAskAgain={false}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Delete"
          message={`Delete “${getBasename(deleteTarget)}”? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirm}
          onClose={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          variant="danger"
        />
      )}
    </>
  );

  return {
    newFile: () => setNamePrompt({ mode: "new-file" }),
    newFolder: () => setNamePrompt({ mode: "new-folder" }),
    openRename: (file: string) => setNamePrompt({ mode: "rename", path: file, isDir: file.endsWith("/") }),
    requestDelete,
    duplicate,
    deleting,
    modals,
  };
}
