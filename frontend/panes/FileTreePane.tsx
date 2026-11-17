import { useRouteParamsFor } from "@tokenring-ai/one-frontend/apps/panelHooks.ts";
import AgentLaunchPanel from "@tokenring-ai/one-frontend/components/ui/AgentLaunchPanel.tsx";
import BreadcrumbBar, { type BreadcrumbAction, type BreadcrumbSegment } from "@tokenring-ai/one-frontend/components/ui/BreadcrumbBar.tsx";
import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import SearchInput from "@tokenring-ai/one-frontend/components/ui/SearchInput.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { useDebounce } from "@tokenring-ai/one-frontend/hooks/useDebounce.ts";
import { useFileUpload } from "@tokenring-ai/one-frontend/hooks/useFileUpload.ts";
import { requireAgentFound } from "@tokenring-ai/one-frontend/lib/requireAgentFound.ts";
import { filesystemRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { Button, SegmentedControl } from "@tokenring-ai/one-frontend/ui";
import formatError from "@tokenring-ai/utility/error/formatError";
import { Eye, EyeOff, FilePlus, Filter, FilterX, FolderPlus, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import ContentSearchResults from "../features/filesystem/components/ContentSearchResults.tsx";
import FileListPane from "../features/filesystem/components/FileListPane.tsx";
import { getParentPath, joinPath } from "../features/filesystem/fsUtils.ts";
import { FILE_VIEW_ID } from "../ids.ts";
import { requestRevealLine } from "../lib/contentSearch.ts";
import { setFilesBrowserState, toggleSelectAll, toggleSelectedPath, useFilesBrowserStore, useFilesHome } from "../lib/filesBrowserStore.ts";
import { useRefreshListing } from "../lib/useFileMutationsCore.tsx";
import { useFileMutations, useOpenFile } from "../lib/useFilesLayoutNavigation.ts";

/** Max size for uploads (matches user-facing error copy). */
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
const MAX_UPLOAD_SIZE_MB = 5;

/**
 * The Files navigator: search, breadcrumbs with file actions and
 * the directory listing. Selecting a file opens its tab beside the tree.
 */
export default function FileTreePane() {
  const navigate = useNavigate();
  const location = useLocation();
  // `?dir=<folder>`: the folder being browsed, on whatever URL is current, so a folder can be
  // linked to and Back steps back through folders without moving focus off an open file.
  const [searchParams] = useSearchParams();
  const routeDir = searchParams.get("dir");
  const routeFile = useRouteParamsFor(FILE_VIEW_ID)?.fileId;
  const { homePath, defaultDirectories } = useFilesHome();
  const { pathOverride, showHidden, showIgnored, selectedPaths, searchQuery, searchMode } = useFilesBrowserStore();
  const path = pathOverride ?? homePath;
  const debouncedSearch = useDebounce(searchQuery, 250);
  const openFile = useOpenFile();
  const refreshListing = useRefreshListing();
  const { newFile, newFolder, openRename, requestDelete, duplicate, modals } = useFileMutations(path, routeFile ?? null);

  // The URL decides the folder: `?dir` if present, else an open file's directory (deep link,
  // "open in Files" from a terminal), else the home folder.
  useEffect(() => {
    setFilesBrowserState({ pathOverride: routeDir ?? (routeFile ? getParentPath(routeFile) : null) });
  }, [routeDir, routeFile]);

  const navigateTo = useCallback(
    (nextPath: string) => {
      setFilesBrowserState({ pathOverride: nextPath, searchQuery: "" });
      const params = new URLSearchParams(location.search);
      params.set("dir", nextPath);
      void navigate({ pathname: location.pathname, search: `?${params.toString()}` });
    },
    [location.pathname, location.search, navigate],
  );

  /** Binary-safe uploads via base64 so images and other non-text files are not corrupted. */
  const upload = useFileUpload({
    encoding: "base64",
    maxSize: MAX_UPLOAD_SIZE,
    maxSizeLabel: `${MAX_UPLOAD_SIZE_MB} MB`,
    uploadFile: async ({ filePath, content, encoding }) => {
      if (path === null) throw new Error("Files are still loading");
      await filesystemRPCClient.writeFile({ path: joinPath(path, filePath), content, encoding });
    },
    checkExists: async ({ filePath }) => {
      if (path === null) return { exists: false };
      return filesystemRPCClient.exists({ path: joinPath(path, filePath) });
    },
    onSkip: ({ reason, detail }) => {
      if ((reason === "size" || reason === "invalid-name") && detail) toastManager.error(detail, { duration: 3000 });
    },
    onError: ({ fileName, error }) => {
      toastManager.error(`Failed to upload "${fileName}": ${formatError(error)}`, { duration: 3000 });
    },
    onComplete: async ({ uploaded }) => {
      await refreshListing();
      if (uploaded > 0) toastManager.success(uploaded === 1 ? "Uploaded 1 file" : `Uploaded ${uploaded} files`, { duration: 2000 });
    },
  });

  const breadcrumbSegments = useMemo((): BreadcrumbSegment[] => {
    if (path === null || path === "." || path === "/") return [];
    // Absolute paths get a full trail from the filesystem root so the user can walk up past the launch directory.
    if (path.startsWith("/")) {
      const parts = path.split("/").filter(Boolean);
      return parts.map((part, i) => ({ label: part, value: `/${parts.slice(0, i + 1).join("/")}` }));
    }
    const parts = path.split("/");
    return parts.map((part, i) => ({ label: part, value: parts.slice(0, i + 1).join("/") }));
  }, [path]);

  const breadcrumbActions = useMemo(
    (): BreadcrumbAction[] => [
      { icon: RefreshCw, onClick: () => void refreshListing(), ariaLabel: "Refresh", title: "Refresh" },
      {
        icon: showHidden ? EyeOff : Eye,
        onClick: () => setFilesBrowserState(current => ({ showHidden: !current.showHidden })),
        ariaLabel: showHidden ? "Hide hidden files" : "Show hidden files",
        title: showHidden ? "Hide hidden files" : "Show hidden files",
      },
      {
        icon: showIgnored ? FilterX : Filter,
        onClick: () => setFilesBrowserState(current => ({ showIgnored: !current.showIgnored })),
        ariaLabel: showIgnored ? "Hide gitignored files" : "Show gitignored files",
        title: showIgnored ? "Hide files matched by .gitignore/.aiignore" : "Show files matched by .gitignore/.aiignore",
      },
      { icon: FilePlus, onClick: newFile, ariaLabel: "New file", title: "New file" },
      { icon: FolderPlus, onClick: newFolder, ariaLabel: "New folder", title: "New folder" },
      { icon: Plus, onClick: upload.trigger, ariaLabel: "Upload files", title: "Upload files" },
    ],
    [newFile, newFolder, refreshListing, showHidden, showIgnored, upload.trigger],
  );

  if (defaultDirectories.error) {
    return (
      <ErrorState
        title="Could not load the launch directory"
        error={formatError(defaultDirectories.error)}
        onRetry={() => void defaultDirectories.mutate()}
        variant="page"
      />
    );
  }
  if (path === null) {
    return <LoadingState message="Loading files…" className="h-full w-full" />;
  }

  return (
    <ViewShell tone="sidebar" scroll={false}>
      <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-primary">
        <SearchInput
          value={searchQuery}
          onChange={value => setFilesBrowserState({ searchQuery: value })}
          placeholder={searchMode === "contents" ? "Search file contents…" : "Search file names…"}
          aria-label={searchMode === "contents" ? "Search file contents" : "Search file names"}
          className="flex-1 min-w-0"
        />
        <SegmentedControl
          value={searchMode}
          onChange={mode => setFilesBrowserState({ searchMode: mode })}
          ariaLabel="Search mode"
          size="sm"
          options={[
            { value: "names", label: "Names", title: "Search file names" },
            { value: "contents", label: "Contents", title: "Search contents of files under this folder" },
          ]}
        />
      </div>

      <BreadcrumbBar
        segments={breadcrumbSegments}
        rootLabel={path.startsWith("/") ? "/" : "root"}
        rootValue={path.startsWith("/") ? "/" : "."}
        onNavigate={navigateTo}
        actions={breadcrumbActions}
      />
      {homePath !== null && path !== homePath && (
        <div className="px-3 py-1 border-b border-primary bg-secondary">
          <Button variant="ghost" onClick={() => navigateTo(homePath)}>
            ← Back to {homePath === "." ? "root" : homePath}
          </Button>
        </div>
      )}
      <input ref={upload.inputRef} type="file" multiple onChange={e => void upload.onChange(e)} className="hidden" />

      <div className="flex-1 min-h-0 min-w-0">
        {searchMode === "contents" ? (
          <ContentSearchResults
            path={path}
            query={debouncedSearch}
            onOpenMatch={match => {
              requestRevealLine(match.file, match.line);
              openFile(match.file);
            }}
          />
        ) : (
          <FileListPane
            path={path}
            showHidden={showHidden}
            showIgnored={showIgnored}
            onNavigate={navigateTo}
            onSelectFile={file => openFile(file)}
            selectedFile={routeFile ?? null}
            selectedPaths={selectedPaths as Set<string>}
            onToggleSelected={toggleSelectedPath}
            onToggleSelectAll={toggleSelectAll}
            uploadingFiles={upload.uploadingFiles}
            searchQuery={debouncedSearch}
            onRename={openRename}
            onDelete={requestDelete}
            onDuplicate={file => void duplicate(file)}
          />
        )}
      </div>

      {selectedPaths.size > 0 && (
        <AgentLaunchPanel
          selectedItems={selectedPaths as Set<string>}
          itemLabel="file"
          onClear={() => setFilesBrowserState({ selectedPaths: new Set() })}
          attachItemToAgent={async (agentId, file) => {
            requireAgentFound(await filesystemRPCClient.addFileToChat({ agentId, file }));
          }}
          onNavigateToAgent={agentId => void navigate(`/agent/${agentId}`)}
        />
      )}

      {modals}
    </ViewShell>
  );
}
