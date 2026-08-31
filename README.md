# @tokenring-ai/filesystem

Unified API for file operations including reading, writing, and smart patching.

## Overview

The `@tokenring-ai/filesystem` package provides a unified, abstracted filesystem interface for Token Ring applications. It enables secure file operations including reading, writing, searching, and editing through a provider-based architecture.

Key capabilities include:

- File reading with image downsampling, binary detection, and glob pattern resolution
- File writing with read-before-write enforcement and post-write validation
- In-place file editing with word-based matching
- Glob pattern matching and grep-based text search with configurable snippets
- Multi-provider architecture for different filesystem implementations
- Chat-based file management commands
- Context-aware file tracking and state management
- RPC endpoints for remote file operations
- Scripting functions for common file operations
- Automatic ignore filter system (`.gitignore`, `.aiignore` support)
- File validation system for post-write validation via lifecycle hooks
- File watching with configurable actions (e.g. enqueue changed files)
- HTTP file serving with authentication for browser-based access
- RAG-based intelligent file search and injection via lifecycle hooks

The package integrates deeply with the agent system, providing both tools for AI-driven operations and chat commands for user interface control.

### Integration Points

- **ChatService** — registers five file operation tools (`file_edit`, `file_write`, `file_read`, `file_glob`, `file_grep`)
- **AgentLifecycleService** — registers three lifecycle hooks (`clearReadFiles`, `addSelectedFiles`, `addSimilarFiles`)
- **AgentCommandService** — registers ten chat commands for file and provider management
- **ScriptingService** — registers four scripting functions (`createFile`, `deleteFile`, `globFiles`, `searchFiles`)
- **RpcService** — registers an RPC endpoint at `/rpc/filesystem` with 18 methods
- **WebHostService** — registers an HTTP resource for browser-based file access
- **QueueService** — used by `FileWatchService` to enqueue changed files

## Installation

```bash
bun add @tokenring-ai/filesystem
```

```typescript
import TokenRingApp from "@tokenring-ai/app";
import PluginManager from "@tokenring-ai/app/PluginManager";
import filesystemPlugin from "@tokenring-ai/filesystem/plugin";

const app = new TokenRingApp({ app: { workingDirectory, workspaceDirectory, configDirectories } });
const pluginManager = app.addService(new PluginManager(app));
await pluginManager.installPlugins([filesystemPlugin]);
```

## Chat Commands

### file

Manage files in the chat session.

| Command | Description |
|---------|-------------|
| `/file select` | Open interactive file selector |
| `/file add [paths...]` | Add files to the chat session |
| `/file remove [paths...]` | Remove files from the chat session |
| `/file list` | List all files in the chat session |
| `/file clear` | Remove all files from the chat session |
| `/file default` | Reset to default files from config |

```bash
/file select
/file add src/main.ts src/utils.ts
/file remove src/main.ts
/file list
/file clear
/file default
```

### filesystem provider

Manage filesystem providers.

| Command | Description |
|---------|-------------|
| `/filesystem provider get` | Show current filesystem provider |
| `/filesystem provider set <name>` | Set the active filesystem provider |
| `/filesystem provider select` | Interactively select a filesystem provider |
| `/filesystem provider reset` | Reset to initial filesystem provider |

```bash
/filesystem provider get
/filesystem provider set posix
/filesystem provider select
/filesystem provider reset
```

## Tools

Tools are exported from `tools.ts` and registered with `ChatService` during plugin installation. Five tools are actively exported; `file_append` and `file_search` exist in the source but are not exported.

| Tool | Display Name | Description |
|------|--------------|-------------|
| `file_edit` | `Filesystem/edit` | Modifies an existing file by finding a string and replacing it. |
| `file_write` | `Filesystem/write` | Writes a file to the filesystem. Paths are relative to the project root directory, and should not have a prefix (e.g. 'subdirectory/file.txt' or 'docs/file.md'). Directories are auto-created as needed. Content is full text (UTF-8), and must contain the ENTIRE content of the file |
| `file_read` | `Filesystem/read` | Read files from the filesystem. Retrieves file contents based on file paths or glob patterns. |
| `file_glob` | `Filesystem/glob` | List files matching glob patterns relative to the project root folder. |
| `file_grep` | `Filesystem/grep` | Search for text patterns within files. Supports plain string and regex patterns. |

### file_edit

**Description:**

```text
Modifies an existing file by finding a string and replacing it.
- The find string is trimmed; its first word must appear verbatim in the file.
- Remaining words in the find string must follow in order, separated by any amount of whitespace (the whitespace in the find string is not significant).
- The entire matched region (from the start of the first word through the end of the last word) is replaced with the replace string.
- If multiple matches are found and `multiple` is false (default), the matches are returned so you can refine the find string. Set `multiple` to true to replace all matches.
```

**Schema strictness:** `inputSchema` is not `.strict()`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `path` | `string` | — | Relative path of the file to edit (e.g., 'src/main.ts'). Relative to the project root directory. |
| `find` | `string` | — | Text to find. Will be trimmed; whitespace between words is not significant but word order and exact word content are. |
| `replace` | `string` | — | Replacement text. Replaces the matched region verbatim. Use an empty string to delete the match. |
| `multiple` | `boolean` | `false` | If true, replace every match. If false and more than one match is found, the matches are returned without modifying the file. |

**Adjust Activation:** Returns `enabled && agent.getState(FileSystemState).settings.fileEdit.enabled`. The tool is automatically disabled after `disableAfterConsecutiveFailures` consecutive failed edits.

**Throws:** `ToolCallError` if file modification is disabled for the session, if the file cannot be read, or if no match is found.

### file_write

**Description:**

```text
Writes a file to the filesystem. Paths are relative to the project root directory, and should not have a prefix (e.g. 'subdirectory/file.txt' or 'docs/file.md'). Directories are auto-created as needed. Content is full text (UTF-8), and must contain the ENTIRE content of the file
```

