import { describe, expect, it, mock } from "bun:test";
import type Agent from "@tokenring-ai/agent/Agent";
import type TokenRingApp from "@tokenring-ai/app";
import { ContextualSearchService } from "@tokenring-ai/chat";
import ChatService from "@tokenring-ai/chat/ChatService";
import FileSystemService from "../FileSystemService.ts";
import RemoteContextualSearchProvider from "./RemoteContextualSearchProvider.ts";
import { parseRemoteUrl, type RemoteEntry, type RemoteMount, type RemoteStore } from "./RemoteStore.ts";
import RemoteStoreService from "./RemoteStoreService.ts";
import download from "./tools/download.ts";
import upload from "./tools/upload.ts";

const mount = (authority: string, extra: Partial<RemoteMount> = {}): RemoteMount => ({
  scheme: "fake",
  authority,
  url: `fake://${authority}/`,
  label: `Fake · ${authority}`,
  writable: false,
  contextualSearch: false,
  ...extra,
});

const doc: RemoteEntry = { url: "fake://work/doc", name: "doc.md", kind: "file", mimeType: "text/markdown" };
const folder: RemoteEntry = { url: "fake://work/dir", name: "dir", kind: "folder" };

function fakeStore(mounts: RemoteMount[], overrides: Partial<RemoteStore> = {}): RemoteStore {
  return {
    scheme: "fake",
    label: "Fake",
    mounts: () => mounts,
    list: async () => ({ entries: [doc, folder] }),
    stat: async url => [doc, folder].find(entry => entry.url === url) ?? null,
    read: async () => ({ name: "doc.md", mimeType: "text/markdown", content: Buffer.from("# hello") }),
    search: async (_query, { authority }) => [{ ...doc, url: `fake://${authority}/doc` }],
    create: async (_folder, name) => ({ ...doc, name, url: "fake://work/new" }),
    update: async url => ({ ...doc, url }),
    ...overrides,
  };
}

function fakeApp(contextualSearch?: { registerProvider: unknown; unregisterProvider: unknown }) {
  return { getService: (service: unknown) => (service === ContextualSearchService ? contextualSearch : undefined) } as unknown as TokenRingApp;
}

describe("parseRemoteUrl", () => {
  it("splits scheme, authority and path, and rejects host paths", () => {
    expect(parseRemoteUrl("googledrive://work/abc")).toEqual({ scheme: "googledrive", authority: "work", path: "abc" });
    expect(parseRemoteUrl("googledrive://work")).toEqual({ scheme: "googledrive", authority: "work", path: "" });
    expect(parseRemoteUrl("/Users/me/file.txt")).toBeNull();
  });
});

