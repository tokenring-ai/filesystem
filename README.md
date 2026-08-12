# @tokenring-ai/filesystem

A filesystem abstraction service for Token Ring AI agents that provides unified file operations including reading, writing, searching, and executing commands through a provider-based architecture.

## Overview

The `@tokenring-ai/filesystem` package provides a unified, abstracted filesystem interface for Token Ring applications. It enables secure file operations including:

- File reading and writing with safety controls
- File editing with word-based matching support
- File search and content management
- Chat-based file management
- Context-aware file tracking and state management
- Multi-provider architecture for different filesystem implementations
- RPC endpoints for remote file operations
- Scripting functions for common file operations
- Automatic ignore filter system (.gitignore, .aiignore support)
- File validation system for post-write validation
- Glob pattern matching for file discovery
- Grep-based text search with configurable snippets
- RAG-based intelligent file search and injection

The package integrates deeply with the agent system, providing both tools for AI-driven operations and chat commands for user interface control.

## Installation

```bash
bun install @tokenring-ai/filesystem
```

## Plugin Registration

```typescript
import { TokenRingPlugin } from "@tokenring-ai/app";
import { z } from "zod";
import plugin from "./plugin.ts";
import { FileSystemConfigSchema } from "./schema.ts";

const packageConfigSchema = z.object({
  filesystem: FileSystemConfigSchema.exactOptional(),
});

export default plugin satisfies TokenRingPlugin<typeof packageConfigSchema>;
```

## Configuration

### FileSystemConfigSchema

The main configuration schema for the plugin.

**File:** `plugin/filesystem/schema.ts`

```typescript
const FileSystemConfigSchema = z.object({
  agentDefaults: z.object({
    provider: z.string(),
    workingDirectory: z.string(),
    selectedFiles: z.array(z.string()).default([]),
    settings: FileSystemToolSettingsSchema.prefault({}),
  }),
}).strict();
```

### FileSystemToolSettingsSchema

Unified settings schema for all filesystem tools.

```typescript
const FileSystemToolSettingsSchema = z.object({
  requireReadBeforeWrite: z.boolean().default(true),
  maxReturnedDiffSize: z.number().min(0).default(1024),
  validateWrittenFiles: z.boolean().default(true),
  maxFileReadCount: z.number().min(1).default(10),
  maxFileReadSize: z.number().min(1024).default(128 * 1024),
  maxSearchSnippetCount: z.number().min(1).default(10),
  maxSearchSnippetSizePercent: z.number().min(0).max(1).default(0.3),
  searchSnippetLinesBefore: z.number().min(0).default(5),
  searchSnippetLinesAfter: z.number().min(0).default(5),
  maxGlobbedFiles: z.number().min(1).default(250),
  globSummaryDepth: z.number().min(0).default(2),
  fileEdit: z.object({
    enabled: z.boolean().default(true),
    fuzzyMatchSimilarity: z.number().min(0.7).max(1).default(0.85),
    minimumMatchedCharacters: z.number().min(1).default(15),
    disableAfterConsecutiveFailures: z.number().min(1).default(2),
  }).prefault({}),
});
```

### FileSystemAgentConfigSchema

The agent-specific configuration schema.

```typescript
const FileSystemAgentConfigSchema = z.object({
  provider: z.string().exactOptional(),
  workingDirectory: z.string().exactOptional(),
  selectedFiles: z.array(z.string()).exactOptional(),
  settings: FileSystemToolSettingsSchema.partial().optional(),
}).strict().default({});
```

### Configuration Example

```yaml
filesystem:
  agentDefaults:
    provider: "posix"
    workingDirectory: "/path/to/project"
    selectedFiles: ["src/main.ts", "README.md"]
    settings:
      requireReadBeforeWrite: true
      maxReturnedDiffSize: 2048
      validateWrittenFiles: true
      maxFileReadCount: 20
      maxFileReadSize: 262144
      maxSearchSnippetCount: 50
      maxSearchSnippetSizePercent: 0.5
      searchSnippetLinesBefore: 3
      searchSnippetLinesAfter: 3
      maxGlobbedFiles: 500
      globSummaryDepth: 2
      fileEdit:
        enabled: true
        fuzzyMatchSimilarity: 0.85
        minimumMatchedCharacters: 15
        disableAfterConsecutiveFailures: 2
```

## Tools

Tools are exported from `tools.ts` and registered with `ChatService` during plugin installation.

Currently, five tools are actively exported: `file_edit`, `file_write`, `file_read`, `file_glob`, and `file_grep`.

### file_edit

Modifies an existing file by finding and replacing text using word-based matching.

**File:** `plugin/filesystem/tools/edit.ts`

**Tool Definition:**

| Property | Value |
|----------|-------|
| Name | `file_edit` |
| Display Name | `Filesystem/edit` |

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Relative path of the file to edit (e.g., 'src/main.ts'). Relative to the project root directory. |
| `find` | `string` | Text to find. Will be trimmed; whitespace between words is not significant but word order and exact word content are. |
| `replace` | `string` | Replacement text. Replaces the matched region verbatim. Use an empty string to delete the match. |
| `multiple` | `boolean` | If true, replace every match. If false and more than one match is found, the matches are returned without modifying the file. Default: false. |

**Behavior:**