**Schema strictness:** `inputSchema` is not `.strict()`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Relative path of the file to write (e.g., 'src/main.ts' or 'docs/design.md'). Starts from the project root directory. Required. |
| `content` | `string` | Content to write to the file. ALWAYS include the ENTIRE file contents to avoid data loss. |

**Behavior:**

- Enforces read-before-write policy if `requireReadBeforeWrite` is enabled; returns the current file contents in the error result to expedite re-submission
- Creates parent directories automatically if needed
- Returns a unified diff if the file existed before (up to `maxReturnedDiffSize` limit)
- Marks file as read in state with modification time
- Runs file validator if `validateWrittenFiles` is enabled

### file_read

**Description:**

```text
Read files from the filesystem. Retrieves file contents based on file paths or glob patterns.
- The filesystem scope is the entire sandboxed root directory accessible by the FileSystemService (e.g., the project's root folder).
- File paths use Unix-style '/' separators and are relative to the root folder defined by the user.
```

**Schema strictness:** `inputSchema` uses `.strict()`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `files` | `string[]` | List of file paths or glob patterns (e.g., '**/*.ts', 'path/to/file.txt'). |

**Behavior:**

- Resolves glob patterns to specific files
- Reads file contents (up to `maxTextFileReadSize` limit for text files)
- Downsamples images to `imageFileMaxResolution` if needed
- Returns `[File is binary and cannot be displayed]` for binary files
- Handles directories by recursively reading contents
- Returns a directory listing if more than `maxFileReadCount` files matched
- Marks read files in `FileSystemState` with modification time

### file_glob

**Description:**

```text
List files matching glob patterns relative to the project root folder.
- File paths use Unix-style '/' separators and are relative to the root folder defined by the user.
- When more files match than the configured limit, returns a per-directory match count summary instead of individual files.
```

**Schema strictness:** `inputSchema` uses `.strict()`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filePaths` | `string[]` | `["**/*"]` | List of glob patterns to match files. Examples: "**/*.ts", "path/to/file.txt" |

**Behavior:**

- Resolves glob patterns to specific files
- Returns matched files as a file listing
- When more files match than `maxGlobbedFiles`, returns a per-directory match count summary

### file_grep

**Description:**

```text
Search for text patterns within files. Supports plain string and regex patterns.
- File paths use Unix-style '/' separators and are relative to the root folder defined by the user.
- Searches are OR-based across multiple patterns (any match counts).
- Automatically returns complete file contents, directory listings, directory summaries, or grep-style snippets based on match count.
- When more files match than the configured limit, returns a per-directory match count summary instead of individual files.
```

**Schema strictness:** `inputSchema` uses `.strict()`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filePaths` | `string[]` | `["**/*"]` | List of file paths or glob patterns to search within. Examples: "**/*.ts", "path/to/file.txt" |
| `searchTerms` | `string[]` | — | List of search terms. Plain strings use fuzzy substring match; wrap in '/' for regex. Examples: "searchTerm", "/searchTerm.*/" |

**Adjust Activation:** Returns `enabled && agent.requireService(FileSystemService).supportsGrep(agent)`. The tool is only active when the current filesystem provider implements `grep`.

**Behavior:**

- Plain strings use case-insensitive substring matching
- Regex patterns are enclosed in `/` (e.g., `/class \w+Service/`)
- Returns grep-style snippets with line numbers and context lines (`searchSnippetLinesBefore`, `searchSnippetLinesAfter`)
- When snippet is too large relative to file, returns full file contents instead
- When more files match than `maxSearchSnippetCount`, returns a file listing
- When more files match than `maxGrepResults`, returns a directory summary

## Scripting Functions

The package registers four scripting functions with `ScriptingService` during plugin installation.

| Function | Parameters | Description |
|----------|------------|-------------|
| `createFile` | `path`, `content` | Creates a file with the given content. Returns `` `Created file: ${path}` `` |
| `deleteFile` | `path` | Deletes a file. Returns `` `Deleted file: ${path}` `` |
| `globFiles` | `pattern` | Matches files with a glob pattern. Returns `string[]` |
| `searchFiles` | `searchString` | Searches for text patterns in files. Returns `string[]` where each entry is `${file}:${line}: ${match}` |

```typescript
await scriptingService.executeFunction("createFile", ["src/main.ts", "// content"]);
await scriptingService.executeFunction("deleteFile", ["src/old.ts"]);
const files = await scriptingService.executeFunction("globFiles", ["**/*.ts"]);
const results = await scriptingService.executeFunction("searchFiles", ["function execute"]);
```

## Configuration

```yaml
filesystem:
  agentDefaults:
    provider: "posix"
    workingDirectory: "."
    selectedFiles: ["src/main.ts", "README.md"]
    settings:
      requireReadBeforeWrite: true
      maxReturnedDiffSize: 1024
      validateWrittenFiles: true
      maxFileReadCount: 10
      maxTextFileReadSize: 131072
      imageFileMaxResolution: 1048576
      maxSearchSnippetCount: 10
      maxSearchSnippetSizePercent: 0.3
      searchSnippetLinesBefore: 5
      searchSnippetLinesAfter: 5
      maxGlobbedFiles: 250
      maxGrepResults: 250
      globSummaryDepth: 2
      fileEdit:
        enabled: true
        disableAfterConsecutiveFailures: 2
  watch:
    notes:
      path: "notes"
      include: "\\.md$"
      stabilityThreshold: 5000
      actions:
        - action: "addToQueue"
          queue: "ingest"
```

### agentDefaults

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `provider` | `string` | No | `"posix"` | Filesystem provider new agents use by default (e.g. posix) |
| `workingDirectory` | `string` | No | `"."` | Working directory new agents use by default, either relative to workspace or absolute |
| `selectedFiles` | `string[]` | No | `[]` | Files preselected into new agents' context |
| `settings` | `FileSystemToolSettingsSchema` | No | (schema defaults) | Filesystem tool settings (see below) |

