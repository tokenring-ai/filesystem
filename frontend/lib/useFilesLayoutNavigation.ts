import { useLayoutApi } from "@tokenring-ai/one-frontend/layout/context.ts";
import { usePaneLink } from "@tokenring-ai/one-frontend/layout/hooks.ts";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FILE_VIEW_ID } from "../ids.ts";
import { FILES_ROOT, filesPath } from "./paths.ts";
import { type FilesHost, type UseFileMutationsResult, useFileMutationsCore } from "./useFileMutationsCore.tsx";

/** Opening a file navigates to `/files/<path>`; the engine opens and focuses its tab (and `FilePane` retires the landing tab). */
export function useOpenFile() {
  const open = usePaneLink();
  return useCallback((path: string) => open(FILE_VIEW_ID, { fileId: path }), [open]);
}

/** Create / rename / delete for the current directory, keeping open file tabs in step. */
export function useFileMutations(path: string | null, routeFile: string | null): UseFileMutationsResult {
  const api = useLayoutApi();
  const navigate = useNavigate();
  const open = usePaneLink();
  const openFile = useOpenFile();
  const host: FilesHost = {
    routeFile,
    openFile,
    listFilePanels: () =>
      Object.values(api.store.getState().panels).flatMap(panel =>
        panel.viewId === FILE_VIEW_ID && panel.params.fileId ? [{ panelId: panel.key, path: panel.params.fileId }] : [],
      ),
    closePanel: panelId => api.close(panelId),
    // A panel's params are fixed, so a renamed file gets a new tab (added in place, no focus) and the old one closes.
    repointPanel: (panelId, next) => {
      open(FILE_VIEW_ID, { fileId: next }, { focus: false });
      api.close(panelId);
    },
    replaceRoute: file => void navigate(file === null ? FILES_ROOT : filesPath(file), { replace: true }),
  };
  return useFileMutationsCore(host, path);
}
