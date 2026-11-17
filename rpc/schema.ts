import type { RPCSchema } from "@tokenring-ai/rpc/types";
import { AgentNotFoundSchema, SuccessSchema } from "@tokenring-ai/rpc/types";
import { z } from "zod";
import { AllowedPathSchema as ConfigAllowedPathSchema, StatSchema } from "../schema.ts";

const AllowedPathSchema = ConfigAllowedPathSchema.omit({ provider: true });

export default {
  name: "Filesystem RPC",
  path: "/rpc/filesystem",
  methods: {
    getAllowedPaths: {
      type: "query",
      input: z.object({}),
      result: z.object({
        allowedPaths: z.array(AllowedPathSchema),
      }),
    },
    /** App-level directories the UI anchors on (launch dir for browsing/spawning, workspace dir for data). */
    getDefaultDirectories: {
      type: "query",
      input: z.object({}),
      result: z.object({
        workingDirectory: z.string(),
        workspaceDirectory: z.string(),
      }),
    },

    readTextFile: {
      type: "query",
      input: z.object({
        path: z.string(),
      }),
      result: z.object({
        content: z.string().nullable(),
      }),
    },
    /** Binary-safe file read for downloads (base64-encoded bytes). */
    readFileBase64: {
      type: "query",
      input: z.object({
        path: z.string(),
      }),
      result: z.object({
        contentBase64: z.string().nullable(),
      }),
    },
    exists: {
      type: "query",
      input: z.object({
        path: z.string(),
      }),
      result: z.object({
        exists: z.boolean(),
      }),
    },
    stat: {
      type: "query",
      input: z.object({
        path: z.string(),
      }),
      result: z.object({
        stats: StatSchema,
      }),
    },
    glob: {
      type: "query",
      input: z.object({
        pattern: z.string(),
      }),
      result: z.object({
        files: z.array(z.string()),
      }),
    },
    searchWorkspaceFiles: {
      type: "query",
      input: z.object({
        query: z.string().default(""),
        limit: z.number().int().positive().default(48),
        /** When true, entries matched by .gitignore/.aiignore are excluded. */
        gitignore: z.boolean().default(false),
      }),
      result: z.object({
        files: z.array(z.string()),
        totalMatches: z.number(),
      }),
    },
    listDirectory: {
      type: "query",
      input: z.object({
        path: z.string(),
        showHidden: z.boolean().default(false),
        recursive: z.boolean().default(false),
        /** When true, entries matched by .gitignore/.aiignore are excluded. */
        gitignore: z.boolean().default(false),
      }),
      result: z.object({
        files: z.array(z.string()),
      }),
    },
    writeFile: {
      type: "mutation",
      input: z.object({
        path: z.string(),
        content: z.string(),
        /** How `content` is encoded. `base64` is decoded to raw bytes before writing. */
        encoding: z.enum(["utf8", "base64"]).default("utf8"),
      }),
      result: z.object({
        success: z.boolean(),
      }),
    },
    appendFile: {
      type: "mutation",
      input: z.object({
        path: z.string(),
        content: z.string(),
      }),
      result: z.object({
        success: z.boolean(),
      }),
    },
    deleteFile: {
      type: "mutation",
      input: z.object({
        path: z.string(),
      }),
      result: z.object({
        success: z.boolean(),
      }),
    },
    /**
     * Recursively delete a directory. The path must be write-allowed; allowed
     * roots, the workspace/working directory and their ancestors are refused.
     */
    deleteDirectory: {
      type: "mutation",
      input: z.object({
        path: z.string(),
      }),
      result: z.object({
        success: z.boolean(),
      }),
    },
    /** What a recursive delete would remove (counted up to a cap; `truncated` when the cap was hit). */
    countDirectoryEntries: {
      type: "query",
      input: z.object({
        path: z.string(),
      }),
      result: z.object({
        files: z.number(),
        directories: z.number(),
        truncated: z.boolean(),
      }),
    },
    /** Search file contents under a directory (read-allowed), returning file:line matches. */
    searchFileContents: {
      type: "query",
      input: z.object({
        /** Absolute directory to search. */
        path: z.string(),
        query: z.string().min(1),
        limit: z.number().int().positive().max(1000).default(200),
        ignoreCase: z.boolean().default(true),
        /** When true, entries matched by .gitignore/.aiignore are skipped. */
        gitignore: z.boolean().default(true),
        includeHidden: z.boolean().default(false),
      }),
      result: z.object({
        matches: z.array(
          z.object({
            file: z.string(),
            line: z.number(),
            /** The matching line, trimmed to a display length. */
            match: z.string(),
          }),
        ),
        /** True when more matches exist than were returned. */
        truncated: z.boolean(),
      }),
    },
    /** Archived previous versions of a file, newest first (empty when archiving does not cover it). */
    listFileVersions: {
      type: "query",
      input: z.object({
        path: z.string(),
      }),
      result: z.object({
        versions: z.array(
          z.object({
            id: z.string(),
            createdAt: z.string(),
            size: z.number(),
          }),
        ),
      }),
    },
    /** Text content of one archived version, or null when it does not exist. */
    readFileVersion: {
      type: "query",
      input: z.object({
        path: z.string(),
        versionId: z.string(),
      }),
      result: z.object({
        content: z.string().nullable(),
      }),
    },
    rename: {
      type: "mutation",
      input: z.object({
        oldPath: z.string(),
        newPath: z.string(),
      }),
      result: z.object({
        success: z.boolean(),
      }),
    },
    createDirectory: {
      type: "mutation",
      input: z.object({
        path: z.string(),
        recursive: z.boolean().default(false),
      }),
      result: z.object({
        success: z.boolean(),
      }),
    },
    copy: {
      type: "mutation",
      input: z.object({
        source: z.string(),
        destination: z.string(),
        overwrite: z.boolean().default(false),
      }),
      result: z.object({
        success: z.boolean(),
      }),
    },
    getFilesystemState: {
      type: "query",
      input: z.object({
        agentId: z.string(),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          allowedPaths: z.array(AllowedPathSchema),
          selectedFiles: z.array(z.string()),
          readFiles: z.record(z.string(), z.number()),
          dirty: z.boolean(),
        }),
        AgentNotFoundSchema,
      ]),
    },
    streamFilesystemState: {
      type: "stream",
      input: z.object({
        agentId: z.string(),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          allowedPaths: z.array(AllowedPathSchema),
          selectedFiles: z.array(z.string()),
          readFiles: z.record(z.string(), z.number()),
          dirty: z.boolean(),
        }),
        AgentNotFoundSchema,
      ]),
    },
    addFileToChat: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        file: z.string(),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          success: z.boolean(),
        }),
        AgentNotFoundSchema,
      ]),
    },
    removeFileFromChat: {
      type: "mutation",
      input: z.object({
        agentId: z.string(),
        file: z.string(),
      }),
      result: z.discriminatedUnion("status", [
        SuccessSchema.extend({
          success: z.boolean(),
        }),
        AgentNotFoundSchema,
      ]),
    },
  },
} satisfies RPCSchema;
