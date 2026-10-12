import { openInMainArea } from "@tokenring-ai/one-frontend/dock/layout/mainArea.ts";
import type { PluginFrontendContribution } from "@tokenring-ai/one-frontend/plugins/types.ts";
import { lazy } from "react";
import { z } from "zod";
import { filesPath, viewForFile } from "./lib/paths.ts";
import manifest, {
  FILE_EDITOR_VIEW,
  FILE_PREVIEW_VIEW,
  FILES_SIDEBAR_VIEWS,
  fileEditorViewManifest,
  filePreviewViewManifest,
  fileTreeViewManifest,
} from "./manifest.ts";

export const FileEditorParams = z.object({
  /** Omitted for an empty editor panel that the next opened file fills. */
  path: z.string().min(1).optional(),
});
export type FileEditorParams = z.infer<typeof FileEditorParams>;

export const FilePreviewParams = z.object({ path: z.string().min(1) });
export type FilePreviewParams = z.infer<typeof FilePreviewParams>;

function basename(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  return trimmed.split("/").pop() || trimmed;
}

/**
 * The Files dashboard: a file tree beside one editor (or preview) panel per
 * open file. `/files/<path>` opens that file; the active panel keeps the URL
 * in step. Discovered by `frontend/src/plugins/registry.ts`.
 */
export default {
  ...manifest,
  views: [
    { ...fileTreeViewManifest, component: lazy(() => import("./views/FileTreeView.tsx")) },
    {
      ...fileEditorViewManifest,
      params: FileEditorParams,
      instanceKey: params => params.path ?? "new",
      titleFor: params => (params.path ? basename(params.path) : "Editor"),
      component: lazy(() => import("./views/FileEditorView.tsx")),
    },
    {
      ...filePreviewViewManifest,
      params: FilePreviewParams,
      instanceKey: params => params.path,
      titleFor: params => basename(params.path),
      component: lazy(() => import("./views/FilePreviewView.tsx")),
    },
  ],
  dashboards: [
    {
      ...manifest,
      routePath: "/files/:fileId?",
      defaultLayout: {
        kind: "row",
        sizes: [1, 3],
        children: [
          { kind: "panel", view: fileTreeViewManifest.id },
          { kind: "panel", view: fileEditorViewManifest.id },
        ],
      },
      onNavigate({ params }, api) {
        const path = params.fileId;
        if (!path) return;
        const view = viewForFile(path);
        openInMainArea(api, view, { path }, { sidebarViews: FILES_SIDEBAR_VIEWS, fillPlaceholder: view === FILE_EDITOR_VIEW });
      },
      pathForActivePanel(panel) {
        if (panel?.viewId !== FILE_EDITOR_VIEW && panel?.viewId !== FILE_PREVIEW_VIEW) return null;
        const path = panel.params.path;
        return filesPath(typeof path === "string" ? path : null);
      },
      documentTitle: ({ params }) => (params.fileId ? `${basename(params.fileId)} · Files` : "Files"),
    },
  ],
} satisfies PluginFrontendContribution;