- Finds text matches using word-based matching (first word verbatim, remaining words in order with any whitespace)
- Replaces matched text with replacement text
- Automatically writes the updated file if content changes
- Returns diff if file existed before (up to `maxReturnedDiffSize` limit)
- Sets filesystem as dirty on success
- Resets consecutive failure count on success
- Runs file validator if configured (`validateWrittenFiles`)
- Tool can be automatically disabled after `disableAfterConsecutiveFailures` consecutive failures

**Matching Rules:**

- First word must appear verbatim in the file
- Remaining words must follow in order, separated by any amount of whitespace
- Word order is significant
- Minimum matched characters configurable via `minimumMatchedCharacters`

**Error Cases:**

- Returns error if multiple exact matches found (unless `multiple=true`)
- Returns error if no match found
- Returns error if file cannot be read
- Returns error if file edit is disabled for the session

**Agent State:**

- Sets `state.dirty = true`
- Updates `state.fileEditFailureCount` (resets on success, increments on failure)
- May disable `state.settings.fileEdit.enabled` after consecutive failures

**Adjust Activation:**

The tool supports dynamic activation based on `state.settings.fileEdit.enabled`:

```typescript
function adjustActivation(enabled: boolean, agent: Agent): boolean {
  return enabled && agent.getState(FileSystemState).settings.fileEdit.enabled;
}
```

**Example:**

```typescript
// Modify an existing file
const result = await edit({
  path: 'src/main.ts',
  find: 'const x = 1',
  replace: 'const x = 10'
}, agent);

// Delete text
const result = await edit({
  path: 'src/main.ts',
  find: '// Old comment',
  replace: ''
}, agent);

// Replace all matches
const result = await edit({
  path: 'src/main.ts',
  find: 'TODO',
  replace: 'FIXME',
  multiple: true
}, agent);
```

### file_write

Writes a file to the filesystem.

**File:** `plugin/filesystem/tools/write.ts`

**Tool Definition:**

| Property | Value |
|----------|-------|
| Name | `file_write` |
| Display Name | `Filesystem/write` |

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Relative path of the file to write (e.g., 'src/main.ts' or 'docs/design.md'). Starts from the project root directory. Required. |
| `content` | `string` | Content to write to the file. ALWAYS include the ENTIRE file contents to avoid data loss. Required. |

**Behavior:**

- Enforces read-before-write policy if configured (`requireReadBeforeWrite`)
- Creates parent directories automatically if needed
- Returns diff if file existed before (up to `maxReturnedDiffSize` limit)
- Sets filesystem as dirty on success
- Marks file as read in state with modification time
- Generates artifact output (diff for modifications, full content for new files)
- Runs file validator if configured (`validateWrittenFiles`)

**Error Cases:**

- Returns helpful message if file wasn't read before write and policy is enforced
- Includes original file contents in error message to expedite the workflow

**Agent State:**

- Sets `state.dirty = true`
- Adds file to `state.readFiles` Map with modification time

**Example:**

```typescript
// Create a new file
const result = await write({
  path: 'src/main.ts',
  content: '// New file content'
}, agent);

// Modify an existing file
const result = await write({
  path: 'src/main.ts',
  content: '// Updated file content'
}, agent);
```

### file_read

Reads files from the filesystem by path or glob pattern.

**File:** `plugin/filesystem/tools/read.ts`

**Tool Definition:**

| Property | Value |
|----------|-------|
| Name | `file_read` |
| Display Name | `Filesystem/read` |

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `files` | `string[]` | List of file paths or glob patterns (e.g., '**/*.ts', 'path/to/file.txt'). |

**Behavior:**

- Resolves glob patterns to specific files
- Checks file existence for each path
- Reads file contents (up to `maxFileReadSize` limit)
- Marks read files in `FileSystemState` Map with modification time
- Returns file names only if too many files are matched
- Handles binary files gracefully (returns "[File is binary and cannot be displayed]")
- Handles directories by recursively reading contents
- Treats pattern resolution errors as informational

**Error Cases:**

- Returns "No files were found that matched the search criteria" if no files match
- Returns directory listing if more than `maxFileReadCount` files matched
- Returns "[File is too large to retrieve]" for files exceeding `maxFileReadSize`

**Agent State:**

- Adds matched file paths to `state.readFiles` Map with modification time

**Example:**

```typescript
// Read specific file
const result = await read({
  files: ['src/main.ts']
}, agent);

// Get all TypeScript files
const result = await read({
  files: ['**/*.ts']
}, agent);

// Read multiple files
const result = await read({
  files: ['src/main.ts', 'src/utils.ts']
}, agent);
```

### file_glob

Lists files matching glob patterns relative to the project root folder.

**File:** `plugin/filesystem/tools/glob.ts`

**Tool Definition:**

| Property | Value |
|----------|-------|
| Name | `file_glob` |
| Display Name | `Filesystem/glob` |

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filePaths` | `string[]` | `["**/*"]` | List of glob patterns to match files. Examples: '**/*.ts', 'path/to/file.txt' |

**Behavior:**

- Resolves glob patterns to specific files
- Returns matched files as a directory listing
- Handles multiple patterns (OR-based)
- Paths are relative to the project root folder
- Uses Unix-style '/' separators
- When more files match than `maxGlobbedFiles`, returns a per-directory match count summary

**Output Format:**

```text
BEGIN DIRECTORY LISTING
- file1.ts
- file2.ts
- path/to/file3.ts
END DIRECTORY LISTING
```

**Overflow Output Format:**

```text
The glob operation matched N files, which is higher than the configured limit of M.
Matches are summarized by directory (depth D) with the number of matched files per directory.