### agentDefaults.settings

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `requireReadBeforeWrite` | `boolean` | No | `true` | Require the agent to read a file before it may overwrite it |
| `maxReturnedDiffSize` | `number` | No | `1024` | Largest diff echoed back to the agent after a write (bytes) |
| `validateWrittenFiles` | `boolean` | No | `true` | Run registered validators (syntax checks, linters) on written files |
| `maxFileReadCount` | `number` | No | `10` | Most files a single read request may return |
| `maxTextFileReadSize` | `number` | No | `131072` | Largest text file the agent will read in full (bytes) |
| `imageFileMaxResolution` | `number` | No | `1048576` | Largest image resolution the agent will read in full without downsampling (pixels) |
| `maxSearchSnippetCount` | `number` | No | `10` | Most matching snippets returned per search |
| `maxSearchSnippetSizePercent` | `number` | No | `0.3` | Cap on a single snippet's share of the result budget |
| `searchSnippetLinesBefore` | `number` | No | `5` | Context lines shown before each match |
| `searchSnippetLinesAfter` | `number` | No | `5` | Context lines shown after each match |
| `maxGlobbedFiles` | `number` | No | `250` | Most files a single globbed file search may match |
| `maxGrepResults` | `number` | No | `250` | Most file matches a single grep/search operation may return before summarizing by directory |
| `globSummaryDepth` | `number` | No | `2` | Directory depth used when summarizing matches beyond the file limit |
| `fileEdit.enabled` | `boolean` | No | `true` | Allow agents to use the in-place file edit tool |
| `fileEdit.disableAfterConsecutiveFailures` | `number` | No | `2` | Disable the edit tool for a file after this many consecutive failed edits |

### watch

A record of named file watch entries. Each entry triggers actions when matching files stabilize after a change.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | `string` | Yes | — | Directory path to watch (relative to working directory or absolute) |
| `include` | `string` | No | — | Regex matched against relative file paths to include |
| `exclude` | `string` | No | — | Regex matched against relative file paths to exclude |
| `provider` | `string` | No | — | Filesystem provider to watch (defaults to `agentDefaults.provider`) |
| `contentIncludes` | `string` | No | — | Regex pattern matched against the content |
| `stabilityThreshold` | `number` | No | `5000` | Quiet time required before a changed file is considered stable (ms) |
| `actions` | `TriggeredAction[]` | Yes | — | Actions to run when a matching file stabilizes after a change |

**Triggered Actions:**

| Action | Fields | Description |
|--------|--------|-------------|
| `addToQueue` | `queue: string` | Submit the changed file path and contents to the named queue |

### FileSystemAgentConfigSchema

Agent-specific configuration applied via `agent.getAgentConfigSlice("filesystem", FileSystemAgentConfigSchema)`:

```typescript
const FileSystemAgentConfigSchema = z
  .object({
    provider: z.string().exactOptional(),
    workingDirectory: z.string().exactOptional(),
    selectedFiles: z.array(z.string()).exactOptional(),
    settings: FileSystemToolSettingsSchema.partial().optional(),
  })
  .strict()
  .default({});
```

### Schema Metadata

Configuration metadata lives in `schema.ts` via `.meta()` annotations:

| Field | Meta |
|-------|------|
| `filesystem` | label: "Filesystem", description: "Filesystem access for agents" |
| `agentDefaults` | label: "Agent Defaults", description: "Filesystem behavior applied to newly created agents" |
| `agentDefaults.provider` | description: "Filesystem provider new agents use by default (e.g. posix)" |
| `agentDefaults.workingDirectory` | description: "Working directory new agents use by default, either relative to workspace or absolute" |
| `agentDefaults.selectedFiles` | description: "Files preselected into new agents' context" |
| `agentDefaults.settings` | label: "Filesystem Tool Settings" |
| `settings.requireReadBeforeWrite` | description: "Require the agent to read a file before it may overwrite it" |
| `settings.maxReturnedDiffSize` | unit: "bytes", description: "Largest diff echoed back to the agent after a write" |
| `settings.validateWrittenFiles` | description: "Run registered validators (syntax checks, linters) on written files" |
| `settings.maxFileReadCount` | description: "Most files a single read request may return" |
| `settings.maxTextFileReadSize` | unit: "bytes", description: "Largest text file the agent will read in full" |
| `settings.imageFileMaxResolution` | unit: "pixels", description: "Largest image resolution the agent will read in full without downsampling" |
| `settings.maxSearchSnippetCount` | description: "Most matching snippets returned per search" |
| `settings.maxSearchSnippetSizePercent` | description: "Cap on a single snippet's share of the result budget" |
| `settings.searchSnippetLinesBefore` | description: "Context lines shown before each match" |
| `settings.searchSnippetLinesAfter` | description: "Context lines shown after each match" |
| `settings.maxGlobbedFiles` | description: "Most files a single globbed file search may match" |
| `settings.maxGrepResults` | description: "Most file matches a single grep/search operation may return before summarizing by directory" |
| `settings.globSummaryDepth` | description: "Directory depth used when summarizing matches beyond the file limit" |
| `settings.fileEdit` | label: "File Edit", advanced: true, description: "Behavior of the in-place file edit tool" |
| `settings.fileEdit.enabled` | description: "Allow agents to use the in-place file edit tool" |
| `settings.fileEdit.disableAfterConsecutiveFailures` | description: "Disable the edit tool for a file after this many consecutive failed edits" |
| `watch` | label: "File Watching", description: "Automatically trigger actions when files change" |
| `watch[].include` | uiType: "regex", description: "Regex matched against relative file paths to include" |
| `watch[].exclude` | uiType: "regex", description: "Regex matched against relative file paths to exclude" |
| `watch[].provider` | description: "Filesystem provider to watch (defaults to agentDefaults.provider)" |
| `watch[].contentIncludes` | uiType: "regex", description: "Regex pattern matched against the content" |
| `watch[].stabilityThreshold` | unit: "ms", description: "Quiet time required before a changed file is considered stable" |
| `watch[].actions` | description: "Actions to run when a matching file stabilizes after a change" |
| `watch[].actions[].queue` | description: "Name of the queue to submit the file to" |

