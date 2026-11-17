import { PaneLink } from "@tokenring-ai/one-frontend/layout/links.tsx";
import { useRemoteMounts } from "@tokenring-ai/one-frontend/rpc.ts";
import { EmptyState, ErrorState, LoadingState, ViewShell } from "@tokenring-ai/one-frontend/ui";
import formatError from "@tokenring-ai/utility/error/formatError";
import { Cloud, HardDrive } from "lucide-react";
import { Link } from "react-router-dom";
import { REMOTE_FOLDER_VIEW_ID } from "../ids.ts";
import { remoteParams } from "../urls.ts";

/** The configured remote mounts (one per Google account with Drive, …). */
export default function RemoteMountsPane() {
  const mounts = useRemoteMounts();

  if (mounts.error && !mounts.data) {
    return <ErrorState title="Could not load remote stores" error={formatError(mounts.error)} onRetry={() => void mounts.mutate()} variant="page" />;
  }
  if (!mounts.data) return <LoadingState message="Loading remote stores…" className="h-full w-full" />;
  if (mounts.data.mounts.length === 0) {
    return (
      <EmptyState
        variant="page"
        icon={Cloud}
        title="No remote stores"
        hint={
          <>
            Remote stores appear here once configured: add <code>drive</code> to a Google account (<code>google.accounts.&lt;name&gt;.drive</code>), or list S3
            buckets under <code>aws.s3.buckets</code>.
          </>
        }
        action={
          <Link to="/configuration" className="text-xs font-medium text-accent hover:underline focus-ring rounded">
            Open configuration
          </Link>
        }
      />
    );
  }

  return (
    <ViewShell tone="sidebar" pad="compact">
      <ul aria-label="Remote stores" className="space-y-0.5">
        {mounts.data.mounts.map(mount => (
          <li key={mount.url}>
            <PaneLink
              view={REMOTE_FOLDER_VIEW_ID}
              params={remoteParams(mount.url)}
              preview
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-primary hover:bg-hover focus-ring"
            >
              <HardDrive className="w-4 h-4 shrink-0 text-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{mount.label}</span>
              {!mount.writable && <span className="shrink-0 text-[11px] text-muted">read-only</span>}
            </PaneLink>
          </li>
        ))}
      </ul>
    </ViewShell>
  );
}
