/** React-free route helpers shared by the dashboard definition and the views. */

export const FILES_ROOT = "/files";

export function filesPath(path: string | null | undefined): string {
  return path ? `${FILES_ROOT}/${encodeURIComponent(path)}` : FILES_ROOT;
}