## Core Components

### FileSystemService

The main service class implementing `TokenRingService`. It manages filesystem providers, agent state, and delegates operations to the active provider for each agent.

**File:** `plugin/filesystem/FileSystemService.ts`

```typescript
import FileSystemService from "@tokenring-ai/filesystem/FileSystemService";
```

#### Constructor

```typescript
constructor(options?: z.output<typeof FileSystemConfigSchema>)
```

#### Provider Management

| Method | Description |
|--------|-------------|
| `registerFileSystemProvider(name: string, provider: FileSystemProvider)` | Registers a provider (alias for `KeyedRegistry.set`) |
| `unregisterFileSystemProvider(name: string)` | Unregisters a provider |
| `requireFileSystemProviderByName(name: string): FileSystemProvider` | Retrieves a registered provider, throws if not found |
| `getFilesystemProviderNames(): string[]` | Returns all registered provider names |
| `setActiveFileSystem(providerName: string, agent: Agent): void` | Sets the active provider for an agent |
| `requireActiveFileSystem(agent: Agent): FileSystemProvider` | Gets the active provider for an agent, throws if none configured |
| `supportsGrep(agent: Agent): boolean` | Checks if the active filesystem supports grep |

#### State Management

| Method | Description |
|--------|-------------|
| `attach(agent: Agent, creationContext: AgentCreationContext): void` | Initializes `FileSystemState` for agent from config defaults |
| `addFileToChat(file: string, agent: Agent): Promise<void>` | Adds file to chat context; throws if file does not exist |
| `removeFileFromChat(file: string, agent: Agent): void` | Removes file from chat context; throws if file not in chat |
| `getFilesInChat(agent: Agent): EnhancedSet<string>` | Returns set of files in chat |
| `setFilesInChat(files: Iterable<string>, agent: Agent): Promise<void>` | Replaces files in chat context; validates all files exist |
| `setDirty(dirty: boolean, agent: Agent): void` | Marks filesystem as modified |
| `isDirty(agent: Agent): boolean` | Checks if files have been modified |

#### File Operations

| Method | Description |
|--------|-------------|
| `writeFile(path: string, content: string \| Buffer, agent: Agent): MaybePromise<boolean>` | Write or overwrite file; sets dirty |
| `appendFile(filePath: string, finalContent: string \| Buffer, agent: Agent): MaybePromise<boolean>` | Append to file; sets dirty |
| `deleteFile(path: string, agent: Agent): MaybePromise<boolean>` | Delete file; sets dirty |
| `readFile(path: string, agent: Agent): MaybePromise<Buffer \| null>` | Read file as buffer |
| `readTextFile(path: string, agent: Agent): Promise<string \| null>` | Read file as UTF-8 string |
| `rename(oldPath: string, newPath: string, agent: Agent): MaybePromise<boolean>` | Rename file |
| `exists(path: string, agent: Agent): Promise<boolean>` | Check if file exists; returns false on error |
| `stat(path: string, agent: Agent): Promise<StatLike>` | Get file statistics with relative path |
| `getModifiedTimeNanos(path: string, agent: Agent): Promise<number \| null>` | Get file modification time in milliseconds (returns `null` if file does not exist) |

#### Directory Operations

| Method | Description |
|--------|-------------|
| `getDirectoryTree(path: string, options, agent: Agent): AsyncGenerator<string>` | Async generator for directory traversal; yields relative paths |
| `createDirectory(path: string, options: { recursive?: boolean }, agent: Agent): MaybePromise<boolean>` | Create directory; sets dirty |
| `copy(source: string, destination: string, options: { overwrite?: boolean }, agent: Agent): MaybePromise<boolean>` | Copy file or directory; sets dirty |
| `glob(pattern: string, options, agent: Agent): Promise<string[]>` | Match files with glob pattern; uses provider glob or fallback |
| `watch(dir: string, options, agent: Agent): Promise<FileSystemWatcher>` | Watch for filesystem changes; throws if provider does not support watching |

#### Search Operations

| Method | Description |
|--------|-------------|
| `grep(searchString: string \| string[], options, agent: Agent): Promise<GrepResult[]>` | Search for text patterns; throws if provider does not support grep |

#### Lifecycle

| Method | Description |
|--------|-------------|
| `reconfigure(options: z.output<typeof FileSystemConfigSchema>): void` | Updates the service configuration |
| `start(): void` | Resolves and caches the default provider; throws if not registered |

### FileSystemProvider

Abstract interface for filesystem implementations. Implementations can provide virtual, remote, or local filesystem access.

**File:** `plugin/filesystem/FileSystemProvider.ts`

```typescript
import type { FileSystemProvider, StatLike, GrepResult, FileSystemWatcher, DirectoryTreeOptions, GlobOptions, WatchOptions, GrepOptions } from "@tokenring-ai/filesystem/FileSystemProvider";
```

#### StatLike

A discriminated union on `exists`:

```typescript
type StatLike =
  | {
      path: string;
      absolutePath?: string;
      exists: true;
      isFile?: boolean;
      isDirectory?: boolean;
      isSymbolicLink?: boolean;
      size?: number;
      created?: Date;
      modified?: Date;
      accessed?: Date;
    }
  | {
      path: string;
      exists: false;
    };
```

#### Interface Methods

