import { filesystemRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import useSWR from "swr";

/** SWR key prefix for a file's archived version list. */
const VERSIONS_KEY_PREFIX = "/filesystem/listFileVersions/";

export function fileVersionsKey(path: string): string {
  return `${VERSIONS_KEY_PREFIX}${path}`;
}

/** Archived previous versions of a file, newest first (empty when archiving does not cover it). */
export function useFileVersions(path: string | null) {
  return useSWR(path ? fileVersionsKey(path) : null, () => filesystemRPCClient.listFileVersions({ path: path! }));
}

/** Text of one archived version (null content when it no longer exists). */
export function useFileVersionContent(path: string | null, versionId: string | null) {
  return useSWR(path && versionId ? `/filesystem/readFileVersion/${path}\0${versionId}` : null, () =>
    filesystemRPCClient.readFileVersion({ path: path!, versionId: versionId! }),
  );
}
