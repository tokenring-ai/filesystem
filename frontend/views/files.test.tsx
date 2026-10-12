import { beforeEach, describe, expect, it, mock } from "bun:test";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getPanelBadge } from "@tokenring-ai/one-frontend/dock/panelBadges.ts";
import type { DashboardDefinition, ViewDefinition, ViewParams } from "@tokenring-ai/one-frontend/dock/types.ts";
import { createFakeDashboardApi, createFakePanelHandle, type FakeDashboardApi, renderView } from "@tokenring-ai/one-frontend/test/dock.tsx";
import type React from "react";

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

const { default: contribution } = await import("../app.tsx");
const { resetFilesBrowserStore, clearFileDrafts, fileDraftKey, getFileDraft, setFileDraft, setFilesBrowserState } = await import("../lib/filesBrowserStore.ts");
const { setConfirmSkipped } = await import("@tokenring-ai/one-frontend/lib/uiPreferences.ts");
const { getPendingRevealForTest, resetRevealRequests } = await import("../lib/contentSearch.ts");

const viewById = (id: string) => contribution.views.find(view => view.id === id) as ViewDefinition<any>;
const getView = (id: string) => contribution.views.find(view => view.id === id);
const dashboard: DashboardDefinition = contribution.dashboards[0]!;

function fakeApi(): FakeDashboardApi {
  return createFakeDashboardApi({ dashboardId: "files", getView });
}

function renderFilesView(viewId: string, params: ViewParams = {}, path = "/files", api = fakeApi()) {
  const panel = createFakePanelHandle({ viewId, dashboardId: "files", panelId: `${viewId}:${JSON.stringify(params)}`, params });
  return renderView(viewById(viewId), params, { api, panel, path, routes: ["/files/:fileId?"] });
}

const pathname = () => screen.getByTestId("pathname").textContent;

