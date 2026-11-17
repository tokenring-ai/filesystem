import type { AppManifest } from "@tokenring-ai/one-frontend/layout/types.ts";
import type { PluginLayoutManifest } from "@tokenring-ai/one-frontend/plugins/layoutTypes.ts";
import { Cloud, FolderOpen } from "lucide-react";
import { FILE_START_VIEW_ID, FILE_TREE_VIEW_ID, FILE_VIEW_ID, FILE_VIEW_KIND, FILES_APP_ID, FILES_APP_PATH } from "./ids.ts";
import {
  REMOTE_APP_ID,
  REMOTE_APP_PATH,
  REMOTE_FILE_VIEW_ID,
  REMOTE_FOLDER_VIEW_ID,
  REMOTE_MOUNTS_VIEW_ID,
  REMOTE_START_VIEW_ID,
  REMOTE_VIEW_KIND,
} from "./remote/ids.ts";

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

/**
 * Remote files: Google Drive and other URL-addressed stores, which are not the host's disk.
 * Mounts on the left; one tab per folder or file. Routes: `/remote/<scheme>/<mount>/{folder,file}/<id>`.
 */
export const REMOTE_APP: AppManifest = {
  id: REMOTE_APP_ID,
  path: REMOTE_APP_PATH,
  label: "Remote files",
  shortLabel: "RF",
  description: "Google Drive and other remote stores",
  group: "Data & tools",
  icon: Cloud,
  iconClass: "text-sky-500",
  gradient: "from-sky-500 to-sky-700",
  views: [REMOTE_MOUNTS_VIEW_ID, REMOTE_START_VIEW_ID, REMOTE_FOLDER_VIEW_ID, REMOTE_FILE_VIEW_ID],
  primaryKind: REMOTE_VIEW_KIND,
  layout: {
    split: "row",
    sizes: [1, 3],
    children: [
      { presenter: "single", accepts: ["navigator"], items: [REMOTE_MOUNTS_VIEW_ID] },
      { presenter: "tabs", accepts: [REMOTE_VIEW_KIND], items: [REMOTE_START_VIEW_ID], primary: true },
    ],
  },
};

export default {
  apps: [FILES_APP, REMOTE_APP],
  kinds: [
    { id: FILE_VIEW_KIND, label: "Files", plural: "files" },
    { id: REMOTE_VIEW_KIND, label: "Remote files", plural: "remote files" },
  ],
} satisfies PluginLayoutManifest;
