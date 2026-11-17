import type TokenRingApp from "@tokenring-ai/app";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import FileSystemService from "../FileSystemService.ts";
import { isTextMimeType } from "../remote/RemoteStore.ts";
import RemoteStoreService from "../remote/RemoteStoreService.ts";
import { invalidateWorkspaceFileIndex } from "../util/workspaceFileIndex.ts";
import RemoteRpcSchema from "./remote.schema.ts";

/** Largest file the UI can pull through `read`; bigger ones go through `copyToHost`. */
const MAX_READ_BYTES = 20 * 1024 * 1024;

export default createRPCEndpoint(RemoteRpcSchema, {
  listMounts(_args, app: TokenRingApp) {
    const remote = app.requireService(RemoteStoreService);
    return Promise.resolve({ stores: remote.listStores(), mounts: remote.listMounts() });
  },

  async list(args, app: TokenRingApp) {
    return await app.requireService(RemoteStoreService).list(args.url, { cursor: args.cursor });
  },

  async stat(args, app: TokenRingApp) {
    return { entry: await app.requireService(RemoteStoreService).stat(args.url) };
  },

  async read(args, app: TokenRingApp) {
    const { name, mimeType, content } = await app.requireService(RemoteStoreService).read(args.url);
    if (content.length > MAX_READ_BYTES) {
      throw new Error(`${name} is ${content.length} bytes, too large to preview. Copy it to the host instead.`);
    }
    const text = isTextMimeType(mimeType);
    return { name, mimeType, size: content.length, encoding: text ? "utf8" : "base64", content: content.toString(text ? "utf-8" : "base64") };
  },

  async search(args, app: TokenRingApp) {
    return { entries: await app.requireService(RemoteStoreService).search(args.query, { within: args.within, limit: args.limit }) };
  },

  async copyToHost(args, app: TokenRingApp) {
    const fileSystem = app.requireService(FileSystemService);
    // The same allow-list as every other host write: copying from a remote store is not a way around it.
    const target = await fileSystem.authorizePath(args.path, "write");
    if (!args.overwrite && (await fileSystem.host.exists(target))) {
      throw new Error(`${target} already exists on the host`);
    }
    const { content } = await app.requireService(RemoteStoreService).read(args.url);
    await fileSystem.writeSystemFile(target, content);
    invalidateWorkspaceFileIndex();
    return { path: target, size: content.length };
  },
});
