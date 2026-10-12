import NavigationSidebarHeader from "@tokenring-ai/one-frontend/components/layout/NavigationSidebarHeader.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@tokenring-ai/one-frontend/components/ui/dropdown-menu.tsx";
import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import { cn } from "@tokenring-ai/one-frontend/lib/utils.ts";
import { useDirectoryListing, useWorkspaceFileSearch } from "@tokenring-ai/one-frontend/rpc.ts";
import { Check, Copy, Download, type LucideIcon, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { downloadWorkspaceFile } from "../downloadFile.ts";
import { getBasename, getFileIcon, isHiddenEntry, isHiddenPath } from "../fsUtils.ts";

interface FileListPaneProps {
  provider: string | null;
  path: string;
  showHidden: boolean;
  showIgnored: boolean;
  onNavigate: (p: string) => void;
  onSelectFile: (f: string) => void;
  selectedFile: string | null;
  selectedPaths: Set<string>;
  onToggleSelected: (f: string) => void;
  onToggleSelectAll: (files: string[]) => void;
  uploadingFiles: string[];
  searchQuery: string;
  onRename?: (file: string) => void;
  onDelete?: (file: string) => void;
  onDuplicate?: (file: string) => void;
}

interface RowAction {
  key: string;
  label: string;
  icon: LucideIcon;
  danger?: boolean;
  run: () => void;
}

/**
 * Inline row actions reveal on hover, on keyboard focus inside the row, and
 * always on touch screens (no hover to reveal them).
 */
export const ROW_ACTIONS_REVEAL = "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100";

export default function FileListPane({
  provider,
  path,
  showHidden,
  showIgnored,
  onNavigate,
  onSelectFile,
  selectedFile,
  selectedPaths,
  onToggleSelected,
  onToggleSelectAll,
  uploadingFiles,
  searchQuery,
  onRename,
  onDelete,
  onDuplicate,
}: FileListPaneProps) {
  const trimmedSearch = searchQuery.trim();
  const isSearching = trimmedSearch.length > 0;

  const listing = useDirectoryListing(provider && !isSearching ? { path, showHidden, showIgnored, provider } : undefined);
  const workspaceSearch = useWorkspaceFileSearch(provider && isSearching ? { provider, query: trimmedSearch, limit: 80, showIgnored } : undefined);

  const sortedFiles = useMemo(() => {
    if (isSearching) {
      let files = [...(workspaceSearch.data?.files ?? [])];
      if (!showHidden) {
        files = files.filter(f => !isHiddenPath(f));
      }
      return files.sort((a, b) => {
        const dA = a.endsWith("/"),
          dB = b.endsWith("/");
        if (dA && !dB) return -1;
        if (!dA && dB) return 1;
        return a.localeCompare(b);
      });
    }

    if (!listing.data?.files) return [];
    let files = [...listing.data.files];
    if (!showHidden) {
      files = files.filter(f => !isHiddenEntry(f));
    }
    return files.sort((a, b) => {
      const dA = a.endsWith("/"),
        dB = b.endsWith("/");
      if (dA && !dB) return -1;
      if (!dA && dB) return 1;
      return a.localeCompare(b);
    });
  }, [listing.data?.files, workspaceSearch.data?.files, isSearching, showHidden]);

  const fileOnly = sortedFiles.filter(f => !f.endsWith("/"));
  const allSelected = fileOnly.length > 0 && fileOnly.every(f => selectedPaths.has(f));

  const handleRowClick = (file: string) => {
    const isDir = file.endsWith("/");
    if (isDir) {
      const dirPath = file.endsWith("/") ? file.slice(0, -1) : file;
      onNavigate(dirPath);
      return;
    }
    // When searching, opening a file should also jump to its parent directory context is optional;
    // select the file for preview/edit.
    onSelectFile(file);
  };

  const isLoading = isSearching ? workspaceSearch.isLoading : listing.isLoading;
  const loadError = isSearching ? workspaceSearch.error : listing.error;

  // provider can briefly be null while parents load; avoid a false "empty directory" flash
  if (!provider) {
    return (
      <div className="h-full flex flex-col min-h-0">
        <NavigationSidebarHeader title="Files" />
        <LoadingState size="sm" className="flex-1" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-0">
        <NavigationSidebarHeader title="Files" />
        <LoadingState size="sm" className="flex-1" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-full flex flex-col min-h-0">
        <NavigationSidebarHeader title="Files" />
        <ErrorState
          className="flex-1 flex flex-col items-center justify-center"
          title={isSearching ? "Search failed" : "Could not list this folder"}
          error={loadError}
          onRetry={() => void (isSearching ? workspaceSearch.mutate() : listing.mutate())}
        />
      </div>
    );
  }

  const rowActions = (file: string, isDir: boolean): RowAction[] => [
    ...(!isDir
      ? [
          {
            key: "download",
            label: "Download",
            icon: Download,
            run: () => {
              if (!provider) return;
              downloadWorkspaceFile(file, provider).catch(() => toastManager.error("Download failed", { duration: 3000 }));
            },
          },
        ]
      : []),
    ...(onDuplicate && !isDir ? [{ key: "duplicate", label: "Duplicate", icon: Copy, run: () => onDuplicate(file) }] : []),
    ...(onRename ? [{ key: "rename", label: "Rename", icon: Pencil, run: () => onRename(file) }] : []),
    // deleteFile RPC only supports files, not directories
    ...(onDelete ? [{ key: "delete", label: isDir ? "Delete folder" : "Delete", icon: Trash2, danger: true, run: () => onDelete(file) }] : []),
  ];

  return (
    <div className="h-full overflow-y-auto flex flex-col">
      <NavigationSidebarHeader title="Files" meta={sortedFiles.length} />
      {isSearching && (
        <div className="px-3 py-1.5 border-b border-primary bg-tertiary text-xs text-muted shrink-0">
          {workspaceSearch.data
            ? `${workspaceSearch.data.totalMatches} match${workspaceSearch.data.totalMatches === 1 ? "" : "es"} for “${trimmedSearch}”${
                workspaceSearch.data.totalMatches > sortedFiles.length ? ` · showing ${sortedFiles.length}` : ""
              }`
            : `Searching for “${trimmedSearch}”…`}
        </div>
      )}
      <table className="w-full text-left border-collapse">
        <thead className="sticky top-0 bg-secondary z-10">
          <tr className="text-xs text-muted font-semibold border-b border-primary">
            <th className="pl-3 pr-2 py-2 w-8">
              <button
                type="button"
                onClick={() => onToggleSelectAll(fileOnly)}
                className={cn(
                  "w-3.5 h-3.5 border rounded-sm flex items-center justify-center transition-all focus-ring cursor-pointer",
                  allSelected ? "border-accent bg-accent" : "border-primary hover:border-muted",
                )}
                aria-label={allSelected ? "Deselect all" : "Select all files"}
                title={allSelected ? "Deselect all" : "Select all files"}
              >
                {allSelected && <Check className="w-2.5 h-2.5 text-white" />}
              </button>
            </th>
            <th className="px-2 py-2 font-medium">Name</th>
            <th className="px-2 py-2 font-medium w-24 hidden md:table-cell">Type</th>
            <th className="px-2 py-2 font-medium w-10 sm:w-28 text-right pr-4">
              <span className="sr-only sm:not-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="text-xs">
          {sortedFiles.map(file => {
            const isDir = file.endsWith("/");
            const name = getBasename(file);
            const isSelectedFile = selectedFile === file;
            const isChecked = selectedPaths.has(file);
            const isUploading = uploadingFiles.includes(name);
            const showPathHint = isSearching && file.includes("/");
            const actions = rowActions(file, isDir);

            return (
              <tr
                key={file}
                onClick={() => handleRowClick(file)}
                className={cn("group border-b border-primary cursor-pointer transition-colors outline-none", isSelectedFile ? "bg-active" : "hover:bg-hover")}
                tabIndex={0}
                aria-label={`${isDir ? "Directory" : "File"}: ${name}`}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleRowClick(file);
                  }
                }}
              >
                <td className="pl-3 pr-2 py-2.5" onClick={e => e.stopPropagation()}>
                  {!isDir && (
                    <button
                      type="button"
                      onClick={() => onToggleSelected(file)}
                      className={cn(
                        "w-3.5 h-3.5 border rounded-sm flex items-center justify-center transition-all focus-ring cursor-pointer",
                        isChecked ? "border-accent bg-accent" : "border-primary hover:border-accent-soft",
                      )}
                      aria-label={isChecked ? `Deselect ${name}` : `Select ${name}`}
                    >
                      {isChecked && <Check className="w-2.5 h-2.5 text-white" />}
                    </button>
                  )}
                </td>

                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {getFileIcon(file, isDir)}
                    <div className="min-w-0 flex-1">
                      <span
                        className={cn("font-medium truncate block", isSelectedFile ? "text-accent-soft" : "text-primary", isUploading && "text-accent-soft")}
                      >
                        {name}
                      </span>
                      {showPathHint && <span className="text-xs text-dim truncate block">{file}</span>}
                    </div>
                    {isUploading && <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />}
                  </div>
                </td>

                <td className="px-2 py-2.5 text-muted hidden md:table-cell">{isDir ? "folder" : name.includes(".") ? name.split(".").pop() : "—"}</td>

                <td className="px-2 py-2.5" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                  {actions.length > 0 && (
                    <>
                      <div className={cn("hidden sm:flex items-center justify-end gap-0.5 transition-opacity pr-2", ROW_ACTIONS_REVEAL)}>
                        {actions.map(action => (
                          <button
                            key={action.key}
                            type="button"
                            onClick={action.run}
                            className={cn("p-1 text-muted focus-ring rounded cursor-pointer", action.danger ? "hover:text-red-400" : "hover:text-primary")}
                            aria-label={`${action.label} ${name}`}
                            title={action.label}
                          >
                            <action.icon className="w-3.5 h-3.5" />
                          </button>
                        ))}
                      </div>
                      {/* Phones: one always-visible menu instead of hover-revealed icons. */}
                      <div className="flex sm:hidden justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="p-1.5 text-muted hover:text-primary focus-ring rounded cursor-pointer"
                              aria-label={`Actions for ${name}`}
                              title="Actions"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {actions.map(action => (
                              <DropdownMenuItem key={action.key} onSelect={action.run} className={cn("gap-2 text-xs", action.danger && "text-red-500")}>
                                <action.icon className="w-3.5 h-3.5" /> {action.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </>
                  )}
                </td>
              </tr>
            );
          })}

          {sortedFiles.length === 0 && (
            <tr>
              <td colSpan={4} className="py-16 text-center text-muted text-sm">
                {isSearching ? `No files matching “${trimmedSearch}”` : "This directory is empty."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
