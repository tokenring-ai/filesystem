import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import { useConfirmDialog } from "@tokenring-ai/one-frontend/hooks/useConfirmDialog.tsx";
import { Button, IconButton } from "@tokenring-ai/one-frontend/ui";
import formatError from "@tokenring-ai/utility/error/formatError";
import { History, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { useFileVersionContent, useFileVersions } from "../../../lib/fileVersions.ts";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Archived versions of the file in an editor: pick one to see its text, then
 * restore it. Restoring goes through the editor's normal save, so the current
 * content is itself archived first and the restore can be undone.
 */
export default function FileVersionsPanel({
  path,
  isDirty,
  onRestore,
  onClose,
}: {
  path: string;
  /** The editor holds unsaved edits that a restore would replace. */
  isDirty: boolean;
  onRestore: (content: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const versions = useFileVersions(path);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = versions.data?.versions.find(version => version.id === selectedId) ?? null;
  const content = useFileVersionContent(path, selected?.id ?? null);
  const { openConfirm, Dialog } = useConfirmDialog();
  const [restoring, setRestoring] = useState(false);

  const restore = async () => {
    if (!selected || content.data?.content == null) return;
    const ok = await openConfirm({
      title: "Restore version",
      message: `Replace the file with the version from ${formatDate(selected.createdAt)}?${
        isDirty ? " Your unsaved edits will be discarded." : ""
      } The current content is archived first, so this can be undone.`,
      confirmText: "Restore",
      variant: "warning",
      dontAskAgain: false,
    });
    if (!ok) return;
    setRestoring(true);
    try {
      if (await onRestore(content.data.content)) {
        setSelectedId(null);
        await versions.mutate();
      }
    } finally {
      setRestoring(false);
    }
  };

  let body: React.ReactNode;
  if (versions.error && !versions.data) {
    body = <ErrorState title="Could not load versions" error={formatError(versions.error)} onRetry={() => void versions.mutate()} />;
  } else if (!versions.data) {
    body = <LoadingState message="Loading versions…" size="sm" className="py-8" />;
  } else if (versions.data.versions.length === 0) {
    body = (
      <EmptyState
        icon={History}
        title="No earlier versions"
        hint="A version is archived each time this file is overwritten. Archiving covers files inside the workspace directory."
      />
    );
  } else {
    body = (
      <div className="flex-1 min-h-0 flex flex-col">
        <ul className="shrink-0 max-h-[45%] overflow-y-auto border-b border-primary py-1" aria-label="Archived versions">
          {versions.data.versions.map(version => (
            <li key={version.id}>
              <button
                type="button"
                onClick={() => setSelectedId(current => (current === version.id ? null : version.id))}
                aria-pressed={version.id === selectedId}
                className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-xs focus-ring rounded cursor-pointer ${
                  version.id === selectedId ? "bg-active text-primary" : "text-secondary hover:bg-hover"
                }`}
              >
                <span className="truncate">{formatDate(version.createdAt)}</span>
                <span className="text-muted shrink-0 tabular-nums">{formatSize(version.size)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex-1 min-h-0 flex flex-col">
          {!selected ? (
            <p className="p-3 text-xs text-muted">Select a version to preview it.</p>
          ) : content.error ? (
            <ErrorState title="Could not load this version" error={formatError(content.error)} onRetry={() => void content.mutate()} />
          ) : !content.data ? (
            <LoadingState message="Loading version…" size="sm" className="py-8" />
          ) : content.data.content === null ? (
            <p className="p-3 text-xs text-muted">This version is no longer available.</p>
          ) : (
            <>
              <pre className="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono text-secondary whitespace-pre" data-testid="file-version-preview">
                {content.data.content}
              </pre>
              <div className="shrink-0 border-t border-primary p-2">
                <Button icon={RotateCcw} onClick={() => void restore()} busy={restoring} busyLabel="Restoring…" fullWidth>
                  Restore this version
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <aside className="h-full flex flex-col min-h-0 border-l border-primary bg-secondary" aria-label="File versions">
      <div className="h-9 shrink-0 px-3 border-b border-primary bg-tertiary flex items-center gap-2">
        <History className="w-3.5 h-3.5 text-muted" aria-hidden />
        <span className="text-xs font-semibold text-muted uppercase tracking-widest flex-1">Versions</span>
        <IconButton icon={X} label="Close versions" variant="ghost" onClick={onClose} />
      </div>
      {body}
      <Dialog />
    </aside>
  );
}