| Method | Description |
|--------|-------------|
| `getDirectoryTree(absolutePath: string, params?: DirectoryTreeOptions): AsyncGenerator<string> \| Generator<string>` | Walk directory tree, yielding absolute paths |
| `writeFile(absolutePath: string, content: string \| Buffer): MaybePromise<boolean>` | Write file |
| `appendFile(absoluteFilePath: string, finalContent: string \| Buffer): MaybePromise<boolean>` | Append to file |
| `deleteFile(absolutePath: string): MaybePromise<boolean>` | Delete file |
| `readFile(absolutePath: string): MaybePromise<Buffer \| null>` | Read file as buffer |
| `rename(oldAbsolutePath: string, newAbsolutePath: string): MaybePromise<boolean>` | Rename file |
| `exists(absolutePath: string): MaybePromise<boolean>` | Check if path exists |
| `stat(absolutePath: string): MaybePromise<StatLike>` | Get file statistics |
| `createDirectory(absolutePath: string, options?: { recursive?: boolean }): MaybePromise<boolean>` | Create directory |
| `copy(absoluteSource: string, absoluteDestination: string, options?: { overwrite?: boolean }): MaybePromise<boolean>` | Copy file or directory |
| `glob?(absolutePattern: string, options?: GlobOptions): MaybePromise<string[]>` | Optional: native glob support |
| `watch?(absoluteDir: string, options?: WatchOptions): MaybePromise<FileSystemWatcher>` | Optional: file watching support |
| `grep?(searchString: string \| string[], options?: GrepOptions): MaybePromise<GrepResult[]>` | Optional: content search support |

### FileWatchService

Watches configured filesystem paths and runs actions when files stabilize after changes. Configured via the `watch` map in `FileSystemConfigSchema`.

**File:** `plugin/filesystem/FileWatchService.ts`

```typescript
import FileWatchService from "@tokenring-ai/filesystem/FileWatchService";
```

#### Methods

| Method | Description |
|--------|-------------|
| `reconfigure(options: FileSystemConfig): Promise<void>` | Reconciles live watchers against the config's `watch` map; creates, updates, or closes watchers as needed |
| `stop(): void` | Closes all active watchers and clears the map |

#### Behavior

- Opens a watcher for each entry in the `watch` config map
- Uses the provider specified by `watch[].provider` or defaults to `agentDefaults.provider`
- Skips the watcher's initial scan of existing files (bootstrap window of `stabilityThreshold + 500ms`)
- Filters files by `include`/`exclude` regex patterns and the base ignore filter (`.gitignore`, `.aiignore`)
- Optionally filters by `contentIncludes` regex matched against file content
- When a file stabilizes after a change, executes configured actions:
  - `addToQueue`: enqueues the file path and contents to the named `QueueService` queue with MIME type detection

### FileSystemHttpResource

Serves and accepts file uploads from registered filesystem providers over HTTP. Registered as a `WebResource` with `WebHostService` under the name "Workspace Filesystem".

**File:** `plugin/filesystem/FileSystemHttpResource.ts`

#### Routes

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/fs/session` | GET, POST | Establish a session cookie from Basic auth credentials |
| `/api/fs/{provider}/{path...}` | GET, HEAD, PUT | Read, stream, or upload files |

#### Authentication

- Always requires authentication via HTTP Basic or a session cookie obtained from a prior Basic login
- Session cookies use a 7-day TTL with sliding expiration
- Returns `503` if `WebHostService` auth is not configured
- Returns `401` with `WWW-Authenticate: Basic` for unauthenticated requests

#### HTTP File Operations

- **GET/HEAD**: Serves file contents with MIME type detection; streams local files via `Bun.file` when an absolute path is available; `?download=1` sets `Content-Disposition: attachment`
- **PUT**: Uploads file contents to the provider
- Path traversal protection: rejects null bytes, backslashes, and `../` sequences
- Returns `404` for unknown providers, missing files, or directories

### FileMatchResource

A resource class for matching files based on include/exclude patterns. Provides async generation of matched files using `FileSystemService`.

**File:** `plugin/filesystem/FileMatchResource.ts`

```typescript
import FileMatchResource from "@tokenring-ai/filesystem/FileMatchResource";
```

#### FileMatchResource Methods

| Method | Description |
|--------|-------------|
| `constructor(items: ParsedFileMatch[])` | Creates a resource from parsed match items, compiling `include` and `exclude` strings to regex |
| `getMatchedFiles(agent: Agent): AsyncGenerator<string>` | Yields relative paths of files matching all item patterns |
| `addFilesToSet(set: Set<string>, agent: Agent): Promise<void>` | Adds all matched files to the given set |

### FileSystemState

Tracks filesystem-related state for agents.

**File:** `plugin/filesystem/state/fileSystemState.ts`

| Property | Type | Description |
|----------|------|-------------|
| `selectedFiles` | `EnhancedSet<string>` | Files in chat context |
| `providerName` | `string \| null` | Active provider name |
| `workingDirectory` | `string` | Working directory for path resolution |
| `dirty` | `boolean` | Whether files have been modified |
| `readFiles` | `EnhancedMap<string, number>` | Files that have been read (path to modification time in ms) |
| `hasInjectedSimilarFiles` | `boolean` | Whether RAG-related files have been injected |
| `fileEditFailureCount` | `number` | Consecutive edit failure count |
| `settings` | `z.output<typeof FileSystemToolSettingsSchema>` | Current tool settings |
| `initialConfig` | `z.output<typeof FileSystemConfigSchema>["agentDefaults"]` | Initial configuration from agent defaults |

#### State Methods

| Method | Description |
|--------|-------------|
| `reset()` | Reset to initial config |
| `serialize()` | Return serializable state |
| `deserialize(data)` | Restore state from object |
| `show()` | Return human-readable summary |

## Services / Lifecycle Methods

### Service Registration

```typescript
app.addService(new FileSystemService());
app.addService(new FileWatchService(app));
```

### Plugin Lifecycle

| Property | Value |
|----------|-------|
| Name | `@tokenring-ai/filesystem` |
| Display Name | `Filesystem Abstraction` |
| Version | (from `package.json`) |
| Description | Unified API for file operations including reading, writing, and smart patching. |
| Config Schema | `z.object({ filesystem: FileSystemConfigSchema.exactOptional() })` |

**install(app):**

1. Registers scripting functions (`createFile`, `deleteFile`, `globFiles`, `searchFiles`) with `ScriptingService`
2. Registers tools with `ChatService`
3. Registers lifecycle hooks (`clearReadFiles`, `addSelectedFiles`, `addSimilarFiles`) with `AgentLifecycleService`
4. Registers agent commands with `AgentCommandService`
5. Adds `FileSystemService` and `FileWatchService` as services
6. Registers the `/rpc/filesystem` RPC endpoint with `RpcService`
7. Registers the "Workspace Filesystem" HTTP resource with `WebHostService`

**reconfigure(app, config):**

1. Calls `FileSystemService.reconfigure(config.filesystem)` if `config.filesystem` is present
2. Calls `FileWatchService.reconfigure(config.filesystem)` if `config.filesystem` is present

### Lifecycle Hooks

#### clearReadFiles

| Property | Value |
|----------|-------|
| Name | `clearReadFiles` |
| Display Name | `Filesystem/Clear Read Files` |
| Description | Automatically clears the read files state when the chat context is compacted or cleared |
| Trigger | `AfterChatCompaction`, `AfterChatClear` |

```typescript
agent.mutateState(FileSystemState, state => {
  state.readFiles.clear();
  state.dirty = false;
});
```

#### addSelectedFiles

| Property | Value |
|----------|-------|
| Name | `addSelectedFiles` |
| Display Name | `Filesystem/Add selected files to chat` |
| Description | Attaches mentioned or selected files to the chat message |
| Trigger | `BeforeInputReceived` |

**Behavior:**

- Skips command messages (starting with `/`) except `/chat send`
- Collects files from `state.selectedFiles` and paths mentioned in the input message (tokens containing `/`)
- Skips files already in `state.readFiles`
- Reads file contents and attaches as text artifacts
- For directories, attaches a directory listing
- Marks files as read in `state.readFiles` with modification time

#### addSimilarFiles

| Property | Value |
|----------|-------|
| Name | `addSimilarFiles` |
| Display Name | `Filesystem/Add similar files to chat` |
| Description | Searches the filesystem for files relevant to the user's input and attaches the matching filenames and chunks to the chat message |
| Trigger | `BeforeInputReceived` |

**Behavior:**

- Skips command messages (starting with `/`) except `/chat send`
- Only runs once per session (tracked via `state.hasInjectedSimilarFiles`)
- Extracts keywords from user input using `extractKeywords()` (quoted phrases, file paths, file names, CamelCase/snake_case splitting, stop word filtering)
- Detects file extensions using `extractFileExtensions()` (direct mentions and language patterns)
- Searches filesystem using `searchFiles()` (filename matching + content grep)
- Formats results as a markdown document with filenames, match types, and matching line chunks (up to 5 per file)
- Attaches results as artifact with `mimeType: "text/markdown"`
- Maximum of 5 related files per injection

**Hook Toggling:**

```typescript
import { AgentLifecycleService } from "@tokenring-ai/lifecycle";

