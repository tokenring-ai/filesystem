import type TokenRingApp from "@tokenring-ai/app";
import type { TokenRingService } from "@tokenring-ai/app/types";
import { ContextualSearchService } from "@tokenring-ai/chat";
import formatError from "@tokenring-ai/utility/error/formatError";
import RemoteContextualSearchProvider, { remoteSearchProviderId } from "./RemoteContextualSearchProvider.ts";
import {
  type ParsedRemoteUrl,
  parseRemoteUrl,
  type RemoteContent,
  type RemoteEntry,
  type RemoteListing,
  type RemoteMount,
  type RemoteStore,
} from "./RemoteStore.ts";

export class RemoteStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteStoreError";
  }
}

type Resolved = { store: RemoteStore; mount: RemoteMount; parsed: ParsedRemoteUrl };

/**
 * Remote stores by URL scheme. Stores register themselves (the google plugin registers
 * `googledrive`) and call {@link mountsChanged} when their configured mounts change.
 */
export default class RemoteStoreService implements TokenRingService {
  readonly name = "RemoteStoreService";
  description = "URL-addressed remote stores such as Google Drive and S3 (not part of the host filesystem)";

  private readonly stores = new Map<string, RemoteStore>();
  /** Contextual search providers currently registered, by provider id. */
  private readonly searchProviders = new Set<string>();

  constructor(private readonly app: TokenRingApp) {}

  registerStore(store: RemoteStore): void {
    this.stores.set(store.scheme, store);
    this.mountsChanged();
  }

  unregisterStore(scheme: string): void {
    this.stores.delete(scheme);
    this.mountsChanged();
  }

  listStores(): { scheme: string; label: string }[] {
    return [...this.stores.values()].map(store => ({ scheme: store.scheme, label: store.label }));
  }

  listMounts(): RemoteMount[] {
    return [...this.stores.values()].flatMap(store => store.mounts());
  }

  hasMounts(): boolean {
    return this.listMounts().length > 0;
  }

  /** Re-syncs `@` search providers with the mounts that opt in. Stores call this after reconfiguring. */
  mountsChanged(): void {
    const contextualSearch = this.app.getService(ContextualSearchService);
    if (!contextualSearch) return;
    const wanted = new Map<string, RemoteContextualSearchProvider>();
    for (const store of this.stores.values()) {
      if (!store.search) continue;
      for (const mount of store.mounts()) {
        if (mount.contextualSearch) wanted.set(remoteSearchProviderId(mount), new RemoteContextualSearchProvider(this, mount));
      }
    }
    for (const id of this.searchProviders) {
      if (!wanted.has(id)) contextualSearch.unregisterProvider(id);
    }
    this.searchProviders.clear();
    for (const [id, provider] of wanted) {
      contextualSearch.registerProvider(id, provider);
      this.searchProviders.add(id);
    }
  }

  private resolve(url: string): Resolved {
    const parsed = parseRemoteUrl(url);
    if (!parsed) throw new RemoteStoreError(`"${url}" is not a remote URL (expected <scheme>://<mount>/…)`);
    const store = this.stores.get(parsed.scheme);
    if (!store) throw new RemoteStoreError(`No remote store handles ${parsed.scheme}:// URLs. Configured stores: ${this.describeMounts()}`);
    const mount = store.mounts().find(candidate => candidate.authority === parsed.authority);
    if (!mount) throw new RemoteStoreError(`"${parsed.authority}" is not a configured ${store.label} mount. Configured mounts: ${this.describeMounts()}`);
    return { store, mount, parsed };
  }

  private describeMounts(): string {
    const mounts = this.listMounts();
    return mounts.length === 0 ? "(none)" : mounts.map(mount => `${mount.url} (${mount.label})`).join(", ");
  }

  getMount(url: string): RemoteMount {
    return this.resolve(url).mount;
  }

  list(url: string, options: { cursor?: string | undefined } = {}): Promise<RemoteListing> {
    return this.resolve(url).store.list(url, options);
  }

  stat(url: string): Promise<RemoteEntry | null> {
    return this.resolve(url).store.stat(url);
  }

  read(url: string): Promise<RemoteContent> {
    return this.resolve(url).store.read(url);
  }

  /** Searches one mount (`within` is any URL inside it) or, without `within`, every searchable mount. */
  async search(query: string, options: { within?: string | undefined; limit: number; signal?: AbortSignal | undefined }): Promise<RemoteEntry[]> {
    const targets: { store: RemoteStore; mount: RemoteMount }[] = [];
    if (options.within) {
      const { store, mount } = this.resolve(options.within);
      if (!store.search) throw new RemoteStoreError(`${store.label} does not support search`);
      targets.push({ store, mount });
    } else {
      for (const store of this.stores.values()) {
        if (store.search) for (const mount of store.mounts()) targets.push({ store, mount });
      }
    }
    const results = await Promise.allSettled(
      targets.map(({ store, mount }) => store.search!(query, { authority: mount.authority, limit: options.limit, signal: options.signal })),
    );
    const entries: RemoteEntry[] = [];
    const failures: string[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") entries.push(...result.value);
      else failures.push(`${targets[index]!.mount.url}: ${formatError(result.reason, { includeStack: false })}`);
    });
    if (entries.length === 0 && failures.length > 0) throw new RemoteStoreError(`Search failed: ${failures.join("; ")}`);
    return entries.slice(0, options.limit);
  }

  private requireWritable({ store, mount }: Resolved): void {
    if (!mount.writable) throw new RemoteStoreError(`${mount.url} (${mount.label}) is read-only. Enable writes for this mount in its configuration.`);
    if (!store.create || !store.update) throw new RemoteStoreError(`${store.label} does not support writing`);
  }

  /** Creates `name` inside the folder at `folderUrl`. */
  create(folderUrl: string, name: string, content: Buffer, mimeType: string): Promise<RemoteEntry> {
    const resolved = this.resolve(folderUrl);
    this.requireWritable(resolved);
    return resolved.store.create!(folderUrl, name, content, mimeType);
  }

  /** Replaces the content of the existing file at `url`. */
  update(url: string, content: Buffer, mimeType: string): Promise<RemoteEntry> {
    const resolved = this.resolve(url);
    this.requireWritable(resolved);
    return resolved.store.update!(url, content, mimeType);
  }
}