describe("Files dashboard views", () => {
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
    state.contents = { "/project/README.md": "# Hello" };
  });

  describe("tree", () => {
    it("lists the working directory and opens a text file in the editor", async () => {
      const user = userEvent.setup();
      const { api } = renderFilesView("file-tree");

      await user.click(await screen.findByText("README.md"));

      expect(api.opened).toEqual([expect.objectContaining({ viewId: "file-editor", params: { path: "/project/README.md" } })]);
      expect(pathname()).toBe("/files/%2Fproject%2FREADME.md");
    });

    it("opens non-text files in the preview pane", async () => {
      const user = userEvent.setup();
      const { api } = renderFilesView("file-tree");

      await user.click(await screen.findByText("logo.png"));
      expect(api.opened).toEqual([expect.objectContaining({ viewId: "file-preview", params: { path: "/project/logo.png" } })]);
    });

    it("fills an empty editor panel instead of opening a second one", async () => {
      const user = userEvent.setup();
      const api = fakeApi();
      api.panels.push({ panelId: "file-editor:new", viewId: "file-editor", params: {}, title: "Editor" });
      renderFilesView("file-tree", {}, "/files", api);

      await user.click(await screen.findByText("README.md"));
      expect(api.opened).toHaveLength(0);
      expect(api.panels[0]!.params).toEqual({ path: "/project/README.md" });
    });

    it("shows the directory of a file named by the URL", async () => {
      renderFilesView("file-tree", {}, "/files/%2Fproject%2Fsrc%2Findex.ts");
      // The listing mock prefixes entries with the directory it was asked for.
      expect(await screen.findByText("README.md")).toBeInTheDocument();
      // "src" appears both as a breadcrumb segment and as a listed directory.
      expect(screen.getAllByText("src").length).toBeGreaterThan(0);
    });

    it("creates a new file from the breadcrumb actions and opens it", async () => {
      const user = userEvent.setup();
      const { api } = renderFilesView("file-tree");

      await user.click(await screen.findByRole("button", { name: "New file" }));
      const dialog = screen.getByRole("dialog");
      await user.type(within(dialog).getByRole("textbox"), "notes.md");
      await user.click(within(dialog).getByRole("button", { name: "Create" }));

      await waitFor(() => expect(writeFile).toHaveBeenCalledWith({ path: "/project/notes.md", content: "", provider: "local" }));
      await waitFor(() => expect(api.opened).toEqual([expect.objectContaining({ viewId: "file-editor", params: { path: "/project/notes.md" } })]));
    });
  });

  describe("listing states and row actions", () => {
    it("shows a listing error with a working Retry", async () => {
      const user = userEvent.setup();
      state.listingError = new Error("permission denied");
      renderFilesView("file-tree");

      expect(await screen.findByText("Could not list this folder")).toBeInTheDocument();
      expect(screen.getByText("permission denied")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Retry" }));
      expect(mutateListing).toHaveBeenCalled();
    });

    it("explains how to configure a provider when none exist", async () => {
      state.providers = [];
      renderFilesView("file-tree");

      const empty = await screen.findByTestId("files-no-providers");
      expect(empty).toHaveTextContent("filesystem.agentDefaults.provider");
      expect(within(empty).getByRole("link", { name: "Open configuration" })).toHaveAttribute("href", "/configuration");
    });

    it("labels search as a file-name search", async () => {
      renderFilesView("file-tree");
      expect(await screen.findByPlaceholderText("Search file names…")).toBeInTheDocument();
    });

    it("reveals row actions on keyboard focus and touch, with an overflow menu for phones", async () => {
      const user = userEvent.setup();
      renderFilesView("file-tree");

      const rename = await screen.findByRole("button", { name: "Rename README.md" });
      expect(rename.parentElement).toHaveClass("group-focus-within:opacity-100", "focus-within:opacity-100", "[@media(hover:none)]:opacity-100");

      await user.click(screen.getByRole("button", { name: "Actions for README.md" }));
      const menu = await screen.findByRole("menu");
      expect(
        within(menu)
          .getAllByRole("menuitem")
          .map(item => item.textContent?.trim()),
      ).toEqual(["Download", "Duplicate", "Rename", "Delete"]);
      await user.click(within(menu).getByRole("menuitem", { name: "Rename" }));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });

    it("activates a row action with Enter without opening the row", async () => {
      const user = userEvent.setup();
      const { api } = renderFilesView("file-tree");

      (await screen.findByRole("button", { name: "Rename README.md" })).focus();
      await user.keyboard("{Enter}");
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(api.opened).toHaveLength(0);
    });

    it("duplicates a file next to itself under the first free name", async () => {
      const user = userEvent.setup();
      existing.add("/project/README copy.md");
      renderFilesView("file-tree");

      await user.click(await screen.findByRole("button", { name: "Duplicate README.md" }));
      await waitFor(() =>
        expect(copy).toHaveBeenCalledWith({ provider: "local", source: "/project/README.md", destination: "/project/README copy 2.md", overwrite: false }),
      );
    });

    it("offers folder delete but not Duplicate for folders", async () => {
      renderFilesView("file-tree");
      expect(await screen.findByRole("button", { name: "Rename src" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Duplicate src" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete folder src" })).toBeInTheDocument();
    });

    it("deletes a folder after a confirmation that says how much is inside, even when file deletes skip confirmation", async () => {
      const user = userEvent.setup();
      setConfirmSkipped("Delete", true);
      const api = fakeApi();
      api.openView("file-editor", { path: "/project/src/index.ts" });
      setFileDraft(fileDraftKey("local", "/project/src/index.ts"), "draft inside");
      renderFilesView("file-tree", {}, "/files", api);

      await user.click(await screen.findByRole("button", { name: "Delete folder src" }));
      await waitFor(() => expect(countDirectoryEntries).toHaveBeenCalledWith({ path: "/project/src", provider: "local" }));
      const dialog = await screen.findByRole("dialog");
      await waitFor(() => expect(dialog).toHaveTextContent("Delete folder “src” and the 3 files and 1 folder inside it?"));
      expect(deleteDirectory).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole("button", { name: "Delete folder" }));
      await waitFor(() => expect(deleteDirectory).toHaveBeenCalledWith({ path: "/project/src", provider: "local" }));
      await waitFor(() => expect(api.panels.some(panel => panel.viewId === "file-editor")).toBe(false));
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

    it("moves a renamed file's unsaved draft and open editor to the new path", async () => {
      const user = userEvent.setup();
      const api = fakeApi();
      const panelId = api.openView("file-editor", { path: "/project/README.md" });
      setFileDraft(fileDraftKey("local", "/project/README.md"), "unsaved edits");
      renderFilesView("file-tree", {}, "/files/%2Fproject%2FREADME.md", api);

      await renameTo(user, "README.md", "NOTES.md");

      await waitFor(() => expect(rename).toHaveBeenCalledWith({ oldPath: "/project/README.md", newPath: "/project/NOTES.md", provider: "local" }));
      await waitFor(() => expect(api.panels.find(panel => panel.panelId === panelId)?.params).toEqual({ path: "/project/NOTES.md" }));
      expect(getFileDraft(fileDraftKey("local", "/project/NOTES.md"))).toBe("unsaved edits");
      expect(getFileDraft(fileDraftKey("local", "/project/README.md"))).toBeNull();
      await waitFor(() => expect(pathname()).toBe("/files/%2Fproject%2FNOTES.md"));
    });

    it("re-points panels and drafts of files inside a renamed directory", async () => {
      const user = userEvent.setup();
      const api = fakeApi();
      const editorId = api.openView("file-editor", { path: "/project/src/index.ts" });
      const previewId = api.openView("file-preview", { path: "/project/src/logo.png" });
      const otherId = api.openView("file-editor", { path: "/project/srcfile.ts" });
      setFileDraft(fileDraftKey("local", "/project/src/index.ts"), "inner draft");
      setFileDraft(fileDraftKey("local", "/project/srcfile.ts"), "sibling draft");
      renderFilesView("file-tree", {}, "/files", api);

      await renameTo(user, "src", "lib");

      await waitFor(() => expect(rename).toHaveBeenCalledWith({ oldPath: "/project/src", newPath: "/project/lib", provider: "local" }));
      await waitFor(() => expect(api.panels.find(panel => panel.panelId === editorId)?.params).toEqual({ path: "/project/lib/index.ts" }));
      expect(api.panels.find(panel => panel.panelId === previewId)?.params).toEqual({ path: "/project/lib/logo.png" });
      // A sibling that merely shares the prefix is left alone.
      expect(api.panels.find(panel => panel.panelId === otherId)?.params).toEqual({ path: "/project/srcfile.ts" });
      expect(getFileDraft(fileDraftKey("local", "/project/lib/index.ts"))).toBe("inner draft");
      expect(getFileDraft(fileDraftKey("local", "/project/src/index.ts"))).toBeNull();
      expect(getFileDraft(fileDraftKey("local", "/project/srcfile.ts"))).toBe("sibling draft");
    });

    it("deletes with the current provider when confirmation is skipped, closing panels and dropping the draft", async () => {
      const user = userEvent.setup();
      // Providers are still loading on the first render, so the provider starts out null.
      state.providers = [];
      setConfirmSkipped("Delete", true);
      const api = fakeApi();
      api.openView("file-editor", { path: "/project/README.md" });
      setFileDraft(fileDraftKey("local", "/project/README.md"), "doomed draft");
      renderFilesView("file-tree", {}, "/files", api);

      // Providers arrive; a store update re-renders the tree with the resolved provider.
      state.providers = ["local"];
      act(() => setFilesBrowserState({ providerOverride: "local" }));
      await user.click(await screen.findByRole("button", { name: "Delete README.md" }));

      await waitFor(() => expect(deleteFile).toHaveBeenCalledWith({ path: "/project/README.md", provider: "local" }));
      await waitFor(() => expect(api.panels.some(panel => panel.viewId === "file-editor")).toBe(false));
      expect(getFileDraft(fileDraftKey("local", "/project/README.md"))).toBeNull();
    });
  });

  describe("content search", () => {
    it("lists file:line matches under the current folder and opens the editor at the line", async () => {
      const user = userEvent.setup();
      const api = fakeApi();
      renderFilesView("file-tree", {}, "/files", api);

      await user.click(await screen.findByRole("button", { name: "Contents" }));
      await user.type(screen.getByLabelText("Search file contents"), "needle");

      expect(await screen.findByText("3 matches in 2 files")).toBeInTheDocument();
      expect(searchFileContents).toHaveBeenLastCalledWith(expect.objectContaining({ provider: "local", path: "/project", query: "needle", limit: 200 }));
      await user.click(screen.getByRole("button", { name: "Open src/a.ts at line 9" }));

      expect(getPendingRevealForTest()).toMatchObject({ path: "/project/src/a.ts", line: 9 });
      await waitFor(() => expect(api.opened).toEqual([expect.objectContaining({ viewId: "file-editor", params: { path: "/project/src/a.ts" } })]));
      expect(pathname()).toBe("/files/%2Fproject%2Fsrc%2Fa.ts");
    });

    it("waits for two characters before searching", async () => {
      const user = userEvent.setup();
      renderFilesView("file-tree");

      await user.click(await screen.findByRole("button", { name: "Contents" }));
      await user.type(screen.getByLabelText("Search file contents"), "x");
      expect(await screen.findByText("Search file contents")).toBeInTheDocument();
      expect(searchFileContents).not.toHaveBeenCalled();
    });
  });

  describe("versions", () => {
    it("previews an archived version and restores it through the normal save", async () => {
      const user = userEvent.setup();
      state.contents["/project/versioned.ts"] = "new text";
      renderFilesView("file-editor", { path: "/project/versioned.ts" });

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

    it("explains when a file has no archived versions", async () => {
      const user = userEvent.setup();
      listFileVersions.mockImplementationOnce(async () => ({ versions: [] }));
      renderFilesView("file-editor", { path: "/project/unversioned.ts" });

      await user.click(await screen.findByRole("button", { name: "Versions" }));
      expect(await screen.findByText("No earlier versions")).toBeInTheDocument();
    });
  });

  describe("editor", () => {
    it("edits a file, marks the tab dirty and saves with Ctrl+S", async () => {
      const user = userEvent.setup();
      const { panel } = renderFilesView("file-editor", { path: "/project/README.md" }, "/files/%2Fproject%2FREADME.md");

      const editor = await screen.findByLabelText("Markdown editor");
      expect(editor).toHaveValue("# Hello");
      await waitFor(() => expect(panel.title).toBe("README.md"));

      await user.clear(editor);
      await user.type(editor, "# Changed");
      await waitFor(() => expect(getPanelBadge(panel.panelId)?.title).toBe("Unsaved changes"));

      await user.keyboard("{Control>}s{/Control}");
      await waitFor(() => expect(writeFile).toHaveBeenCalledWith({ path: "/project/README.md", content: "# Changed", provider: "local" }));
      await waitFor(() => expect(getPanelBadge(panel.panelId)).toBeNull());
    });

    it("keeps text typed while a save is in flight", async () => {
      const user = userEvent.setup();
      let finishWrite!: () => void;
      writeFile.mockImplementationOnce(() => new Promise(resolve => (finishWrite = () => resolve({ success: true }))));
      const { panel } = renderFilesView("file-editor", { path: "/project/README.md" });

      const editor = await screen.findByLabelText("Markdown editor");
      await user.type(editor, " one");
      await user.keyboard("{Control>}s{/Control}");
      await waitFor(() => expect(writeFile).toHaveBeenCalledWith({ path: "/project/README.md", content: "# Hello one", provider: "local" }));

      await user.type(editor, " two");
      finishWrite();

      await waitFor(() => expect(mutateFileContents).toHaveBeenCalled());
      expect(getFileDraft(fileDraftKey("local", "/project/README.md"))).toBe("# Hello one two");
      expect(editor).toHaveValue("# Hello one two");
      expect(getPanelBadge(panel.panelId)).toMatchObject({ tone: "warning" });
    });

    it("keeps an unsaved draft when the panel is closed and reopened", async () => {
      const user = userEvent.setup();
      const first = renderFilesView("file-editor", { path: "/project/README.md" });
      const editor = await first.findByLabelText("Markdown editor");
      await user.clear(editor);
      await user.type(editor, "draft");
      first.unmount();

      renderFilesView("file-editor", { path: "/project/README.md" });
      expect(await screen.findByLabelText("Markdown editor")).toHaveValue("draft");
    });

    it("waits for a file when opened without one", async () => {
      const { panel } = renderFilesView("file-editor", {});
      expect(await screen.findByText("No file open")).toBeInTheDocument();
      await waitFor(() => expect(panel.title).toBe("Editor"));
    });
  });

  describe("preview", () => {
    it("shows file metadata and closes itself", async () => {
      const user = userEvent.setup();
      const { panel } = renderFilesView("file-preview", { path: "/project/logo.png" }, "/files/%2Fproject%2Flogo.png");

      expect(await screen.findByText("logo.png")).toBeInTheDocument();
      await waitFor(() => expect(panel.title).toBe("logo.png"));
      await user.click(screen.getByRole("button", { name: /Close/i }));
      expect(panel.closed).toBe(true);
    });
  });

  describe("dashboard definition", () => {
    it("opens the file named by the route in the right view", () => {
      const api = fakeApi();
      api.panels.push({ panelId: "file-tree", viewId: "file-tree", params: {}, title: "Files" });
      const match = (fileId: string) => ({ pathname: `/files/${encodeURIComponent(fileId)}`, params: { fileId }, searchParams: new URLSearchParams() });

      dashboard.onNavigate?.(match("/project/README.md"), api);
      dashboard.onNavigate?.(match("/project/logo.png"), api);

      expect(api.opened.map(open => [open.viewId, open.params])).toEqual([
        ["file-editor", { path: "/project/README.md" }],
        ["file-preview", { path: "/project/logo.png" }],
      ]);
      expect(api.opened[0]!.options).toMatchObject({ position: "right", referencePanelId: "file-tree" });
    });

    it("maps the active panel back to a URL", () => {
      const match = { pathname: "/files", params: {}, searchParams: new URLSearchParams() };
      const path = (viewId: string, params: ViewParams = {}) => dashboard.pathForActivePanel?.({ panelId: viewId, viewId, params }, match);
      expect(path("file-editor", { path: "/project/README.md" })).toBe("/files/%2Fproject%2FREADME.md");
      expect(path("file-preview", { path: "/project/logo.png" })).toBe("/files/%2Fproject%2Flogo.png");
      expect(path("file-editor")).toBe("/files");
      expect(path("file-tree")).toBeNull();
    });
  });
});
