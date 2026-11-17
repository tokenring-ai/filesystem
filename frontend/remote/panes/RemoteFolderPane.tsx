import { usePanelTitle } from "@tokenring-ai/one-frontend/apps/panelHooks.ts";
import type { ViewProps } from "@tokenring-ai/one-frontend/layout/define.ts";
import { PaneLink } from "@tokenring-ai/one-frontend/layout/links.tsx";
import { useRemoteEntry, useRemoteListing, useRemoteMounts } from "@tokenring-ai/one-frontend/rpc.ts";
import { Button, EmptyState, ErrorState, LoadingState, ViewShell } from "@tokenring-ai/one-frontend/ui";
import formatError from "@tokenring-ai/utility/error/formatError";
import { ExternalLink, File, Folder, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { REMOTE_FILE_VIEW_ID, REMOTE_FOLDER_VIEW_ID } from "../ids.ts";
import { formatBytes, remoteParams, remoteUrl, storeLabel } from "../urls.ts";

type Entry = NonNullable<ReturnType<typeof useRemoteListing>["data"]>["entries"][number];

function Page({ url, cursor, onMore }: { url: string; cursor: string | undefined; onMore: ((cursor: string) => void) | null }) {
  const listing = useRemoteListing(url, cursor);
  if (listing.error && !listing.data) {
    return <ErrorState title="Could not list this folder" error={formatError(listing.error)} onRetry={() => void listing.mutate()} />;
  }
  if (!listing.data) return <LoadingState size="sm" className="py-6" />;
  const next = listing.data.cursor;
  return (
    <>
      {listing.data.entries.map(entry => (
        <Row key={entry.url} entry={entry} />
      ))}
      {next && onMore && (
        <li className="px-3 py-2">
          <Button variant="ghost" onClick={() => onMore(next)}>
            Load more
          </Button>
        </li>
      )}
    </>
  );
}

function Row({ entry }: { entry: Entry }) {
  const folder = entry.kind === "folder";
  const Icon = folder ? Folder : File;
  return (
    <li>
      <PaneLink
        view={folder ? REMOTE_FOLDER_VIEW_ID : REMOTE_FILE_VIEW_ID}
        params={remoteParams(entry.url)}
        preview={folder}
        className="flex items-center gap-3 px-3 py-1.5 text-sm hover:bg-hover focus-ring"
      >
        <Icon className="w-4 h-4 shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-primary">{entry.name}</span>
        <span className="shrink-0 text-xs text-muted tabular-nums">{folder ? "" : formatBytes(entry.size)}</span>
        <span className="hidden sm:block w-28 shrink-0 text-right text-xs text-muted">
          {entry.modified ? new Date(entry.modified).toLocaleDateString() : ""}
        </span>
      </PaneLink>
    </li>
  );
}

/** One remote folder. Large folders load page by page. */
export default function RemoteFolderPane({ params }: ViewProps) {
  const url = remoteUrl(params);
  const stores = useRemoteMounts().data?.stores;
  const entry = useRemoteEntry(url);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const name = entry.data?.entry?.name;

  useEffect(() => setCursors([undefined]), [url]);
  usePanelTitle(name ?? null);

  if (!url) return <EmptyState variant="page" icon={FolderOpen} title="Not a remote folder" />;

  return (
    <ViewShell
      scroll
      header={
        <div className="flex items-center gap-2 px-3 h-10 border-b border-primary">
          <FolderOpen className="w-4 h-4 text-muted" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">{name ?? url}</span>
          {entry.data?.entry?.webUrl && (
            <a
              href={entry.data.entry.webUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-accent hover:underline focus-ring rounded"
            >
              <ExternalLink className="w-3 h-3" aria-hidden="true" /> Open in {storeLabel(stores, params.scheme)}
            </a>
          )}
        </div>
      }
    >
      <ul aria-label={`Contents of ${name ?? url}`} className="divide-y divide-line-subtle">
        {cursors.map((cursor, index) => (
          <Page
            key={cursor ?? "first"}
            url={url}
            cursor={cursor}
            onMore={index === cursors.length - 1 ? next => setCursors(current => [...current, next]) : null}
          />
        ))}
      </ul>
    </ViewShell>
  );
}
