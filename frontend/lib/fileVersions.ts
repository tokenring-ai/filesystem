import { filesystemRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import useSWR from "swr";

/** SWR key prefix for a file's archived version list. */
const VERSIONS_KEY_PREFIX = "/filesystem/listFileVersions/";

export function fileVersionsKey(provider: string, path: string): string {
  return `${VERSIONS_KEY_PREFIX}${provider}\0${path}`;
}

/** Archived previous versions of a file, newest first (empty when archiving does not cover it). */
export function useFileVersions(provider: string | null, path: string | null) {
  return useSWR(provider && path ? fileVersionsKey(provider, path) : null, () => filesystemRPCClient.listFileVersions({ provider: provider!, path: path! }));
}

/** Text of one archived version (null content when it no longer exists). */
export function useFileVersionContent(provider: string | null, path: string | null, versionId: string | null) {
  return useSWR(provider && path && versionId ? `/filesystem/readFileVersion/${provider}\0${path}\0${versionId}` : null, () =>
    filesystemRPCClient.readFileVersion({ provider: provider!, path: path!, versionId: versionId! }),
  );
}