const lifecycleService = agent.getService(AgentLifecycleService);
if (lifecycleService) {
  lifecycleService.disableHooks(agent, ["addSimilarFiles"]);
  lifecycleService.enableHooks(agent, ["addSimilarFiles"]);
  lifecycleService.setEnabledHooks(agent, ["clearReadFiles", "addSelectedFiles"]);
}
```

## RPC

The package registers an RPC endpoint at `/rpc/filesystem` with 18 methods.

**Schema:** `plugin/filesystem/rpc/schema.ts`

| Method | Type | Description |
|--------|------|-------------|
| `getFilesystemProviders` | query | Get all registered filesystem provider names |
| `readTextFile` | query | Read file content as UTF-8 text |
| `readFileBase64` | query | Read file content as base64-encoded bytes |
| `exists` | query | Check if a file exists |
| `stat` | query | Get file statistics (dates encoded as ISO 8601) |
| `glob` | query | Match files with a glob pattern |
| `searchWorkspaceFiles` | query | Search workspace files by query string |
| `listDirectory` | query | List directory contents |
| `writeFile` | mutation | Write a file (supports `utf8` and `base64` encoding) |
| `appendFile` | mutation | Append content to a file |
| `deleteFile` | mutation | Delete a file |
| `rename` | mutation | Rename a file |
| `createDirectory` | mutation | Create a directory |
| `copy` | mutation | Copy a file or directory |
| `getFilesystemState` | query | Get filesystem state for an agent |
| `streamFilesystemState` | stream | Stream filesystem state changes for an agent |
| `addFileToChat` | mutation | Add a file to an agent's chat context |
| `removeFileFromChat` | mutation | Remove a file from an agent's chat context |

### Method Details

#### getFilesystemProviders

| Field | Type | Description |
|-------|------|-------------|
| Input | `{}` | — |
| Result | `{ providers: string[] }` | Registered provider names |

#### readTextFile

| Field | Type | Description |
|-------|------|-------------|
| Input | `{ provider: string, path: string }` | — |
| Result | `{ content: string \| null }` | File contents as UTF-8, or `null` if not found |

#### readFileBase64

| Field | Type | Description |
|-------|------|-------------|
| Input | `{ provider: string, path: string }` | — |
| Result | `{ contentBase64: string \| null }` | File contents as base64, or `null` if not found |

#### exists

| Field | Type | Description |
|-------|------|-------------|
| Input | `{ provider: string, path: string }` | — |
| Result | `{ exists: boolean }` | — |

#### stat

| Field | Type | Description |
|-------|------|-------------|
| Input | `{ provider: string, path: string }` | — |
| Result | `{ stats: StatSchema }` | Discriminated union on `exists` (dates as ISO 8601) |

#### glob

| Field | Type | Description |
|-------|------|-------------|
| Input | `{ provider: string, pattern: string }` | — |
| Result | `{ files: string[] }` | Matched file paths |

#### searchWorkspaceFiles

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| Input | `{ provider: string, query: string, limit: number }` | query: `""`, limit: `48` | — |
| Result | `{ files: string[], totalMatches: number }` | — | Files sorted by directory depth then name |

#### listDirectory

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| Input | `{ provider: string, path: string, showHidden: boolean, recursive: boolean }` | showHidden: `false`, recursive: `false` | — |
| Result | `{ files: string[] }` | — | — |

#### writeFile

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| Input | `{ provider: string, path: string, content: string, encoding: "utf8" \| "base64" }` | encoding: `"utf8"` | `base64` content is decoded to raw bytes before writing |
| Result | `{ success: boolean }` | — | — |

#### appendFile

| Field | Type | Description |
|-------|------|-------------|
| Input | `{ provider: string, path: string, content: string }` | — |
| Result | `{ success: boolean }` | — |

#### deleteFile

| Field | Type | Description |
|-------|------|-------------|
| Input | `{ provider: string, path: string }` | — |
| Result | `{ success: boolean }` | — |

#### rename

| Field | Type | Description |
|-------|------|-------------|
| Input | `{ provider: string, oldPath: string, newPath: string }` | — |
| Result | `{ success: boolean }` | — |

#### createDirectory

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| Input | `{ provider: string, path: string, recursive: boolean }` | recursive: `false` | — |
| Result | `{ success: boolean }` | — | — |

#### copy

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| Input | `{ provider: string, source: string, destination: string, overwrite: boolean }` | overwrite: `false` | — |
| Result | `{ success: boolean }` | — | — |

#### getFilesystemState / streamFilesystemState

| Field | Type | Description |
|-------|------|-------------|
| Input | `{ agentId: string }` | — |
| Result | discriminated union on `status` | See below |

**Status: `success`**

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"success"` | — |
| `provider` | `string` | Active provider name (empty string if none) |
| `workingDirectory` | `string` | Working directory |
| `selectedFiles` | `string[]` | Files in chat context |
| `readFiles` | `Record<string, number>` | Read files with modification times |
| `dirty` | `boolean` | Whether files have been modified |

