import { usePanelTitle } from "@tokenring-ai/one-frontend/apps/panelHooks.ts";
import type { ViewProps } from "@tokenring-ai/one-frontend/layout/define.ts";
import { remoteRPCClient, useDefaultDirectories, useRemoteContent, useRemoteEntry, useRemoteMounts } from "@tokenring-ai/one-frontend/rpc.ts";
import { Button, EmptyState, ErrorState, LoadingState, TextField, toastManager, ViewShell } from "@tokenring-ai/one-frontend/ui";
import formatError from "@tokenring-ai/utility/error/formatError";
import { Copy, Download, ExternalLink, File } from "lucide-react";
import { type SubmitEvent, useEffect, useState } from "react";
import { formatBytes, remoteUrl, storeLabel } from "../urls.ts";

type Content = NonNullable<ReturnType<typeof useRemoteContent>["data"]>;

function toBlob(content: Content): Blob {
  const bytes = content.encoding === "base64" ? Uint8Array.from(atob(content.content), c => c.charCodeAt(0)) : new TextEncoder().encode(content.content);
  return new Blob([bytes], { type: content.mimeType });
}

function save(content: Content) {
  const href = URL.createObjectURL(toBlob(content));
  const link = document.createElement("a");
  link.href = href;
  link.download = content.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

function Preview({ content }: { content: Content }) {
  if (content.encoding === "utf8") {
    return <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-primary">{content.content}</pre>;
  }
  if (content.mimeType.startsWith("image/")) {
    return <img src={`data:${content.mimeType};base64,${content.content}`} alt={content.name} className="m-4 max-w-full" />;
  }
  return <EmptyState icon={File} title="No preview" hint={`${content.mimeType}, ${formatBytes(content.size)}. Download it, or copy it to the host.`} />;
}

/** Copies the file onto the host, by default into the launch directory. */
function CopyToHost({ url, name, onDone }: { url: string; name: string; onDone: () => void }) {
  const directories = useDefaultDirectories();
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = directories.data?.workingDirectory;

  useEffect(() => {
    if (working && !path) setPath(`${working.replace(/\/+$/, "")}/${name}`);
  }, [working, name, path]);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await remoteRPCClient.copyToHost({ url, path, overwrite: false });
      toastManager.success(`Copied to ${result.path}`, { duration: 4000 });
      onDone();
    } catch (cause: unknown) {
      setError(formatError(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={e => void submit(e)} className="flex items-end gap-2 px-3 py-2 border-b border-primary bg-sunken">
      <TextField label="Host path" value={path} onChange={setPath} mono className="flex-1" error={error} autoFocus />
      <Button type="submit" busy={busy} busyLabel="Copying…" disabled={!path.trim()}>
        Copy
      </Button>
      <Button variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </form>
  );
}

/** One remote file: a text or image preview, with download, copy to host and open in the store. */
export default function RemoteFilePane({ params }: ViewProps) {
  const url = remoteUrl(params);
  const stores = useRemoteMounts().data?.stores;
  const entry = useRemoteEntry(url);
  const content = useRemoteContent(url);
  const [copying, setCopying] = useState(false);
  const info = entry.data?.entry;

  usePanelTitle(info?.name ?? null);

  if (!url) return <EmptyState variant="page" icon={File} title="Not a remote file" />;

  return (
    <ViewShell
      scroll
      header={
        <>
          <div className="flex items-center gap-2 px-3 h-10 border-b border-primary">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">{info?.name ?? url}</span>
            {info?.readsAs && <span className="shrink-0 text-xs text-muted">exported as {info.readsAs}</span>}
            <Button variant="ghost" icon={Download} disabled={!content.data} onClick={() => content.data && save(content.data)}>
              Download
            </Button>
            <Button variant="ghost" icon={Copy} onClick={() => setCopying(true)}>
              Copy to host
            </Button>
            {info?.webUrl && (
              <a
                href={info.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-accent hover:underline focus-ring rounded"
              >
                <ExternalLink className="w-3 h-3" aria-hidden="true" /> Open in {storeLabel(stores, params.scheme)}
              </a>
            )}
          </div>
          {copying && <CopyToHost url={url} name={content.data?.name ?? info?.name ?? "download"} onDone={() => setCopying(false)} />}
        </>
      }
    >
      {content.error && !content.data ? (
        <ErrorState title="Could not open this file" error={formatError(content.error)} onRetry={() => void content.mutate()} />
      ) : content.data ? (
        <Preview content={content.data} />
      ) : (
        <LoadingState message="Loading…" className="h-full w-full" />
      )}
    </ViewShell>
  );
}
