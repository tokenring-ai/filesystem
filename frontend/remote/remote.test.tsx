import { beforeEach, describe, expect, it, mock } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createLayoutRegistry } from "@tokenring-ai/one-frontend/layout/registry.ts";
import { renderLayoutApp } from "@tokenring-ai/one-frontend/test/layout.tsx";
import type React from "react";
import { SWRConfig } from "swr";

type Entry = { url: string; name: string; kind: "file" | "folder"; mimeType?: string; size?: number; webUrl?: string; readsAs?: string };

const work = { scheme: "googledrive", authority: "work", url: "googledrive://work/", label: "Google Drive · work", writable: false, contextualSearch: false };
const entries: Record<string, Entry> = {
  "googledrive://work/": { url: "googledrive://work/root", name: "My Drive", kind: "folder" },
  "googledrive://work/reports": { url: "googledrive://work/reports", name: "Reports", kind: "folder" },
  "googledrive://work/plan": {
    url: "googledrive://work/plan",
    name: "Plan",
    kind: "file",
    mimeType: "application/vnd.google-apps.document",
    readsAs: "text/markdown",
    webUrl: "https://docs.google.com/document/d/plan",
  },
};

const state = { mounts: [work] };
const copyToHost = mock(async (args: { url: string; path: string }) => ({ path: args.path, size: 6 }));

void mock.module("@tokenring-ai/one-frontend/rpc.ts", () => ({
  useRemoteMounts: () => ({ data: { stores: [{ scheme: "googledrive", label: "Google Drive" }], mounts: state.mounts }, error: undefined, mutate: mock() }),
  useRemoteEntry: (url: string | null) => ({ data: url ? { entry: entries[url] ?? null } : undefined, error: undefined }),
  useRemoteListing: (url: string | null) => ({
    data: url === "googledrive://work/" ? { entries: [entries["googledrive://work/reports"], entries["googledrive://work/plan"]] } : { entries: [] },
    error: undefined,
    mutate: mock(),
  }),
  useRemoteContent: (url: string | null) => ({
    data: url ? { name: "Plan", mimeType: "text/markdown", size: 6, encoding: "utf8", content: "# Plan" } : undefined,
    error: undefined,
    mutate: mock(),
  }),
  useDefaultDirectories: () => ({ data: { workingDirectory: "/project", workspaceDirectory: "/project/.tokenring" }, error: undefined }),
  remoteRPCClient: { copyToHost },
}));

const { REMOTE_APP } = await import("../layout.ts");
const { default: views } = await import("../views.tsx");
const { remoteParams, remoteUrl } = await import("./urls.ts");

const registry = createLayoutRegistry({
  apps: [REMOTE_APP],
  views: views.views,
  kinds: [
    { id: "navigator", label: "Navigators", plural: "navigators" },
    { id: "remote", label: "Remote files", plural: "remote files" },
  ],
});

function Fresh({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>;
}

const renderApp = (url = "/remote") => renderLayoutApp({ registry, url, wrapper: Fresh });

describe("Remote files app", () => {
  beforeEach(() => {
    state.mounts = [work];
    copyToHost.mockClear();
  });

  it("explains how to add a store when none is configured", async () => {
    state.mounts = [];
    renderApp();
    expect(await screen.findByText("No remote stores")).toBeInTheDocument();
  });

  it("opens a mount's root folder, with files addressed by id", async () => {
    const user = userEvent.setup();
    const app = renderApp();
    await user.click(await screen.findByRole("link", { name: /Google Drive · work/ }));
    expect(app.location().pathname).toBe("/remote/googledrive/work/folder");
    const plan = await screen.findByRole("link", { name: /Plan/ });
    expect(plan.getAttribute("href")).toBe("/remote/googledrive/work/file/plan");
    expect(screen.getByRole("link", { name: /Reports/ }).getAttribute("href")).toBe("/remote/googledrive/work/folder/reports");
  });

  it("previews an exported Google Doc and copies it to the host", async () => {
    const user = userEvent.setup();
    renderApp("/remote/googledrive/work/file/plan");
    expect(await screen.findByText("# Plan")).toBeInTheDocument();
    expect(screen.getByText("exported as text/markdown")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open in Google Drive/ }).getAttribute("href")).toBe("https://docs.google.com/document/d/plan");

    await user.click(screen.getByRole("button", { name: "Copy to host" }));
    const field = await screen.findByLabelText("Host path");
    await waitFor(() => expect((field as HTMLInputElement).value).toBe("/project/Plan"));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(copyToHost).toHaveBeenCalledWith({ url: "googledrive://work/plan", path: "/project/Plan", overwrite: false }));
  });
});

describe("remote routes", () => {
  it("keeps whole S3 keys, slashes and all, in the URL", () => {
    const params = remoteParams("s3://media/reports/2026/q1.csv");
    expect(params).toEqual({ scheme: "s3", authority: "media", "*": "reports/2026/q1.csv" });
    const path = registry.routes.urlFor("remote", "remote-file", params);
    expect(path).toBe("/remote/s3/media/file/reports/2026/q1.csv");
    const resolved = registry.routes.resolve(path!);
    expect(resolved).toMatchObject({ viewId: "remote-file" });
    expect(remoteUrl(resolved!.params)).toBe("s3://media/reports/2026/q1.csv");
  });
});
