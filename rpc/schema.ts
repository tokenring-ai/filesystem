import { AgentNotFoundSchema } from "@tokenring-ai/agent/schema";
import type { RPCSchema } from "@tokenring-ai/rpc/types";
import { z } from "zod";

export default {
  name: "Filesystem RPC",
  path: "/rpc/filesystem",
  methods: {
    getFilesystemProviders: {
      type: "query",
      input: z.object({}),
      result: z.object({
        providers: z.array(z.string()),
      }),
    },

    readTextFile: {
      type: "query",
      input: z.object({
        provider: z.string(),
        path: z.string(),
      }),
      result: z.object({
        content: z.string().nullable(),
      }),
    },
    exists: {
      type: "query",
      input: z.object({
        provider: z.string(),
        path: z.string(),
      }),
      result: z.object({
        exists: z.boolean(),
      }),
    },
    stat: {
      type: "query",
      input: z.object({
        provider: z.string(),
        path: z.string(),
      }),
      result: z.object({
        stats: z.string(),
      }),
    },
    glob: {
      type: "query",
      input: z.object({
        provider: z.string(),
        pattern: z.string(),
      }),
      result: z.object({
        files: z.array(z.string()),
      }),
    },
    listDirectory: {
      type: "query",
      input: z.object({
        provider: z.string(),
        path: z.string(),
        showHidden: z.boolean().default(false),
        recursive: z.boolean().default(false),
      }),
      result: z.object({
        files: z.array(z.string()),
      }),
    },
    writeFile: {
      type: "mutation",
      input: z.object({
        provider: z.string(),
        path: z.string(),
        content: z.string(),
      }),
      result: z.object({
        success: z.boolean(),
      }),
    },
    appendFile: {
      type: "mutation",
      input: z.object({
        provider: z.string(),
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
        provider: z.string(),
        path: z.string(),
      }),
      result: z.object({
        success: z.boolean(),
      }),
    },
    rename: {
      type: "mutation",
      input: z.object({
        provider: z.string(),
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
        provider: z.string(),
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
        provider: z.string(),
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
        z.object({
          status: z.literal("success"),
          provider: z.string(),
          workingDirectory: z.string(),
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
        z.object({
          status: z.literal("success"),
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
        z.object({
          status: z.literal("success"),
          success: z.boolean(),
        }),
        AgentNotFoundSchema,
      ]),
    },
  },
} satisfies RPCSchema;
