import { beforeEach, describe, expect, it, mock } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defineView } from "@tokenring-ai/one-frontend/layout/define.ts";
import { renderLayoutView } from "@tokenring-ai/one-frontend/test/layout.tsx";
import type React from "react";
import { MemoryRouter, useLocation } from "react-router-dom";

const PassThroughFocusTrap = ({ children }: { children: React.ReactNode }) => children;
void mock.module("focus-trap-react", () => ({ FocusTrap: PassThroughFocusTrap, default: PassThroughFocusTrap }));

// Editors are heavy browser widgets; a textarea stands in for both.
void mock.module("@monaco-editor/react", () => ({
  default: ({ value, onChange }: { value: string; onChange?: (v: string | undefined) => void }) => (
    <textarea aria-label="Code editor" value={value} onChange={e => onChange?.(e.target.value)} />
  ),
}));
void mock.module("@uiw/react-md-editor", () => ({
  default: ({ value, onChange }: { value?: string; onChange?: (v?: string) => void }) => (
    <textarea aria-label="Markdown editor" value={value ?? ""} onChange={e => onChange?.(e.target.value)} />
  ),
}));

const writeFile = mock(async (_args: Record<string, unknown>) => ({ success: true }));
const deleteFile = mock(async (_args: { path: string; provider: string }) => ({ success: true }));
const rename = mock(async (_args: { oldPath: string; newPath: string; provider: string }) => ({ success: true }));
const createDirectory = mock(async (_args: Record<string, unknown>) => ({ success: true }));
const mutateFileContents = mock(async (_updater?: unknown) => undefined);
const copy = mock(async (_args: Record<string, unknown>) => ({ success: true }));
const mutateListing = mock(async () => undefined);
const deleteDirectory = mock(async (_args: { path: string; provider: string }) => ({ success: true }));
const countDirectoryEntries = mock(async (_args: { path: string; provider: string }) => ({ files: 3, directories: 1, truncated: false }));
const searchFileContents = mock(async (args: { path: string; query: string }) => ({
  matches: [
    { file: `${args.path}/src/a.ts`, line: 3, match: `const ${args.query} = 1;` },
    { file: `${args.path}/src/a.ts`, line: 9, match: `use(${args.query});` },
    { file: `${args.path}/README.md`, line: 1, match: `# ${args.query}` },
  ],
  truncated: false,
}));
const listFileVersions = mock(async (_args: { path: string; provider: string }) => ({
  versions: [{ id: "v1", createdAt: "2026-01-02T03:04:05.000Z", size: 9 }],
}));
const readFileVersion = mock(async (_args: { path: string; provider: string; versionId: string }) => ({ content: "old text" }));
const existing = new Set<string>();

const state = {
  providers: ["local"] as string[],
  files: ["src/", "README.md", "logo.png"] as string[],
  contents: {} as Record<string, string>,
  listingError: undefined as Error | undefined,
};