**Status: `agentNotFound`**

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"agentNotFound"` | — |

#### addFileToChat / removeFileFromChat

| Field | Type | Description |
|-------|------|-------------|
| Input | `{ agentId: string, file: string }` | — |
| Result | discriminated union on `status` | See below |

**Status: `success`**

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"success"` | — |
| `success` | `boolean` | — |

**Status: `agentNotFound`**

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"agentNotFound"` | — |

## Ignore Filter System

The package automatically excludes files based on ignore patterns. The filter is created by `createIgnoreFilter` and applied to glob, grep, directory tree, and watch operations.

**Built-in patterns:** `.git`, `*.lock`, `node_modules`, `.*` (all dotfiles)

**Loaded from files:**

- `.gitignore` — Git ignore patterns
- `.aiignore` — AI-specific ignore patterns

```typescript
import createIgnoreFilter from "@tokenring-ai/filesystem/util/createIgnoreFilter";

const ignoreFilter = await createIgnoreFilter({
  exists: (path) => fileSystemService.exists(path, agent),
  readFile: (path) => fileSystemService.readFile(path, agent),
});
```

## File Validation

The file validation system uses the `AgentLifecycleService` hook pattern to validate files after writing.

**File:** `plugin/filesystem/util/runFileValidator.ts`

```typescript
export const FileValidationResultSchema = z.object({
  valid: z.boolean(),
  result: z.string(),
}).nullable();