BEGIN DIRECTORY SUMMARY
- src: 10 files
- pkg/utils: 5 files
END DIRECTORY SUMMARY
```

**Error Cases:**

- Returns "No files were found that matched the glob patterns" if no files match

**Example:**

```typescript
// Get all TypeScript files
const result = await glob({
  filePaths: ['**/*.ts']
}, agent);

// Get files in specific directory
const result = await glob({
  filePaths: ['src/**/*.js']
}, agent);

// Multiple patterns
const result = await glob({
  filePaths: ['**/*.ts', '**/*.tsx']
}, agent);
```

### file_grep

Searches for text patterns within files. Supports plain string and regex patterns.

**File:** `plugin/filesystem/tools/grep.ts`

**Tool Definition:**

| Property | Value |
|----------|-------|
| Name | `file_grep` |
| Display Name | `Filesystem/grep` |

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filePaths` | `string[]` | `["**/*"]` | List of file paths or glob patterns to search within. Examples: '**/*.ts', 'path/to/file.txt' |
| `searchTerms` | `string[]` | - | List of search terms. Plain strings use fuzzy substring match; wrap in '/' for regex. Examples: "searchTerm", "/searchTerm.*/" |

**Behavior:**

- Supports substring and regex matching
- Returns grep-style snippets with context lines (`searchSnippetLinesBefore` and `searchSnippetLinesAfter`)
- Automatically decides whether to return full file contents, snippets, directory listings, or directory summaries based on match count
- Searches are OR-based across multiple patterns (any match counts)
- Tool activation depends on filesystem provider supporting grep
- When more files match than `maxGlobbedFiles`, returns a per-directory match count summary

**Search Patterns:**

- Plain strings: Substring matching (case-insensitive)
- Regex: Enclosed in `/` (e.g., `/class \w+Service/`)

**Output Format:**

- When matches are few: Returns grep-style snippets with line numbers (format: `BEGIN FILE GREP MATCHES: {file} (line: match)`)
- When snippet is too large: Returns full file contents (format: `BEGIN FILE ATTACHMENT: {file}`)
- When too many files match: Returns directory listing with file names
- When exceeding `maxGlobbedFiles`: Returns directory summary

**Error Cases:**

- Returns "No files were found that matched the search criteria" if no files match
- Returns directory listing if more than `maxSearchSnippetCount` files matched

**Adjust Activation:**

The tool supports dynamic activation based on filesystem provider support:

```typescript
function adjustActivation(enabled: boolean, agent: Agent): boolean {
  const supportsGrep = agent.requireService(FileSystemService).supportsGrep(agent);
  return enabled && supportsGrep;
}
```

**Examples:**

```typescript
// Search for a function across all files
const result = await grep({
  filePaths: ['src/**/*.ts'],
  searchTerms: ['function execute']
}, agent);

// Regex search for pattern
const result = await grep({
  filePaths: ['pkg/agent/**/*.ts'],
  searchTerms: ['/class \\w+Service/']
}, agent);

// Search with specific files
const result = await grep({
  filePaths: ['src/**/*.ts', 'pkg/**/*.ts'],
  searchTerms: ['TODO', 'FIXME']
}, agent);

// Search across all files (default)
const result = await grep({
  searchTerms: ['import']
}, agent);
```

## Chat Commands

### file

Manage files in the chat session.

**Location:** `plugin/filesystem/commands/file/`

| Command | File | Description |
|---------|------|-------------|
| `/file select` | `commands/file/select.ts` | Open interactive file selector |
| `/file add [paths...]` | `commands/file/add.ts` | Add specific files to chat |
| `/file remove [paths...]` | `commands/file/remove.ts` | Remove specific files from chat |
| `/file list` | `commands/file/list.ts` | List all files currently in chat |
| `/file clear` | `commands/file/clear.ts` | Remove all files from chat |
| `/file default` | `commands/file/default.ts` | Reset to default files from config |

**Command Examples:**

```bash
# Interactive file selection
/file select

# Add specific files
/file add src/main.ts src/utils.ts

# Remove a file
/file remove src/main.ts

# List files in chat
/file list

# Clear all files
/file clear

# Reset to default files
/file default
```

### filesystem/provider

Manage filesystem providers.

**Location:** `plugin/filesystem/commands/filesystem/provider/`

| Command | File | Description |
|---------|------|-------------|
| `/filesystem provider get` | `commands/filesystem/provider/get.ts` | Show current filesystem provider |
| `/filesystem provider set <name>` | `commands/filesystem/provider/set.ts` | Set the active filesystem provider |
| `/filesystem provider select` | `commands/filesystem/provider/select.ts` | Interactively select a filesystem provider |
| `/filesystem provider reset` | `commands/filesystem/provider/reset.ts` | Reset to initial filesystem provider |

**Command Examples:**

```bash
# Get current provider
/filesystem provider get

# Set provider
/filesystem provider set posix

# Interactive selection
/filesystem provider select

# Reset to default
/filesystem provider reset
```

## RPC Endpoints

