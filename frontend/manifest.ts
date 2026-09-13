import type { PluginAppManifest } from "@tokenring-ai/one-frontend/plugins/types.ts";
import { FolderOpen } from "lucide-react";

/**
 * Metadata for the files app shipped by this plugin. The frontend merges
 * this into its app registry and derives the SPA server routes from it.
 */
export default {
  id: "files",
  path: "/files",
  label: "Files",
  shortLabel: "FI",
  description: "Browse and manage your filesystem",
  group: "Data & tools",
  icon: FolderOpen,
  iconClass: "text-blue-500",
  gradient: "from-blue-500 to-blue-700",
  defaultPinned: true,
} satisfies PluginAppManifest;
