import { useOptionalLayoutApi } from "@tokenring-ai/one-frontend/layout/context.ts";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FILE_VIEW_ID } from "../ids.ts";
import { filesPath } from "./paths.ts";

/**
 * Opens a workspace file from anywhere (the chat's file browser lives in every
 * app): in the current app when it shows files, else in the Files app.
 */
export function useOpenWorkspaceFile(): (path: string) => void {
  const api = useOptionalLayoutApi();
  const navigate = useNavigate();
  return useCallback(
    (path: string) => {
      if (api?.app.views.includes(FILE_VIEW_ID)) api.open(FILE_VIEW_ID, { fileId: path });
      else void navigate(filesPath(path));
    },
    [api, navigate],
  );
}