The package registers RPC endpoints under `/rpc/filesystem`.

**Location:** `plugin/filesystem/rpc/filesystem.ts`

**Schema:** `plugin/filesystem/rpc/schema.ts`

### Endpoints

| Method | Type | Description | Request Params | Response Params |
|--------|------|-------------|----------------|-----------------|
| `getFilesystemProviders` | Query | Get all registered filesystem providers | `{}` | `{ providers: string[] }` |
| `readTextFile` | Query | Read file content as text | `{ provider: string, path: string }` | `{ content: string \| null }` |
| `exists` | Query | Check if a file exists | `{ provider: string, path: string }` | `{ exists: boolean }` |
| `stat` | Query | Get file statistics | `{ provider: string, path: string }` | `{ stats: StatLike }` (dates encoded as ISO 8601) |
| `glob` | Query | Match files with glob pattern | `{ provider: string, pattern: string }` | `{ files: string[] }` |
| `searchWorkspaceFiles` | Query | Search workspace files by query | `{ provider: string, query: string, limit: number }` | `{ files: string[], totalMatches: number }` |
| `listDirectory` | Query | List directory contents | `{ provider: string, path: string, showHidden?: boolean, recursive?: boolean }` | `{ files: string[] }` |
| `writeFile` | Mutation | Write a file | `{ provider: string, path: string, content: string }` | `{ success: boolean }` |
| `appendFile` | Mutation | Append to a file | `{ provider: string, path: string, content: string }` | `{ success: boolean }` |
| `deleteFile` | Mutation | Delete a file | `{ provider: string, path: string }` | `{ success: boolean }` |
| `rename` | Mutation | Rename a file | `{ provider: string, oldPath: string, newPath: string }` | `{ success: boolean }` |
| `createDirectory` | Mutation | Create a directory | `{ provider: string, path: string, recursive?: boolean }` | `{ success: boolean }` |
| `copy` | Mutation | Copy a file or directory | `{ provider: string, source: string, destination: string, overwrite?: boolean }` | `{ success: boolean }` |
| `getFilesystemState` | Query | Get filesystem state for agent | `{ agentId: string }` | Discriminated union on `status`: `{ status: "success", ... }` or `{ status: "agentNotFound" }` |
| `streamFilesystemState` | Stream | Stream filesystem state changes for agent | `{ agentId: string }` | Discriminated union on `status`: `{ status: "success", ... }` or `{ status: "agentNotFound" }` |
| `addFileToChat` | Mutation | Add file to chat context | `{ agentId: string, file: string }` | Discriminated union on `status`: `{ status: "success", success: boolean }` or `{ status: "agentNotFound" }` |
| `removeFileFromChat` | Mutation | Remove file from chat context | `{ agentId: string, file: string }` | Discriminated union on `status`: `{ status: "success", success: boolean }` or `{ status: "agentNotFound" }` |

**RPC Client Example:**

```typescript
import { createRPCClient } from "@tokenring-ai/rpc";

const client = createRPCClient("/rpc/filesystem");

// Get available providers
const { providers } = await client.getFilesystemProviders({});

// Read a file
const { content } = await client.readTextFile({
  provider: "posix",
  path: "src/main.ts"
});

// Write a file
const { success } = await client.writeFile({
  provider: "posix",
  path: "src/new.ts",
  content: "// New file"
});

// List directory
const { files } = await client.listDirectory({
  provider: "posix",
  path: "src",
  recursive: true
});

// Search workspace files
const { files, totalMatches } = await client.searchWorkspaceFiles({
  provider: "posix",
  query: "main",
  limit: 20
});

// Get filesystem state
const state = await client.getFilesystemState({
  agentId: "agent-123"
});
```

## Scripting Functions

The package registers scripting functions for common file operations:

**Location:** `plugin/filesystem/plugin.ts`

### Functions

| Function | Parameters | Description |
|----------|------------|-------------|
| `createFile` | `path`, `content` | Create a file with content |
| `deleteFile` | `path` | Delete a file |
| `globFiles` | `pattern` | Match files with glob pattern |
| `searchFiles` | `searchString` | Search for text patterns in files |

**Example:**

```typescript
// Create a file
await scriptingService.executeFunction("createFile", ["src/main.ts", "// content"]);

// Delete a file
await scriptingService.executeFunction("deleteFile", ["src/old.ts"]);

// Find all TypeScript files
const files = await scriptingService.executeFunction("globFiles", ["**/*.ts"]);

// Search for a pattern
const results = await scriptingService.executeFunction("searchFiles", ["function execute"]);
```

## Core Components

### FileSystemService

The main service class implementing `TokenRingService`. It manages filesystem providers, agent state, and delegates operations.

**File:** `plugin/filesystem/FileSystemService.ts`

**Exports:**

```typescript
import FileSystemService from "@tokenring-ai/filesystem/FileSystemService";
```

**Service Methods:**

#### Provider Management

- `registerFileSystemProvider(name: string, provider: FileSystemProvider)`: Registers a provider
- `unregisterFileSystemProvider(name: string)`: Unregisters a provider
- `requireFileSystemProviderByName(name: string)`: Retrieves a registered provider
- `getFilesystemProviderNames()`: Returns all registered provider names
- `setActiveFileSystem(providerName: string, agent: Agent)`: Sets the active provider for an agent
- `requireActiveFileSystem(agent: Agent)`: Gets the active provider for an agent
- `supportsGrep(agent: Agent)`: Checks if the active filesystem supports grep

