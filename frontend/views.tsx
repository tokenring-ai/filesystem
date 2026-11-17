import { defineView } from "@tokenring-ai/one-frontend/layout/define.ts";
import type { PluginLayoutViews } from "@tokenring-ai/one-frontend/plugins/layoutTypes.ts";
import { Cloud, File, FileText, Folder, FolderTree } from "lucide-react";
import { lazy } from "react";
import { getBasename } from "./features/filesystem/fsUtils.ts";
import { FILE_START_VIEW_ID, FILE_TREE_VIEW_ID, FILE_VIEW_ID, FILE_VIEW_KIND } from "./ids.ts";
import { REMOTE_FILE_VIEW_ID, REMOTE_FOLDER_VIEW_ID, REMOTE_MOUNTS_VIEW_ID, REMOTE_START_VIEW_ID, REMOTE_VIEW_KIND } from "./remote/ids.ts";

const FileTreePane = lazy(() => import("./panes/FileTreePane.tsx"));
const FileStartPane = lazy(() => import("./panes/FileStartPane.tsx"));
const FilePane = lazy(() => import("./panes/FilePane.tsx"));
const RemoteMountsPane = lazy(() => import("./remote/panes/RemoteMountsPane.tsx"));
const RemoteStartPane = lazy(() => import("./remote/panes/RemoteStartPane.tsx"));
const RemoteFolderPane = lazy(() => import("./remote/panes/RemoteFolderPane.tsx"));
const RemoteFilePane = lazy(() => import("./remote/panes/RemoteFilePane.tsx"));

export default {
  views: [
    // Navigator: directory listing, search, breadcrumbs and file actions.
    defineView({
      id: FILE_TREE_VIEW_ID,
      kind: "navigator",
      title: "Files",
      description: "Browse, search and manage workspace files",
      icon: FolderTree,
      closable: false,
      component: FileTreePane,
    }),
    // `/files`: the "No file open" landing tab; closes once a file is opened.
    defineView({
      id: FILE_START_VIEW_ID,
      landing: true,
      kind: FILE_VIEW_KIND,
      title: "Open a file",
      description: "Pick a file to open",
      icon: FileText,
      route: "",
      instanceKey: () => "",
      component: FileStartPane,
    }),
    // `/files/<encoded path>`: one tab per file. The id keeps its slashes, which react-router encodes and decodes.
    defineView({
      id: FILE_VIEW_ID,
      kind: FILE_VIEW_KIND,
      title: params => (params.fileId ? getBasename(params.fileId) : "File"),
      description: "Edit a text file, or preview any other file",
      icon: FileText,
      route: ":fileId",
      instanceKey: params => params.fileId ?? "",
      component: FilePane,
    }),
    // Remote files app: mounts, then one tab per remote folder or file. The splat is the URL's path:
    // a Drive file id, or an S3 key such as reports/2026/q1.csv.
    defineView({
      id: REMOTE_MOUNTS_VIEW_ID,
      kind: "navigator",
      title: "Remote stores",
      description: "Google Drive and other remote stores",
      icon: Cloud,
      closable: false,
      component: RemoteMountsPane,
    }),
    defineView({
      id: REMOTE_START_VIEW_ID,
      landing: true,
      kind: REMOTE_VIEW_KIND,
      title: "Remote files",
      description: "Pick a remote store",
      icon: Cloud,
      route: "",
      instanceKey: () => "",
      component: RemoteStartPane,
    }),
    defineView({
      id: REMOTE_FOLDER_VIEW_ID,
      kind: REMOTE_VIEW_KIND,
      title: "Folder",
      description: "A folder in a remote store",
      icon: Folder,
      route: ":scheme/:authority/folder/*",
      instanceKey: params => `${params.scheme}/${params.authority}/${params["*"] ?? ""}`,
      component: RemoteFolderPane,
    }),
    defineView({
      id: REMOTE_FILE_VIEW_ID,
      kind: REMOTE_VIEW_KIND,
      title: "File",
      description: "A file in a remote store",
      icon: File,
      route: ":scheme/:authority/file/*",
      instanceKey: params => `${params.scheme}/${params.authority}/${params["*"] ?? ""}`,
      component: RemoteFilePane,
    }),
  ],
} satisfies PluginLayoutViews;
