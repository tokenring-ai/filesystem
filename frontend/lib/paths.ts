import { isLikelyTextFile } from "../features/filesystem/fsUtils.ts";
import { FILE_EDITOR_VIEW, FILE_PREVIEW_VIEW } from "../manifest.ts";

/** React-free route helpers shared by the dashboard definition and the views. */

export const FILES_ROOT = "/files";

export function filesPath(path: string | null | undefined): string {
  return path ? `${FILES_ROOT}/${encodeURIComponent(path)}` : FILES_ROOT;
}

/** Which view shows a file: text files get the editor, everything else the preview pane. */
export function viewForFile(path: string): string {
  return isLikelyTextFile(path) ? FILE_EDITOR_VIEW : FILE_PREVIEW_VIEW;
}