#### State Management

- `attach(agent: Agent, creationContext: AgentCreationContext)`: Initializes state for agent
- `addFileToChat(file: string, agent: Agent)`: Adds file to chat context
- `removeFileFromChat(file: string, agent: Agent)`: Removes file from chat context
- `getFilesInChat(agent: Agent)`: Returns set of files in chat
- `setFilesInChat(files: Iterable<string>, agent: Agent)`: Sets files in chat context
- `setDirty(dirty: boolean, agent: Agent)`: Marks filesystem as modified
- `isDirty(agent: Agent)`: Checks if files have been modified

#### File Operations

- `writeFile(path: string, content: string | Buffer, agent: Agent)`: Write or overwrite file
- `appendFile(filePath: string, content: string | Buffer, agent: Agent)`: Append to file
- `deleteFile(path: string, agent: Agent)`: Delete file
- `rename(oldPath: string, newPath: string, agent: Agent)`: Rename file
- `readTextFile(path: string, agent: Agent)`: Read file as UTF-8 string
- `readFile(path: string, agent: Agent)`: Read file as buffer
- `exists(path: string, agent: Agent)`: Check if file exists
- `stat(path: string, agent: Agent)`: Get file statistics
- `getModifiedTimeNanos(path: string, agent: Agent)`: Get file modification time in nanoseconds

#### Directory Operations

- `getDirectoryTree(path: string, options, agent)`: Async generator for directory traversal
- `createDirectory(path: string, options, agent)`: Create directory recursively
- `copy(source: string, destination: string, options, agent)`: Copy file or directory
- `glob(pattern: string, options, agent)`: Match files with glob pattern
- `watch(dir: string, options, agent)`: Watch for filesystem changes

#### Search Operations

- `grep(searchString: string | string[], options, agent)`: Search for text patterns in files

**Constructor:**

```typescript
constructor(options: z.output<typeof FileSystemConfigSchema>)
```

**Start Method:**

```typescript
start(): void {
  // Throws an error if the default provider is not registered
  this.defaultProvider = this.fileSystemProviderRegistry.require(this.options.agentDefaults.provider);
}
```

**Attach Method:**

```typescript
attach(agent: Agent, creationContext: AgentCreationContext): void {
  const config = deepClone(this.options.agentDefaults, agent.getAgentConfigSlice("filesystem", FileSystemAgentConfigSchema));
  const initialState = agent.initializeState(FileSystemState, config);
  if (config.selectedFiles.length > 0) {
    creationContext.items.push(`Selected Files: ${Array.from(initialState.selectedFiles).join(", ")}`);
  }
  creationContext.items.push(`Working Directory: ${initialState.workingDirectory}`);
}
```

### FileSystemProvider

Abstract interface for filesystem implementations. Implementations can provide virtual, remote, or local filesystem access.

**File:** `plugin/filesystem/FileSystemProvider.ts`

**Interface:**

```typescript
type StatLike = {
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
} | {
  path: string;
  exists: false;
};

interface GrepResult {
  file: string;
  line: number;
  match: string;
  matchedString?: string;
  content: string | null;
}

interface DirectoryTreeOptions {
  ignoreFilter: (path: string) => boolean;
  recursive?: boolean;
}

interface GlobOptions {
  ignoreFilter: (path: string) => boolean;
  absolute?: boolean;
  includeDirectories?: boolean;
}

interface WatchOptions {
  ignoreFilter: (path: string) => boolean;
  pollInterval?: number;
  stabilityThreshold?: number;
}

interface FileSystemWatcher {
  on(event: "add" | "change" | "unlink", listener: (filePath: string) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this;
  close(): void;
}

interface GrepOptions {
  ignoreFilter: (path: string) => boolean;
  includeContent?: { linesBefore?: number; linesAfter?: number };
  cwd?: string;
}

interface FileSystemProvider {
  // Directory walking
  getDirectoryTree(
    absolutePath: string,
    params?: DirectoryTreeOptions,
  ): AsyncGenerator<string> | Generator<string>;

  // File operations
  writeFile(absolutePath: string, content: string | Buffer): MaybePromise<boolean>;
  appendFile(absoluteFilePath: string, finalContent: string | Buffer): MaybePromise<boolean>;
  deleteFile(absolutePath: string): MaybePromise<boolean>;
  readFile(absolutePath: string): MaybePromise<Buffer | null>;
  rename(oldAbsolutePath: string, newAbsolutePath: string): MaybePromise<boolean>;
  exists(absolutePath: string): MaybePromise<boolean>;
  stat(absolutePath: string): MaybePromise<StatLike>;
  createDirectory(
    absolutePath: string,
    options?: { recursive?: boolean },
  ): MaybePromise<boolean>;
  copy(
    absoluteSource: string,
    absoluteDestination: string,
    options?: { overwrite?: boolean },
  ): MaybePromise<boolean>;
  glob?(absolutePattern: string, options?: GlobOptions): MaybePromise<string[]>;
  watch?(absoluteDir: string, options?: WatchOptions): MaybePromise<FileSystemWatcher>;
  grep?(
    searchString: string | string[],
    options?: GrepOptions,
  ): MaybePromise<GrepResult[]>;
}
```