export class FileValidationAfterFileWrite implements Hook<typeof FileValidationResultSchema> {
  readonly type = "hook";
  readonly returnType = FileValidationResultSchema;
  constructor(
    readonly filePath: string,
    readonly fileExtension: string,
    readonly content: string,
  ) {}
}
```

Validators are registered with `AgentLifecycleService` as hooks against `FileValidationAfterFileWrite`. When `validateWrittenFiles` is enabled, the `file_edit`, `file_write`, and `file_append` tools automatically run validators after writing. Validators return `{ valid: true }` for success or `{ valid: false, result: "error message" }` for failure. Invalid validation results are appended to the tool result.

## Utility Functions

### findWordMatches

Finds word-based matches in file content for the edit tool.

```typescript
type WordMatch = { start: number; end: number };
function findWordMatches(content: string, find: string): WordMatch[];
```

### summarizeMatchesByDirectory

Groups matched file paths by directory for overflow summaries.

| Function | Description |
|----------|-------------|
| `summarizeMatchesByDirectory(filePaths, depth): EnhancedMap<string, number>` | Groups files by directory truncated to `depth` segments |
| `formatDirectoryMatchSummary(filePaths, depth): string` | Formats directory match counts as a sorted bullet list |
| `buildDirectorySummaryResponse(params): string` | Builds the full tool response for overflow summaries |

### fileSearch

Intelligent file search with keyword extraction and fuzzy matching.

| Function | Description |
|----------|-------------|
| `extractKeywords(input: string): string[]` | Extract meaningful keywords from user input |
| `extractFileExtensions(input: string): string[]` | Extract file extensions mentioned in input |
| `fuzzyScore(needle: string, haystack: string): number` | Calculate fuzzy match score (0-1) |
| `scoreFilePath(filePath: string, keywords: string[], extensions: string[]): number` | Score a file path against search keywords |
| `aggregateGrepResults(grepResults: GrepResult[]): Map<string, Array<{ line: number; content: string }>>` | Aggregate grep results by file |
| `searchFiles(fileSystemService, keywords, extensions, maxResults, agent): Promise<FileSearchMatch[]>` | Search for files matching query |

### workspaceFileIndex

Cached workspace file listing for efficient search operations.

| Function | Description |
|----------|-------------|
| `invalidateWorkspaceFileIndex(providerName?: string): void` | Invalidate cached file lists (called after writes) |
| `listWorkspaceFiles(providerName, provider, globOptions): Promise<string[]>` | Cached `**/*` listing with 30-second TTL |

### fallbackGlob

Fallback glob implementation for providers that do not support native glob. Traverses the directory tree and matches against glob patterns. Supports `*`, `?`, `[...]`, `**`, and brace expansion.

### findContiguousLineMatch

Finds contiguous line matches in source text, with optional fuzzy matching via Levenshtein similarity.

| Export | Description |
|--------|-------------|
| `findContiguousLineMatch(sourceLines, targetLines, options?): FindContiguousLineMatchResult` | Finds exact or fuzzy contiguous line matches |
| `normalizeLineForWhitespaceInsensitiveMatch(line: string): string` | Normalizes whitespace for comparison |
| `calculateLevenshteinSimilarity(left: string, right: string): number` | Levenshtein similarity score (0-1) |

### createFileWriteResult

Creates standardized tool results for file write operations. Generates a unified diff between previous and new content, includes the diff as an attachment if within `maxReturnedDiffSize`, and appends validation results if present.

### detectMimeType

Detects MIME type from a filename extension. Maps common extensions (diff, html, json, md, txt, png, jpg, jpeg, webp) to their MIME types; defaults to `text/plain`.

## Package Structure

```text
plugin/filesystem/
├── index.ts                             # Main exports
├── package.json                         # Package configuration
├── plugin.ts                            # Plugin registration
├── schema.ts                            # Zod configuration schemas
├── FileSystemService.ts                 # Core service implementation
├── FileSystemService.test.ts            # Service tests
├── FileSystemProvider.ts                # Provider interface definitions
├── FileMatchResource.ts                 # File matching resource class
├── FileWatchService.ts                  # File watching service
├── FileWatchService.test.ts             # Watch service tests
├── FileSystemHttpResource.ts            # HTTP file serving resource
├── FileSystemHttpResource.test.ts       # HTTP resource tests
├── tools.ts                             # Tool exports
├── commands.ts                          # Command exports
├── bun.config.ts                        # Bun configuration
├── tools/
│   ├── edit.ts                          # file_edit tool
│   ├── edit.test.ts                     # Tests for edit tool
│   ├── write.ts                         # file_write tool
│   ├── read.ts                          # file_read tool
│   ├── append.ts                        # file_append tool (not exported)
│   ├── search.ts                        # file_search tool (not exported)
│   ├── glob.ts                          # file_glob tool
│   └── grep.ts                          # file_grep tool
├── commands/
│   ├── file/
│   │   ├── select.ts                    # /file select
│   │   ├── add.ts                       # /file add
│   │   ├── remove.ts                    # /file remove
│   │   ├── list.ts                      # /file list
│   │   ├── clear.ts                     # /file clear
│   │   └── default.ts                   # /file default
│   └── filesystem/provider/
│       ├── get.ts                       # /filesystem provider get
│       ├── set.ts                       # /filesystem provider set
│       ├── select.ts                    # /filesystem provider select
│       └── reset.ts                     # /filesystem provider reset
├── state/
│   └── fileSystemState.ts               # State management
├── hooks/
│   ├── clearReadFiles.ts                # clearReadFiles hook
│   ├── addSelectedFiles.ts              # addSelectedFiles hook
│   └── addSimilarFiles.ts               # addSimilarFiles hook (RAG search)
├── util/
│   ├── createIgnoreFilter.ts            # Ignore filter creation
│   ├── runFileValidator.ts              # File validator runner and types
│   ├── createFileWriteResult.ts         # File write result creation
│   ├── findWordMatches.ts               # Word matching utility
│   ├── findContiguousLineMatch.ts       # Contiguous line matching
│   ├── findContiguousLineMatch.test.ts  # Tests for line matching
│   ├── fallbackGlob.ts                  # Fallback glob implementation
│   ├── fileSearch.ts                    # Intelligent file search utilities
│   ├── summarizeMatchesByDirectory.ts   # Directory summary utilities
│   ├── summarizeMatchesByDirectory.test.ts # Tests for directory summaries
│   ├── workspaceFileIndex.ts            # Cached workspace file listing
│   ├── detectMimeType.ts                # MIME type detection
│   ├── directoryListing.ts              # Directory listing formatter
│   └── fileListing.ts                   # File listing formatter
├── rpc/
│   ├── filesystem.ts                    # RPC endpoint definitions
│   └── schema.ts                        # RPC schema definitions
└── README.md                            # Package README
```

## Testing

The package uses `bun test` for testing. Test files follow the `*.test.ts` naming convention.

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run tests with coverage
bun test --coverage

# Build (type check)
bun build
```

The test suite covers:

- `FileSystemService.test.ts` — glob fallback behavior with mock providers
- `FileSystemHttpResource.test.ts` — authentication, file serving, uploads, session cookies, and path traversal protection
- `FileWatchService.test.ts` — watcher lifecycle, file change enqueueing, content filtering, and bootstrap window
- `tools/edit.test.ts` — word-based matching, multiple match handling, and `multiple` flag behavior
- `util/summarizeMatchesByDirectory.test.ts` — directory grouping and summary formatting
- `util/findContiguousLineMatch.test.ts` — exact and fuzzy line matching

## Dependencies

| Package | Purpose |
|---------|---------|
| `@tokenring-ai/app` | Application framework |
| `@tokenring-ai/chat` | Chat service for tool registration |
| `@tokenring-ai/agent` | Agent framework for state and lifecycle |
| `@tokenring-ai/utility` | Utility functions (maps, sets, string formatting) |
| `@tokenring-ai/lifecycle` | Lifecycle service for hooks |
| `@tokenring-ai/scripting` | Scripting service for function registration |
| `@tokenring-ai/rpc` | RPC service for endpoint registration |
| `@tokenring-ai/queue` | Queue service used by FileWatchService |
| `@tokenring-ai/web-host` | Web host service for HTTP resource registration |
| `zod` | Schema validation |
| `ignore` | Git ignore pattern matching |
| `diff` | Diff generation for file operations |
| `mime-types` | MIME type detection |

## License

MIT License — see LICENSE file for details.
