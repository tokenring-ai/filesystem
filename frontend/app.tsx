import type { PluginAppDefinition } from "@tokenring-ai/one-frontend/plugins/types.ts";
import FilesApp from "./FilesApp.tsx";
import manifest from "./manifest.ts";

/**
 * The files app contributed to the TokenRing One frontend by this
 * plugin. Discovered by `frontend/src/plugins/registry.ts`.
 */
export default {
  ...manifest,
  routePath: "/files/:fileId?",
  component: FilesApp,
} satisfies PluginAppDefinition;
