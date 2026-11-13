import type { AppManifest } from "@tokenring-ai/one-frontend/layout/types.ts";
import type { PluginLayoutManifest } from "@tokenring-ai/one-frontend/plugins/layoutTypes.ts";
import { FolderOpen } from "lucide-react";
import { FILE_START_VIEW_ID, FILE_TREE_VIEW_ID, FILE_VIEW_ID, FILE_VIEW_KIND, FILES_APP_ID, FILES_APP_PATH } from "./ids.ts";

/**
 * Files: the file tree on the left; one tab per open file (editor or preview)
 * on the right. Routes: `/files` and `/files/<encoded path>`.
 */
export const FILES_APP: AppManifest = {
  id: FILES_APP_ID,
  path: FILES_APP_PATH,
  label: "Files",
  shortLabel: "FI",
  description: "Browse and manage your filesystem",
  group: "Data & tools",
  icon: FolderOpen,
  iconClass: "text-blue-500",
  gradient: "from-blue-500 to-blue-700",
  defaultPinned: true,
  views: [FILE_TREE_VIEW_ID, FILE_START_VIEW_ID, FILE_VIEW_ID],
  primaryKind: FILE_VIEW_KIND,
  layout: {
    split: "row",
    sizes: [1, 3],
    children: [
      { presenter: "single", accepts: ["navigator"], items: [FILE_TREE_VIEW_ID] },
      { presenter: "tabs", accepts: [FILE_VIEW_KIND], items: [FILE_START_VIEW_ID], primary: true },
    ],
  },
};

export default {
  apps: [FILES_APP],
  kinds: [{ id: FILE_VIEW_KIND, label: "Files", plural: "files" }],
} satisfies PluginLayoutManifest;