### FileMatchResource

A resource class for matching files based on include/exclude patterns. Provides async generation of matched files using the FileSystemService.

**File:** `plugin/filesystem/FileMatchResource.ts`

**Exports:**

```typescript
import FileMatchResource from "@tokenring-ai/filesystem/FileMatchResource";
```

**Schema:**

```typescript
const FileMatchSchema = z.object({
  path: z.string(),
  include: z.string().exactOptional(),
  exclude: z.string().exactOptional(),
});

type ParsedFileMatch = z.output<typeof FileMatchSchema>;
```

**Class:**

```typescript
class FileMatchResource {
  readonly itemMatches: ItemMatch[];

  constructor(items: ParsedFileMatch[])

  async* getMatchedFiles(agent: Agent): AsyncGenerator<string>
  async addFilesToSet(set: Set<string>, agent: Agent): Promise<void>
}
```

**Usage:**

```typescript
const fileMatchResource = new FileMatchResource([
  { path: "src", include: "\\.ts$" },
  { path: "pkg", exclude: "node_modules" }
]);

for await (const file of fileMatchResource.getMatchedFiles(agent)) {
  console.log(file);
}
```

## Agent State

### FileSystemState

Tracks filesystem-related state for agents.

**File:** `plugin/filesystem/state/fileSystemState.ts`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `selectedFiles` | `Set<string>` | Files in chat context |
| `providerName` | `string \| null` | Active provider name |
| `workingDirectory` | `string` | Working directory for path resolution |
| `dirty` | `boolean` | Whether files have been modified |
| `readFiles` | `Map<string, number>` | Files that have been read (path -> modification time in ms) |
| `hasInjectedSimilarFiles` | `boolean` | Whether RAG-related files have been injected |
| `fileEditFailureCount` | `number` | Consecutive edit failure count |
| `settings` | `FileSystemToolSettingsSchema` | Current tool settings |
| `initialConfig` | `object` | Initial configuration from agent defaults |

**State Methods:**

```typescript
state.reset()                    // Reset to initial config
state.serialize()                // Return serializable state
state.deserialize(data)          // Restore state from object
state.show()                     // Return human-readable summary
```

**State Serialization:**

```typescript
// Serialization schema includes:
{
  selectedFiles: string[];
  activeFileSystemProviderName: string | null;
  workingDirectory: string;
  dirty: boolean;
  settings: FileSystemToolSettingsSchema;
  readFiles: Record<string, number>;
  hasInjectedRelatedFiles: boolean;
  fileEditFailureCount: number;
}
```

**State Usage:**

```typescript
import { FileSystemState } from "@tokenring-ai/filesystem/state/fileSystemState";

// Get config slice
const config = agent.getAgentConfigSlice("filesystem", FileSystemAgentConfigSchema);

// Initialize state
agent.initializeState(FileSystemState, config);

// Access state
const state = agent.getState(FileSystemState);
console.log("Active provider:", state.providerName);
console.log("Working Directory:", state.workingDirectory);
console.log("Dirty:", state.dirty);
console.log("Selected files:", Array.from(state.selectedFiles));
console.log("Read files:", Array.from(state.readFiles.keys()));
console.log("File edit enabled:", state.settings.fileEdit.enabled);

// Mutate state
agent.mutateState(FileSystemState, (state) => {
  state.dirty = true;
  state.readFiles.set("src/main.ts", Date.now());
});
```

## Lifecycle Hooks

### clearReadFiles

Automatically clears the read files state when the chat context is compacted or cleared.

**File:** `plugin/filesystem/hooks/clearReadFiles.ts`

**Hook Subscription:**

```typescript
const name = "clearReadFiles";
const displayName = "Filesystem/Clear Read Files";
const description = "Automatically clears the read files state when the chat context is compacted or cleared";

const callbacks = [
  new HookCallback(AfterChatCompaction, clearReadFiles),
  new HookCallback(AfterChatClear, clearReadFiles),
];
```

**Behavior:**

- Clears `state.readFiles` Map when chat is compacted or cleared
- Resets `state.dirty` to false
- Subscribes to `AfterChatCompaction` and `AfterChatClear` lifecycle events

### addSelectedFiles

Searches the filesystem for files relevant to the user's input and attaches matching filenames and chunks to the chat message.

**File:** `hooks/addSelectedFiles.ts`

**Hook Subscription:**

```typescript
const name = "addSelectedFiles";
const displayName = "Filesystem/Add related files to chat";
const description = "Searches the filesystem for files relevant to the user's input and attaches the matching filenames and chunks to the chat message";

const callbacks = [new HookCallback(AfterInputReceived, addSelectedFiles)];
```

**Behavior:**

- Triggered after input is received via `BeforeInputReceived` lifecycle event
- Performs two operations:
  1. **RAG File Search**: Extracts keywords from user input, searches filesystem for relevant files, and attaches results as markdown artifact
  2. **Selected Files Injection**: Attaches contents of files in `state.selectedFiles` and any files mentioned in the input message (paths containing `/`)
- Skips command messages (messages starting with `/`) except `/chat send`
- Only performs RAG search once per session (tracked via `state.hasInjectedRelatedFiles`)
- Marks files as read in `state.readFiles` with modification time

**RAG Search Process:**

