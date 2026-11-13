import { beforeEach, describe, expect, it, mock } from "bun:test";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createLayoutRegistry } from "@tokenring-ai/one-frontend/layout/registry.ts";
import { renderLayoutApp } from "@tokenring-ai/one-frontend/test/layout.tsx";
import type React from "react";
import { SWRConfig } from "swr";

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

const { FILES_APP } = await import("../layout.ts");
const { default: filesViews } = await import("../views.tsx");
const { resetFilesBrowserStore, clearFileDrafts, fileDraftKey, getFileDraft, setFileDraft, setFilesBrowserState } = await import("../lib/filesBrowserStore.ts");
const { filesPath } = await import("../lib/paths.ts");
const { setConfirmSkipped } = await import("@tokenring-ai/one-frontend/lib/uiPreferences.ts");
const { getPendingRevealForTest, resetRevealRequests } = await import("../lib/contentSearch.ts");

const registry = createLayoutRegistry({
  apps: [FILES_APP],
  views: filesViews.views,
  kinds: [
    { id: "navigator", label: "Navigators", plural: "navigators" },
    { id: "file", label: "Files", plural: "files" },
  ],
});

function Fresh({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>;
}

const renderApp = (url = "/files") => renderLayoutApp({ registry, url, wrapper: Fresh });
/** A tab by title (its accessible name also carries a badge label when it has one). */
const tab = (title: string) => screen.queryByRole("tab", { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });
const README = "/project/README.md";

describe("Files app", () => {
  beforeEach(() => {
    localStorage.clear();
    resetFilesBrowserStore();
    clearFileDrafts();
    for (const fn of [
      writeFile,
      deleteFile,
      rename,
      createDirectory,
      mutateFileContents,
      copy,
      mutateListing,
      deleteDirectory,
      countDirectoryEntries,
      searchFileContents,
      listFileVersions,
      readFileVersion,
    ])
      fn.mockClear();
    resetRevealRequests();
    existing.clear();
    state.listingError = undefined;
    state.providers = ["local"];
    state.files = ["src/", "README.md", "logo.png"];
    state.contents = { [README]: "# Hello" };
  });

  describe("routing", () => {
    it("shows the landing tab at /files", async () => {
      renderApp();
      expect(await screen.findByText("No file open")).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Editor" })).toBeInTheDocument();
    });

    it("keeps the encoded file URLs: a path with slashes and spaces opens its own tab", async () => {
      state.contents["src/a b.ts"] = "const a = 1;";
      const app = renderApp(`/files/${encodeURIComponent("src/a b.ts")}`);
      expect(await screen.findByLabelText("Code editor")).toHaveValue("const a = 1;");
      expect(app.location().pathname).toBe("/files/src%2Fa%20b.ts");
      expect(tab("a b.ts")).toBeInTheDocument();
      expect(screen.queryByText("No file open")).not.toBeInTheDocument();
    });

    it("opens non-text files in the preview pane", async () => {
      renderApp(filesPath("/project/logo.png"));
      expect(await screen.findByRole("button", { name: "Close preview" })).toBeInTheDocument();
      expect(screen.queryByLabelText("Code editor")).not.toBeInTheDocument();
      await waitFor(() => expect(tab("logo.png")).toBeInTheDocument());
    });
  });

  describe("tree", () => {
    it("lists the working directory and opens a text file in a new tab, closing the landing tab", async () => {
      const user = userEvent.setup();
      const app = renderApp();

      await user.click(await screen.findByText("README.md"));

      await waitFor(() => expect(app.location().pathname).toBe("/files/%2Fproject%2FREADME.md"));
      expect(await screen.findByLabelText("Markdown editor")).toHaveValue("# Hello");
      expect(tab("README.md")).toBeInTheDocument();
      expect(tab("Editor")).not.toBeInTheDocument();
    });

    it("shows the directory of a file named by the URL", async () => {
      renderApp("/files/%2Fproject%2Fsrc%2Findex.ts");
      expect(await screen.findByText("README.md")).toBeInTheDocument();
      expect(screen.getAllByText("src").length).toBeGreaterThan(0);
    });

    it("creates a new file from the breadcrumb actions and opens it", async () => {
      const user = userEvent.setup();
      const app = renderApp();

      await user.click(await screen.findByRole("button", { name: "New file" }));
      const dialog = screen.getByRole("dialog");
      await user.type(within(dialog).getByRole("textbox"), "notes.md");
      await user.click(within(dialog).getByRole("button", { name: "Create" }));

      await waitFor(() => expect(writeFile).toHaveBeenCalledWith({ path: "/project/notes.md", content: "", provider: "local" }));
      await waitFor(() => expect(app.location().pathname).toBe("/files/%2Fproject%2Fnotes.md"));
    });

    it("shows a listing error with a working Retry", async () => {
      const user = userEvent.setup();
      state.listingError = new Error("permission denied");
      renderApp();

      expect(await screen.findByText("Could not list this folder")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Retry" }));
      expect(mutateListing).toHaveBeenCalled();
    });

    it("explains how to configure a provider when none exist", async () => {
      state.providers = [];
      renderApp();

      const empty = await screen.findByTestId("files-no-providers");
      expect(empty).toHaveTextContent("filesystem.agentDefaults.provider");
      expect(within(empty).getByRole("link", { name: "Open configuration" })).toHaveAttribute("href", "/configuration");
    });

    it("duplicates a file next to itself under the first free name", async () => {
      const user = userEvent.setup();
      existing.add("/project/README copy.md");
      renderApp();

      await user.click(await screen.findByRole("button", { name: "Duplicate README.md" }));
      await waitFor(() => expect(copy).toHaveBeenCalledWith({ provider: "local", source: README, destination: "/project/README copy 2.md", overwrite: false }));
    });

    it("deletes a folder after a confirmation that says how much is inside, closing its open tabs and dropping drafts", async () => {
      const user = userEvent.setup();
      setConfirmSkipped("Delete", true);
      // Opening a file shows its directory in the tree; step back up to /project so its "src" folder is listed.
      setFileDraft(fileDraftKey("local", "/project/src/index.ts"), "draft inside");
      renderApp(filesPath("/project/src/index.ts"));
      await screen.findByLabelText("Code editor");
      act(() => setFilesBrowserState({ pathOverride: "/project" }));

      await user.click(await screen.findByRole("button", { name: "Delete folder src" }));
      await waitFor(() => expect(countDirectoryEntries).toHaveBeenCalledWith({ path: "/project/src", provider: "local" }));
      const dialog = await screen.findByRole("dialog");
      await waitFor(() => expect(dialog).toHaveTextContent("Delete folder “src” and the 3 files and 1 folder inside it?"));
      expect(deleteDirectory).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole("button", { name: "Delete folder" }));
      await waitFor(() => expect(deleteDirectory).toHaveBeenCalledWith({ path: "/project/src", provider: "local" }));
      await waitFor(() => expect(tab("index.ts")).not.toBeInTheDocument());
      expect(getFileDraft(fileDraftKey("local", "/project/src/index.ts"))).toBeNull();
    });
  });

  describe("rename and delete", () => {
    async function renameTo(user: ReturnType<typeof userEvent.setup>, entry: string, name: string) {
      await user.click(await screen.findByRole("button", { name: `Rename ${entry}` }));
      const dialog = screen.getByRole("dialog");
      const input = within(dialog).getByRole("textbox");
      await user.clear(input);
      await user.type(input, name);
      await user.click(within(dialog).getByRole("button", { name: "Rename" }));
    }

    it("moves a renamed file's unsaved draft and open tab to the new path", async () => {
      const user = userEvent.setup();
      setFileDraft(fileDraftKey("local", README), "unsaved edits");
      const app = renderApp(filesPath(README));
      await screen.findByLabelText("Markdown editor");

      await renameTo(user, "README.md", "NOTES.md");

      await waitFor(() => expect(rename).toHaveBeenCalledWith({ oldPath: README, newPath: "/project/NOTES.md", provider: "local" }));
      await waitFor(() => expect(app.location().pathname).toBe("/files/%2Fproject%2FNOTES.md"));
      await waitFor(() => expect(tab("NOTES.md")).toBeInTheDocument());
      await waitFor(() => expect(tab("README.md")).not.toBeInTheDocument());
      expect(getFileDraft(fileDraftKey("local", "/project/NOTES.md"))).toBe("unsaved edits");
      expect(getFileDraft(fileDraftKey("local", README))).toBeNull();
      expect(await screen.findByLabelText("Markdown editor")).toHaveValue("unsaved edits");
    });

    it("re-points tabs and drafts of files inside a renamed directory, leaving prefix siblings alone", async () => {
      const user = userEvent.setup();
      setFileDraft(fileDraftKey("local", "/project/src/index.ts"), "inner draft");
      setFileDraft(fileDraftKey("local", "/project/srcfile.ts"), "sibling draft");
      const app = renderApp(filesPath("/project/src/index.ts"));
      await screen.findByLabelText("Code editor");
      // A sibling that merely shares the prefix, opened too.
      act(() => app.go(filesPath("/project/srcfile.ts")));
      await waitFor(() => expect(tab("srcfile.ts")).toBeInTheDocument());
      act(() => app.go(filesPath("/project/src/index.ts")));
      act(() => setFilesBrowserState({ pathOverride: "/project" }));

      await renameTo(user, "src", "lib");

      await waitFor(() => expect(rename).toHaveBeenCalledWith({ oldPath: "/project/src", newPath: "/project/lib", provider: "local" }));
      await waitFor(() => expect(app.location().pathname).toBe("/files/%2Fproject%2Flib%2Findex.ts"));
      expect(getFileDraft(fileDraftKey("local", "/project/lib/index.ts"))).toBe("inner draft");
      expect(getFileDraft(fileDraftKey("local", "/project/src/index.ts"))).toBeNull();
      expect(getFileDraft(fileDraftKey("local", "/project/srcfile.ts"))).toBe("sibling draft");
      expect(tab("srcfile.ts")).toBeInTheDocument();
    });

    it("deletes with the current provider when confirmation is skipped, closing the tab and dropping the draft", async () => {
      const user = userEvent.setup();
      setConfirmSkipped("Delete", true);
      setFileDraft(fileDraftKey("local", README), "doomed draft");
      renderApp(filesPath(README));
      await screen.findByLabelText("Markdown editor");

      await user.click(await screen.findByRole("button", { name: "Delete README.md" }));

      await waitFor(() => expect(deleteFile).toHaveBeenCalledWith({ path: README, provider: "local" }));
      await waitFor(() => expect(tab("README.md")).not.toBeInTheDocument());
      expect(getFileDraft(fileDraftKey("local", README))).toBeNull();
    });
  });

  describe("content search", () => {
    it("lists file:line matches under the current folder and opens the editor at the line", async () => {
      const user = userEvent.setup();
      const app = renderApp();

      await user.click(await screen.findByRole("button", { name: "Contents" }));
      await user.type(screen.getByLabelText("Search file contents"), "needle");

      expect(await screen.findByText("3 matches in 2 files")).toBeInTheDocument();
      expect(searchFileContents).toHaveBeenLastCalledWith(expect.objectContaining({ provider: "local", path: "/project", query: "needle", limit: 200 }));
      await user.click(screen.getByRole("button", { name: "Open src/a.ts at line 9" }));

      expect(getPendingRevealForTest()).toMatchObject({ path: "/project/src/a.ts", line: 9 });
      await waitFor(() => expect(app.location().pathname).toBe("/files/%2Fproject%2Fsrc%2Fa.ts"));
    });
  });

  describe("editor", () => {
    it("previews an archived version and restores it through the normal save", async () => {
      const user = userEvent.setup();
      state.contents["/project/versioned.ts"] = "new text";
      renderApp(filesPath("/project/versioned.ts"));

      expect(await screen.findByLabelText("Code editor")).toHaveValue("new text");
      await user.click(screen.getByRole("button", { name: "Versions" }));
      await waitFor(() => expect(listFileVersions).toHaveBeenCalledWith({ provider: "local", path: "/project/versioned.ts" }));

      const list = await screen.findByRole("list", { name: "Archived versions" });
      await user.click(within(list).getByRole("button"));
      expect(await screen.findByTestId("file-version-preview")).toHaveTextContent("old text");

      await user.click(screen.getByRole("button", { name: "Restore this version" }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Restore" }));

      await waitFor(() => expect(writeFile).toHaveBeenCalledWith({ path: "/project/versioned.ts", content: "old text", provider: "local" }));
      expect(mutateFileContents).toHaveBeenCalled();
    });

    it("edits a file, marks the tab dirty and saves with Ctrl+S", async () => {
      const user = userEvent.setup();
      renderApp(filesPath(README));

      const editor = await screen.findByLabelText("Markdown editor");
      expect(editor).toHaveValue("# Hello");
      await user.clear(editor);
      await user.type(editor, "# Changed");
      await waitFor(() => expect(screen.getByRole("img", { name: "Unsaved changes" })).toBeInTheDocument());

      await user.keyboard("{Control>}s{/Control}");
      await waitFor(() => expect(writeFile).toHaveBeenCalledWith({ path: README, content: "# Changed", provider: "local" }));
      await waitFor(() => expect(screen.queryByRole("img", { name: "Unsaved changes" })).not.toBeInTheDocument());
    });

    it("keeps text typed while a save is in flight", async () => {
      const user = userEvent.setup();
      let finishWrite!: () => void;
      writeFile.mockImplementationOnce(() => new Promise(resolve => (finishWrite = () => resolve({ success: true }))));
      renderApp(filesPath(README));

      const editor = await screen.findByLabelText("Markdown editor");
      await user.type(editor, " one");
      await user.keyboard("{Control>}s{/Control}");
      await waitFor(() => expect(writeFile).toHaveBeenCalledWith({ path: README, content: "# Hello one", provider: "local" }));

      await user.type(editor, " two");
      finishWrite();

      await waitFor(() => expect(mutateFileContents).toHaveBeenCalled());
      expect(getFileDraft(fileDraftKey("local", README))).toBe("# Hello one two");
      expect(editor).toHaveValue("# Hello one two");
    });

    it("keeps an unsaved draft when the tab is closed and reopened", async () => {
      const user = userEvent.setup();
      const first = renderApp(filesPath(README));
      const editor = await screen.findByLabelText("Markdown editor");
      await user.clear(editor);
      await user.type(editor, "draft");
      first.unmount();

      renderApp(filesPath(README));
      expect(await screen.findByLabelText("Markdown editor")).toHaveValue("draft");
    });
  });

  describe("preview", () => {
    it("shows file metadata and closes its tab", async () => {
      const user = userEvent.setup();
      renderApp(filesPath("/project/logo.png"));

      await user.click(await screen.findByRole("button", { name: "Close preview" }));
      await waitFor(() => expect(tab("logo.png")).not.toBeInTheDocument());
    });
  });
});
