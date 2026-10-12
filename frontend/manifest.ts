import type { ViewManifest } from "@tokenring-ai/one-frontend/dock/types.ts";
import type { PluginFrontendManifest } from "@tokenring-ai/one-frontend/plugins/types.ts";
import { FileText, FolderOpen, FolderTree, Info } from "lucide-react";

export const FILES_DASHBOARD_ID = "files";

export const FILE_TREE_VIEW = "file-tree";
export const FILE_EDITOR_VIEW = "file-editor";
export const FILE_PREVIEW_VIEW = "file-preview";

/** Navigator: directory listing, search, breadcrumbs and file actions. */
export const fileTreeViewManifest = {
  id: FILE_TREE_VIEW,
  title: "Files",
  description: "Browse, search and manage workspace files",
  icon: FolderTree,
  availableOn: ["home", "any"],
  defaultSize: { width: 320, height: 400 },
  minimumSize: { width: 240, height: 160 },
  tags: ["files"],
} satisfies ViewManifest;

/** One editor per file; without a `path` the panel waits for a file to be picked. */
export const fileEditorViewManifest = {
  id: FILE_EDITOR_VIEW,
  title: "Editor",
  description: "Edit a text file",
  icon: FileText,
  availableOn: ["any"],
  instanceable: true,
  renderer: "always",
  defaultSize: { width: 720, height: 480 },
  minimumSize: { width: 320, height: 200 },
  tags: ["files"],
} satisfies ViewManifest;

/** Preview and metadata for one file (images, binaries, or the details of a text file). */
export const filePreviewViewManifest = {
  id: FILE_PREVIEW_VIEW,
  title: "Preview",
  description: "Preview and metadata for a file",
  icon: Info,
  availableOn: [],
  instanceable: true,
  defaultSize: { width: 400, height: 480 },
  minimumSize: { width: 260, height: 200 },
  tags: ["files"],
} satisfies ViewManifest;

/** Views that act as the Files dashboard's navigator; editors never tab into their group. */
export const FILES_SIDEBAR_VIEWS: readonly string[] = [FILE_TREE_VIEW];

/**
 * Metadata for the files dashboard shipped by this plugin. The frontend
 * merges this into its registry and derives the SPA server routes from it.
 */
export default {
  id: FILES_DASHBOARD_ID,
  path: "/files",
  label: "Files",
  shortLabel: "FI",
  description: "Browse and manage your filesystem",
  group: "Data & tools",
  icon: FolderOpen,
  iconClass: "text-blue-500",
  gradient: "from-blue-500 to-blue-700",
  defaultPinned: true,
  views: [fileTreeViewManifest, fileEditorViewManifest, filePreviewViewManifest],
} satisfies PluginFrontendManifest;