1. Extracts keywords using `extractKeywords()` (quoted phrases, file paths, file names, CamelCase/snake_case splitting, stop word filtering)
2. Detects file extensions using `extractFileExtensions()` (direct mentions and language patterns)
3. Searches filesystem using `searchFiles()` (filename matching + content grep)
4. Formats results as markdown with filename and matching line chunks
5. Attaches results as artifact with mimeType `text/markdown`

**Selected Files Process:**

1. Collects files from `state.selectedFiles`
2. Extracts mentioned paths from input message (tokens containing `/`)
3. Reads file contents and attaches as artifacts
4. For directories, generates directory listings

## Ignore Filter System

Automatic exclusion of files based on patterns:

**Included Patterns:**

- `.git` directory
- `*.lock` files
- `node_modules` directory
- All dotfiles (`.gitignore`, `.aiignore`, etc.)

**Loaded from Files:**

- `.gitignore` - Git ignore patterns
- `.aiignore` - AI-specific ignore patterns

**Implementation:**

```typescript
import createIgnoreFilter from "@tokenring-ai/filesystem/util/createIgnoreFilter";

async function createIgnoreFilter(fileSystem: IgnoreFilterFileSystem): Promise<(p: string) => boolean> {
  const ig = ignore();
  ig.add(".git"); // always ignore .git dir at root
  ig.add("*.lock");
  ig.add("node_modules");
  ig.add(".*");

  const gitIgnorePath = ".gitignore";
  if (await fileSystem.exists(gitIgnorePath)) {
    const data = await fileSystem.readFile(gitIgnorePath);
    if (data) {
      const lines = data.toString("utf-8").split(/\r?\n/).filter(Boolean);
      ig.add(lines);
    }
  }

  const aiIgnorePath = ".aiignore";
  if (await fileSystem.exists(aiIgnorePath)) {
    const data = await fileSystem.readFile(aiIgnorePath);
    if (data) {
      const lines = data.toString("utf-8").split(/\r?\n/).filter(Boolean);
      ig.add(lines);
    }
  }

  return ig.ignores.bind(ig);
}
```

## File Validation

The file validation system uses the `AgentLifecycleService` hook pattern to validate files after writing.

**File:** `plugin/filesystem/util/runFileValidator.ts`

**Hook Class:**

```typescript
export class FileValidatonAfterFileWrite implements Hook<typeof FileValidationResultSchema> {
  readonly type = "hook";
  readonly returnType = FileValidationResultSchema;

  constructor(
    readonly filePath: string,
    readonly fileExtension: string,
    readonly content: string,
  ) {}
}

export const FileValidationResultSchema = z.object({
  valid: z.boolean(),
  result: z.string(),
}).nullable();
```

**Registration:**

Validators are registered with the `AgentLifecycleService` as hooks:

```typescript
const lifecycleService = app.requireService(AgentLifecycleService);

lifecycleService.addHooks({
  name: "validateTypeScript",
  displayName: "TypeScript Validation",
  description: "Validates TypeScript files after write",
  callbacks: [
    new HookCallback(FileValidatonAfterFileWrite, async (hook, agent) => {
      if (hook.fileExtension !== ".ts") return null;

      // Validate TypeScript file
      const result = await runTypeScriptValidation(hook.content);
      return result ? { valid: false, result } : { valid: true };
    })
  ]
});
```

**Usage:**

- Validators are automatically run after file writes if `validateWrittenFiles` is enabled
- Validators receive a `FileValidatonAfterFileWrite` hook with file path, extension, and content
- Return `{ valid: true }` for success, or `{ valid: false, result: "error message" }` for failure
- Error messages are appended to the tool result

## Utility Functions

### findWordMatches

Finds word-based matches in file content for the edit tool.

**File:** `plugin/filesystem/util/findWordMatches.ts`

```typescript
type WordMatch = { start: number; end: number };

function findWordMatches(content: string, find: string): WordMatch[];
```

**Behavior:**

- First word must appear verbatim
- Remaining words must follow in order, separated by any whitespace
- Returns all matches with start/end positions

### summarizeMatchesByDirectory

Groups matched file paths by directory for overflow summaries.

**File:** `plugin/filesystem/util/summarizeMatchesByDirectory.ts`

```typescript
function summarizeMatchesByDirectory(filePaths: string[], depth: number): Map<string, number>;
function formatDirectoryMatchSummary(filePaths: string[], depth: number): string;
function buildDirectorySummaryResponse(params: {
  operationLabel: string;
  matchCount: number;
  maxMatchedFiles: number;
  summaryDepth: number;
  filePaths: string[];
}): string;
```

### fileSearch

Intelligent file search with keyword extraction and fuzzy matching.

**File:** `plugin/filesystem/util/fileSearch.ts`

**Exported Functions:**

| Function | Description |
|----------|-------------|
| `extractKeywords(input: string)` | Extract meaningful keywords from user input |
| `extractFileExtensions(input: string)` | Extract file extensions mentioned in input |
| `fuzzyScore(needle: string, haystack: string)` | Calculate fuzzy match score (0-1) |
| `scoreFilePath(filePath: string, keywords: string[], extensions: string[])` | Score a file path against search keywords |
| `aggregateGrepResults(grepResults: GrepResult[])` | Aggregate grep results by file |
| `searchFiles(fileSystemService, keywords, extensions, maxResults, agent)` | Search for files matching query |

