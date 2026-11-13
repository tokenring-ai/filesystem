import type { ViewProps } from "@tokenring-ai/one-frontend/layout/define.ts";
import { isLikelyTextFile } from "../features/filesystem/fsUtils.ts";
import FileEditorTab from "./FileEditorTab.tsx";
import FilePreviewTab from "./FilePreviewTab.tsx";

/** One file per tab: text files open in the editor, everything else in the preview pane. */
export default function FilePane({ params }: ViewProps) {
  const path = params.fileId ?? "";
  return isLikelyTextFile(path) ? <FileEditorTab key={path} path={path} /> : <FilePreviewTab path={path} />;
}
