import type Agent from "@tokenring-ai/agent/Agent";
import type { InputMessage } from "@tokenring-ai/agent/AgentEvents";
import type { ContextualSearchItem, ContextualSearchProvider, ContextualSearchQuery } from "@tokenring-ai/chat/ContextualSearchProvider";
import { formatContextualTag } from "@tokenring-ai/chat/contextualSearch/tags";
import formatError from "@tokenring-ai/utility/error/formatError";
import { isTextMimeType, type RemoteMount } from "./RemoteStore.ts";
import type RemoteStoreService from "./RemoteStoreService.ts";

/** Remote search runs on every keystroke after `@`; host results never wait on it, and it gives up after this long. */
const SEARCH_TIMEOUT_MS = 1500;
/** Largest remote file attached to a message. */
const MAX_ATTACHMENT_BYTES = 256 * 1024;

/** Contextual tag provider ids cannot contain `:`. */
export function remoteSearchProviderId(mount: RemoteMount): string {
  return `remote-${mount.scheme}-${mount.authority}`.replace(/[:\]]/g, "-");
}

/** `@` mention search over one remote mount, as its own category ("Google Drive · work"). */
export default class RemoteContextualSearchProvider implements ContextualSearchProvider {
  readonly id: string;
  readonly categoryId: string;
  readonly categoryLabel: string;

  constructor(
    private readonly service: RemoteStoreService,
    private readonly mount: RemoteMount,
  ) {
    this.id = remoteSearchProviderId(mount);
    this.categoryId = this.id;
    this.categoryLabel = mount.label;
  }

  async search({ query, limit, signal }: ContextualSearchQuery): Promise<ContextualSearchItem[]> {
    const needle = query.trim();
    if (needle.length < 2) return [];
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, SEARCH_TIMEOUT_MS);
    try {
      const entries = await Promise.race([
        this.service.search(needle, { within: this.mount.url, limit, signal: controller.signal }),
        new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("timed out")), { once: true })),
      ]);
      return entries
        .filter(entry => entry.kind === "file")
        .map(entry => ({
          id: entry.url,
          tag: formatContextualTag(this.id, entry.url),
          title: entry.name,
          subtitle: this.mount.label,
          categoryId: this.categoryId,
          categoryLabel: this.categoryLabel,
        }));
    } catch {
      // A slow or failing remote must not break `@` search; the category simply shows nothing.
      return [];
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }

  async resolve({ itemId }: { itemId: string }, input: InputMessage, agent: Agent): Promise<void> {
    const attachments = (input.attachments ??= []);
    if (attachments.some(attachment => attachment.name === itemId)) return;
    try {
      const { name, mimeType, content } = await this.service.read(itemId);
      if (!isTextMimeType(mimeType)) {
        agent.warningMessage(`Couldn't attach ${name}: it is ${mimeType}, not text. Use remote_download to copy it to the host.`);
        return;
      }
      const truncated = content.length > MAX_ATTACHMENT_BYTES;
      attachments.push({
        name: itemId,
        description: `${name} from ${this.mount.label}${truncated ? " (truncated)" : ""}`,
        encoding: "text",
        mimeType: "text/plain",
        body: content.subarray(0, MAX_ATTACHMENT_BYTES).toString("utf-8"),
      });
    } catch (error: unknown) {
      agent.warningMessage(`Couldn't attach ${itemId}: ${formatError(error, { includeStack: false })}`);
    }
  }
}
