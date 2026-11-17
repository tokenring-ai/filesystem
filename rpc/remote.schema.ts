import type { RPCSchema } from "@tokenring-ai/rpc/types";
import { z } from "zod";

const RemoteEntrySchema = z.object({
  url: z.string(),
  name: z.string(),
  kind: z.enum(["file", "folder"]),
  mimeType: z.string().optional(),
  size: z.number().optional(),
  modified: z.string().optional(),
  webUrl: z.string().optional(),
  readsAs: z.string().optional(),
});

const RemoteMountSchema = z.object({
  scheme: z.string(),
  authority: z.string(),
  url: z.string(),
  label: z.string(),
  writable: z.boolean(),
  contextualSearch: z.boolean(),
});

/** Remote stores (Google Drive, …), addressed by URL. Separate from the host filesystem RPC. */
export default {
  name: "Remote Store RPC",
  path: "/rpc/remote",
  methods: {
    listMounts: {
      type: "query",
      input: z.object({}),
      result: z.object({
        stores: z.array(z.object({ scheme: z.string(), label: z.string() })),
        mounts: z.array(RemoteMountSchema),
      }),
    },
    list: {
      type: "query",
      input: z.object({ url: z.string(), cursor: z.string().optional() }),
      result: z.object({ entries: z.array(RemoteEntrySchema), cursor: z.string().optional() }),
    },
    stat: {
      type: "query",
      input: z.object({ url: z.string() }),
      result: z.object({ entry: RemoteEntrySchema.nullable() }),
    },
    /** Text comes back as utf8; anything else as base64. */
    read: {
      type: "query",
      input: z.object({ url: z.string() }),
      result: z.object({
        name: z.string(),
        mimeType: z.string(),
        size: z.number(),
        encoding: z.enum(["utf8", "base64"]),
        content: z.string(),
      }),
    },
    search: {
      type: "query",
      input: z.object({ query: z.string(), within: z.string().optional(), limit: z.number().int().min(1).max(200).default(50) }),
      result: z.object({ entries: z.array(RemoteEntrySchema) }),
    },
    /** Copies a remote file onto the host (owner access from the UI, like the filesystem RPC). */
    copyToHost: {
      type: "mutation",
      input: z.object({ url: z.string(), path: z.string(), overwrite: z.boolean().default(false) }),
      result: z.object({ path: z.string(), size: z.number() }),
    },
  },
} satisfies RPCSchema;