### workspaceFileIndex

Cached workspace file listing for efficient search operations.

**File:** `plugin/filesystem/util/workspaceFileIndex.ts`

```typescript
function invalidateWorkspaceFileIndex(providerName?: string): void;
function listWorkspaceFiles(providerName: string, provider: FileSystemProvider, globOptions: GlobOptions): Promise<string[]>;
```

**Behavior:**

- Caches `**/*` file listing with 30-second TTL
- Invalidated on file writes via `invalidateWorkspaceFileIndex()`
- Used by `searchWorkspaceFiles` RPC endpoint

### fallbackGlob

Fallback glob implementation for providers that don't support native glob.

**File:** `plugin/filesystem/util/fallbackGlob.ts`

**Behavior:**

- Traverses directory tree and matches against glob patterns
- Supports `*`, `?`, `[...]`, `**`, and brace expansion
- Converts glob patterns to regular expressions

### createFileWriteResult

Creates standardized tool results for file write operations.

**File:** `plugin/filesystem/util/createFileWriteResult.ts`

```typescript
function createFileWriteResult(
  filePath: string,
  previousContent: string | null,
  nextContent: string,
  maxReturnedDiffSize: number,
  validationSuffix: string | null,
  message: string,
): TokenRingFullToolResult;
```

**Behavior:**

- Generates unified diff between previous and new content
- Includes diff as attachment if within `maxReturnedDiffSize`
- Includes validation results if present
- Returns original file content as attachment

## Package Structure

```text
plugin/filesystem/
├── index.ts                         # Main exports
├── package.json                     # Package configuration
├── plugin.ts                        # Plugin registration
├── schema.ts                        # Zod configuration schemas
├── FileSystemService.ts             # Core service implementation
├── FileSystemProvider.ts            # Provider interface definitions
├── FileMatchResource.ts             # File matching resource class
├── tools.ts                         # Tool exports
├── tools/
│   ├── edit.ts                      # file_edit tool
│   ├── edit.test.ts                 # Tests for edit tool
│   ├── write.ts                     # file_write tool
│   ├── read.ts                      # file_read tool
│   ├── append.ts                    # file_append tool (not exported)
│   ├── search.ts                    # file_search tool (not exported)
│   ├── glob.ts                      # file_glob tool
│   └── grep.ts                      # file_grep tool
├── commands.ts                      # Command exports
├── commands/
│   ├── file/
│   │   ├── select.ts                # /file select
│   │   ├── add.ts                   # /file add
│   │   ├── remove.ts                # /file remove
│   │   ├── list.ts                  # /file list
│   │   ├── clear.ts                 # /file clear
│   │   └── default.ts               # /file default
│   └── filesystem/provider/
│       ├── get.ts                   # /filesystem provider get
│       ├── set.ts                   # /filesystem provider set
│       ├── select.ts                # /filesystem provider select
│       └── reset.ts                 # /filesystem provider reset
├── state/
│   └── fileSystemState.ts           # State management
├── util/
│   ├── createIgnoreFilter.ts        # Ignore filter creation
│   ├── runFileValidator.ts          # File validator runner and types
│   ├── createFileWriteResult.ts     # File write result creation
│   ├── findWordMatches.ts           # Word matching utility
│   ├── fallbackGlob.ts              # Fallback glob implementation
│   ├── fileSearch.ts                # Intelligent file search utilities
│   ├── summarizeMatchesByDirectory.ts # Directory summary utilities
│   └── workspaceFileIndex.ts        # Cached workspace file listing
├── rpc/
│   ├── filesystem.ts                # RPC endpoint definitions
│   └── schema.ts                    # RPC schema definitions
├── hooks/
│   ├── clearReadFiles.ts            # clearReadFiles hook
│   └── addSelectedFiles.ts           # addSelectedFiles hook (RAG search)
└── README.md                        # Package README
```

## Testing

The package uses `bun test` for testing. Test files follow the `*.test.ts` naming convention.

**Available Test Files:**

- `tools/edit.test.ts` - Tests for the edit tool

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test:watch

# Run tests with coverage
bun test:coverage

# Build (type check)
bun build
```

## Dependencies

**Production Dependencies:**

| Package | Version | Description |
|---------|---------|-------------|
| `@tokenring-ai/app` | workspace:* | Application framework |
| `@tokenring-ai/chat` | workspace:* | Chat service |
| `@tokenring-ai/agent` | workspace:* | Agent framework |
| `@tokenring-ai/utility` | workspace:* | Utility functions |
| `@tokenring-ai/lifecycle` | workspace:* | Lifecycle service |
| `@tokenring-ai/scripting` | workspace:* | Scripting service |
| `@tokenring-ai/rpc` | workspace:* | RPC service |
| `zod` | ^4.4.3 | Schema validation |
| `ignore` | ^7.0.6 | Git ignore pattern matching |
| `diff` | ^9.0.0 | Diff generation for file operations |
| `mime-types` | ^3.0.2 | MIME type detection |

**Development Dependencies:**

| Package | Version | Description |
|---------|---------|-------------|
| `@types/mime-types` | ^3.0.1 | TypeScript types |
| `typescript` | ^7.0.2 | TypeScript compiler |

## License

MIT License - see LICENSE file for details.
