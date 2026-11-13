import { defineView } from "@tokenring-ai/one-frontend/layout/define.ts";
import type { PluginLayoutViews } from "@tokenring-ai/one-frontend/plugins/layoutTypes.ts";
import { FileText, FolderTree } from "lucide-react";
import { lazy } from "react";
import { getBasename } from "./features/filesystem/fsUtils.ts";
import { FILE_START_VIEW_ID, FILE_TREE_VIEW_ID, FILE_VIEW_ID, FILE_VIEW_KIND } from "./ids.ts";

const FileTreePane = lazy(() => import("./panes/FileTreePane.tsx"));
const FileStartPane = lazy(() => import("./panes/FileStartPane.tsx"));
const FilePane = lazy(() => import("./panes/FilePane.tsx"));

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
      title: "Editor",
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
  ],
} satisfies PluginLayoutViews;