void mock.module("@tokenring-ai/one-frontend/rpc.ts", () => ({
  useFilesystemProviders: () => ({ data: { providers: state.providers }, isLoading: false, error: undefined, mutate: mock() }),
  useDefaultDirectories: () => ({
    data: { defaultProvider: "local", workingDirectory: "/project", workspaceDirectory: "/project" },
    isLoading: false,
    error: undefined,
  }),
  useFilesystemState: () => ({
    data: {
      status: "success" as const,
      provider: "local",
      allowedPaths: [],
      selectedFiles: [] as string[],
      readFiles: {},
      dirty: false,
    },
    isLoading: false,
    error: undefined,
    mutate: mock(async () => undefined),
  }),
  useDirectoryListing: (opts?: { path: string }) => ({
    data: opts && !state.listingError ? { files: state.files.map(f => `${opts.path}/${f}`) } : undefined,
    isLoading: false,
    error: state.listingError,
    mutate: mutateListing,
  }),
  useWorkspaceFileSearch: () => ({ data: undefined, isLoading: false, error: undefined }),
  useFileContents: (path: string | undefined) => ({
    data: path ? { content: state.contents[path] ?? "" } : undefined,
    isLoading: false,
    error: undefined,
    mutate: mutateFileContents,
  }),
  useAgentTypes: () => ({ data: [{ type: "coder", displayName: "Coder", description: "" }], isLoading: false }),
  useAgentList: () => ({ data: [], isLoading: false, mutate: mock() }),
  agentRPCClient: { createAgent: mock(async () => ({ id: "agent-1" })) },
  filesystemRPCClient: {
    writeFile,
    deleteFile,
    rename,
    createDirectory,
    exists: async ({ path }: { path: string }) => ({ exists: existing.has(path) }),
    copy,
    deleteDirectory,
    countDirectoryEntries,
    searchFileContents,
    listFileVersions,
    readFileVersion,
    stat: async ({ path }: { path: string }) => ({ stats: { exists: true, size: 12, isFile: !path.endsWith("/"), isDirectory: path.endsWith("/") } }),
    readTextFile: async ({ path }: { path: string }) => ({ content: state.contents[path] ?? "" }),
    addFileToChat: async () => ({ success: true }),
  },
}));

const { default: filesViews } = await import("../../views.tsx");
const { default: FileBrowserOverlay } = await import("./FileBrowserOverlay.tsx");
const { filesPath } = await import("../../lib/paths.ts");

function Pathname() {
  return <p data-testid="pathname">{useLocation().pathname}</p>;
}
const pathname = () => screen.getByTestId("pathname").textContent;

describe("chat file browser overlay", () => {
  beforeEach(() => {
    state.files = [];
  });

  function renderOutsideFiles() {
    const onClose = mock(() => {});
    render(
      <MemoryRouter initialEntries={["/agent/a"]}>
        <FileBrowserOverlay agentId="agent-1" isOpen onClose={onClose} />
        <Pathname />
      </MemoryRouter>,
    );
    return { onClose };
  }

  it("hides dotfiles until Show Hidden is turned on", async () => {
    const user = userEvent.setup();
    // The listing returns dotfiles either way; listDirectory does not apply showHidden.
    state.files = ["README.md", ".env", "src/", ".git/"];
    renderOutsideFiles();
    expect(await screen.findByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("src")).toBeInTheDocument();
    expect(screen.queryByText(".env")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show hidden files" }));
    expect(screen.getByText(".env")).toBeInTheDocument();
    expect(screen.getByText(".git")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide hidden files" }));
    expect(screen.queryByText(".env")).not.toBeInTheDocument();
  });

  it("opens the selected file in the Files app from anywhere else", async () => {
    const user = userEvent.setup();
    state.files = ["README.md"];
    const { onClose } = renderOutsideFiles();
    await user.click(await screen.findByRole("button", { name: "Select file README.md" }));
    await user.click(await screen.findByRole("button", { name: "Edit file" }));
    expect(pathname()).toBe(filesPath("./README.md"));
    expect(onClose).toHaveBeenCalled();
  });

  it("opens the file's tab in place when the current app shows files", async () => {
    const user = userEvent.setup();
    state.files = ["README.md"];
    const onClose = mock(() => {});
    const host = defineView({
      id: "overlay-host",
      kind: "page",
      title: "Host",
      icon: filesViews.views[0]!.icon,
      route: "",
      component: () => <FileBrowserOverlay agentId="agent-1" isOpen onClose={onClose} />,
    });
    const fileView = filesViews.views.find(view => view.id === "file")!;
    const app = renderLayoutView(host, { views: [fileView] });
    await user.click(await screen.findByRole("button", { name: "Select file README.md" }));
    await user.click(await screen.findByRole("button", { name: "Edit file" }));
    expect(app.location().pathname).toBe(`/test/${encodeURIComponent("./README.md")}`);
    expect(onClose).toHaveBeenCalled();
  });
});
