import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ParsedFileArchiveConfig } from "../schema.ts";

const MANIFEST_NAME = "manifest.json";

export interface ArchivedVersionSummary {
  id: string;
  createdAt: string;
  size: number;
}

interface ArchiveManifest {
  versions: ArchivedVersionSummary[];
  /** Hash of the most recently archived content, for deduping no-op rewrites. */
  lastHash?: string | undefined;
}

const ManifestSchema = z.object({
  versions: z.array(
    z.object({
      id: z.string(),
      createdAt: z.string(),
      size: z.number(),
    }),
  ),
  lastHash: z.string().optional(),
});

/** Paths that are never archived, relative to the workspace. */
const BUILTIN_EXCLUDES = [".git/", "node_modules/", ".archive/"];

function isExcluded(workspaceRelativePath: string, config: ParsedFileArchiveConfig): boolean {
  const normalized = workspaceRelativePath.split(path.sep).join("/");
  if (BUILTIN_EXCLUDES.some(prefix => normalized.startsWith(prefix) || normalized === prefix.replace("/", ""))) return true;
  return config.exclude.some(pattern => {
    try {
      return new RegExp(pattern).test(normalized);
    } catch {
      return false;
    }
  });
}

export function workspaceRelativePath(absolutePath: string, workspaceDirectory: string): string | null {
  const relative = path.relative(workspaceDirectory, absolutePath);
  if (!relative || relative === "." || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/");
}

/** Name of the directory (beside the workspace archive directory) that holds archives of files outside the workspace. */
export function externalArchiveDirectoryName(config: ParsedFileArchiveConfig): string {
  return `${config.directory}-external`;
}

/**
 * Where the versions of one file live, or null when the file is never archived.
 *
 * Files inside the workspace keep `<workspace>/<archive>/<relative path>`. Files anywhere else (other allowed
 * paths) are keyed by their absolute path under `<workspace>/<archive>-external/<hash>-<name>`, so the same
 * name in two places cannot collide and nothing is ever written into the project itself.
 *
 * `excludeRelativePath` is the path the exclude rules are matched against for files outside the workspace
 * (relative to the allowed path that covers them); without it such files are matched on their absolute path.
 */
export function archiveDirectoryFor(
  config: ParsedFileArchiveConfig,
  workspaceDirectory: string,
  absolutePath: string,
  excludeRelativePath?: string,
): string | null {
  const relative = workspaceRelativePath(absolutePath, workspaceDirectory);
  if (relative) {
    if (isExcluded(relative, config) || relative.startsWith(`${externalArchiveDirectoryName(config)}/`)) return null;
    return path.join(workspaceDirectory, config.directory, relative);
  }
  if (!path.isAbsolute(absolutePath)) return null;
  const normalized = path.resolve(absolutePath);
  const forExcludes = (excludeRelativePath ?? normalized).split(path.sep).join("/").replace(/^\/+/, "");
  if (!forExcludes || isExcluded(forExcludes, config)) return null;
  const key = createHash("sha1").update(normalized).digest("hex").slice(0, 16);
  return path.join(workspaceDirectory, externalArchiveDirectoryName(config), `${key}-${path.basename(normalized)}`);
}

function contentHash(content: Buffer): string {
  return createHash("sha1").update(content).digest("hex");
}

async function readManifest(archiveDir: string): Promise<ArchiveManifest> {
  try {
    return ManifestSchema.parse(JSON.parse(await fs.readFile(path.join(archiveDir, MANIFEST_NAME), "utf8")));
  } catch {
    return { versions: [] };
  }
}

/**
 * Archives `previousContent` as the version that is about to be overwritten.
 * Dedupes identical consecutive content, prunes beyond `maxVersions`, and
 * never throws — archiving must not break the write that follows it.
 */
export async function archivePreviousVersion(options: {
  config: ParsedFileArchiveConfig;
  workspaceDirectory: string;
  absolutePath: string;
  previousContent: Buffer;
  /** Path used for exclude rules when the file is outside the workspace (relative to its allowed path). */
  excludeRelativePath?: string | undefined;
}): Promise<void> {
  try {
    const { config, workspaceDirectory, absolutePath, previousContent, excludeRelativePath } = options;
    const archiveDir = archiveDirectoryFor(config, workspaceDirectory, absolutePath, excludeRelativePath);
    if (!archiveDir) return;

    const hash = contentHash(previousContent);
    const manifest = await readManifest(archiveDir);
    if (manifest.lastHash === hash) return; // Rewriting identical content archives nothing new.

    await fs.mkdir(archiveDir, { recursive: true });
    const id = `v${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const stat = await fs.stat(absolutePath).catch(() => null);
    const fileName = `${id}${path.extname(absolutePath)}`;
    await fs.writeFile(path.join(archiveDir, fileName), previousContent);

    const versions = [{ id, createdAt: (stat?.mtime ?? new Date()).toISOString(), size: previousContent.length }, ...manifest.versions].slice(
      0,
      config.maxVersions,
    );

    // Prune snapshot files that fell out of the retention window.
    const keptIds = new Set(versions.map(version => version.id));
    for (const version of manifest.versions) {
      if (keptIds.has(version.id)) continue;
      await fs.rm(path.join(archiveDir, `${version.id}${path.extname(absolutePath)}`), { force: true });
    }

    await fs.writeFile(path.join(archiveDir, MANIFEST_NAME), JSON.stringify({ versions, lastHash: hash }, null, 2));
  } catch {
    // Archiving is best-effort; never surface failures to the write path.
  }
}

/** Archived versions for one file, newest first. */
export async function listArchivedVersions(
  config: ParsedFileArchiveConfig,
  workspaceDirectory: string,
  absolutePath: string,
  excludeRelativePath?: string,
): Promise<ArchivedVersionSummary[]> {
  const archiveDir = archiveDirectoryFor(config, workspaceDirectory, absolutePath, excludeRelativePath);
  if (!archiveDir) return [];
  const manifest = await readManifest(archiveDir);
  return manifest.versions;
}

/** Content of one archived version, or null when it does not exist. */
export async function readArchivedVersion(
  config: ParsedFileArchiveConfig,
  workspaceDirectory: string,
  absolutePath: string,
  versionId: string,
  excludeRelativePath?: string,
): Promise<Buffer | null> {
  const archiveDir = archiveDirectoryFor(config, workspaceDirectory, absolutePath, excludeRelativePath);
  if (!archiveDir) return null;
  const manifest = await readManifest(archiveDir);
  if (!manifest.versions.some(version => version.id === versionId)) return null;
  try {
    return await fs.readFile(path.join(archiveDir, `${versionId}${path.extname(absolutePath)}`));
  } catch {
    return null;
  }
}