describe("RemoteStoreService", () => {
  it("routes URLs to the store for their scheme and mount", async () => {
    const service = new RemoteStoreService(fakeApp());
    service.registerStore(fakeStore([mount("work")]));
    expect(service.listMounts().map(m => m.url)).toEqual(["fake://work/"]);
    expect((await service.read("fake://work/doc")).content.toString()).toBe("# hello");
  });

  it("names the configured mounts when a URL matches none", async () => {
    const service = new RemoteStoreService(fakeApp());
    service.registerStore(fakeStore([mount("work")]));
    expect(() => service.list("fake://home/")).toThrow(/"home" is not a configured Fake mount\. Configured mounts: fake:\/\/work\//);
    expect(() => service.list("ftp://x/")).toThrow(/No remote store handles ftp:\/\//);
    expect(() => service.list("/etc/passwd")).toThrow(/is not a remote URL/);
  });

  it("refuses writes to read-only mounts", () => {
    const service = new RemoteStoreService(fakeApp());
    service.registerStore(fakeStore([mount("work")]));
    expect(() => service.create("fake://work/dir", "a.txt", Buffer.from("x"), "text/plain")).toThrow(/read-only/);
  });

  it("searches every searchable mount, and keeps results when one mount fails", async () => {
    const service = new RemoteStoreService(fakeApp());
    service.registerStore(
      fakeStore([mount("work"), mount("broken")], {
        search: async (_query, { authority }) => {
          if (authority === "broken") throw new Error("quota");
          return [{ ...doc, url: `fake://${authority}/doc` }];
        },
      }),
    );
    expect((await service.search("doc", { limit: 10 })).map(entry => entry.url)).toEqual(["fake://work/doc"]);
  });

  it("registers an @ search provider only for mounts that opt in, and drops it when they stop", () => {
    const registerProvider = mock();
    const unregisterProvider = mock();
    const service = new RemoteStoreService(fakeApp({ registerProvider, unregisterProvider }));
    let mounts = [mount("work", { contextualSearch: true }), mount("home")];
    service.registerStore(fakeStore([], { mounts: () => mounts }));
    expect(registerProvider.mock.calls.map(call => call[0])).toEqual(["remote-fake-work"]);

    mounts = [mount("work")];
    service.mountsChanged();
    expect(unregisterProvider).toHaveBeenCalledWith("remote-fake-work");
  });
});

describe("RemoteContextualSearchProvider", () => {
  it("returns tagged results, and nothing (rather than failing) when the store is slow", async () => {
    const service = new RemoteStoreService(fakeApp());
    service.registerStore(fakeStore([mount("work", { contextualSearch: true })]));
    const provider = new RemoteContextualSearchProvider(service, mount("work", { contextualSearch: true }));
    const items = await provider.search({ query: "doc", limit: 5, agent: {} as Agent });
    expect(items.map(item => item.tag)).toEqual(["@[remote-fake-work:fake://work/doc]"]);

    const slow = new RemoteStoreService(fakeApp());
    slow.registerStore(fakeStore([mount("work")], { search: () => new Promise(() => {}) }));
    const controller = new AbortController();
    const pending = new RemoteContextualSearchProvider(slow, mount("work")).search({ query: "doc", limit: 5, agent: {} as Agent, signal: controller.signal });
    controller.abort();
    expect(await pending).toEqual([]);
  });

  it("attaches text files to the message", async () => {
    const service = new RemoteStoreService(fakeApp());
    service.registerStore(fakeStore([mount("work")]));
    const provider = new RemoteContextualSearchProvider(service, mount("work"));
    const input = { from: "you", message: "see this" } as Parameters<NonNullable<RemoteContextualSearchProvider["resolve"]>>[1];
    await provider.resolve({ itemId: "fake://work/doc" }, input, { warningMessage: mock() } as unknown as Agent);
    expect(input.attachments?.[0]).toMatchObject({ name: "fake://work/doc", body: "# hello" });
  });
});

describe("remote tools", () => {
  function agentWith(remote: RemoteStoreService, fileSystem: Partial<FileSystemService>, approve = true) {
    const services = new Map<unknown, unknown>([
      [RemoteStoreService, remote],
      [FileSystemService, fileSystem],
      [ChatService, { checkToolApproval: mock(async () => approve) }],
    ]);
    return { requireService: (service: unknown) => services.get(service), getService: (service: unknown) => services.get(service) } as unknown as Agent;
  }

  it("download copies a remote file to the host, and will not overwrite unless asked", async () => {
    const remote = new RemoteStoreService(fakeApp());
    remote.registerStore(fakeStore([mount("work")]));
    const writeFile = mock(async () => true);
    const agent = agentWith(remote, { exists: async () => false, writeFile });
    const result = await download.execute({ url: "fake://work/doc", path: "/repo/doc.md", overwrite: false }, agent);
    expect(result.failed).toBeUndefined();
    expect(writeFile).toHaveBeenCalledWith("/repo/doc.md", Buffer.from("# hello"), agent);

    const existing = agentWith(remote, { exists: async () => true, writeFile });
    expect((await download.execute({ url: "fake://work/doc", path: "/repo/doc.md", overwrite: false }, existing)).failed).toBe(true);
  });

  it("upload creates in a folder after approval, and does nothing when refused", async () => {
    const remote = new RemoteStoreService(fakeApp());
    const create = mock(async () => ({ ...doc, url: "fake://work/new", name: "notes.txt" }));
    remote.registerStore(fakeStore([mount("work", { writable: true })], { create }));
    const fileSystem = { readFile: async () => Buffer.from("hi") };
    const done = await upload.execute({ path: "/repo/notes.txt", url: "fake://work/dir" }, agentWith(remote, fileSystem));
    expect(done.result).toContain("Created notes.txt (fake://work/new)");
    expect(create).toHaveBeenCalledWith("fake://work/dir", "notes.txt", Buffer.from("hi"), "text/plain");

    create.mockClear();
    const refused = await upload.execute({ path: "/repo/notes.txt", url: "fake://work/dir" }, agentWith(remote, fileSystem, false));
    expect(refused.failed).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });
});
