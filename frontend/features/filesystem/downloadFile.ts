import { triggerDownloadFromUrl } from "@tokenring-ai/one-frontend/lib/triggerDownloadFromUrl.ts";
import { workspaceFileUrl } from "@tokenring-ai/one-frontend/lib/workspaceFileUrl.ts";
import { getBasename } from "./fsUtils.ts";

/**
 * Download a workspace file via the filesystem HTTP endpoint.
 */
export async function downloadWorkspaceFile(path: string): Promise<void> {
  const name = getBasename(path);
  await triggerDownloadFromUrl({
    url: workspaceFileUrl(path, { download: true }),
    filename: name,
  });
}
