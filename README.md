# @tokenring-ai/filesystem

A filesystem abstraction service for Token Ring AI agents that provides unified file operations including reading, writing, searching, and executing commands through a provider-based architecture.

## Overview

The `@tokenring-ai/filesystem` package provides a unified, abstracted filesystem interface for AI agents in Token Ring applications. It enables secure file operations including:

- File reading and writing with safety controls
- File editing with contiguous line matching and fuzzy matching support
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

The package integrates deeply with the agent system, providing both tools for AI-driven operations and chat commands for user interface control.

## Installation

```bash
bun install @tokenring-ai/filesystem
```

## Plugin Registration

```typescript
import {TokenRingPlugin} from "@tokenring-ai/app";
import {z} from "zod";
import plugin from "./plugin.ts";
import packageJSON from "./package.json" with {type: 'json'};
import {FileSystemConfigSchema} from "./schema.ts";

const packageConfigSchema = z.object({
  filesystem: FileSystemConfigSchema.optional(),
});

export default plugin satisfies TokenRingPlugin<typeof packageConfigSchema>;
```

## Plugin Configuration

### FileSystemConfigSchema

```typescript
const FileSystemConfigSchema = z.object({
  agentDefaults: z.object({
    provider: z.string(),
    workingDirectory: z.string(),
    selectedFiles: z.array(z.string()).default([]),
    fileWrite: z.object({
      requireReadBeforeWrite: z.boolean().default(true),
      maxReturnedDiffSize: z.number().default(1024),
      validateWrittenFiles: z.boolean().default(true),
    }).prefault({}),
    fileRead: z.object({
      maxFileReadCount: z.number().default(10),
      maxFileSize: z.number().default(128 * 1024), // 128KB default
    }).prefault({}),
    fileGrep: z.object({
      maxSnippetCount: z.number().default(10),
      maxSnippetSizePercent: z.number().default(0.3),
      snippetLinesBefore: z.number().default(5),
      snippetLinesAfter: z.number().default(5),
    }).prefault({}),
    fileEdit: z.object({
      enabled: z.boolean().default(true),
      fuzzyMatchSimilarity: z.number().min(0.7).max(1).default(0.85),
      minimumMatchedCharacters: z.number().default(15),
      consecutiveFailureCount: z.number().default(0),
      disableAfterConsecutiveFailures: z.number().default(2),
    }).prefault({}),
  }),
}).strict();
```

### FileSystemAgentConfigSchema

```typescript
const FileSystemAgentConfigSchema = z.object({
  provider: z.string().optional(),
  workingDirectory: z.string().optional(),
  selectedFiles: z.array(z.string()).optional(),
  fileWrite: z.object({
    requireReadBeforeWrite: z.boolean().optional(),
    maxReturnedDiffSize: z.number().optional(),
    validateWrittenFiles: z.boolean().optional(),
  }).optional(),
  fileRead: z.object({
    maxFileReadCount: z.number().optional(),
    maxFileSize: z.number().optional()
  }).optional(),
  fileGrep: z.object({
    maxSnippetCount: z.number().optional(),
    maxSnippetSizePercent: z.number().optional(),
    snippetLinesBefore: z.number().optional(),
    snippetLinesAfter: z.number().optional(),
  }).optional(),
  fileEdit: z.object({
    enabled: z.boolean().optional(),
    fuzzyMatchSimilarity: z.number().min(0.7).max(1).optional(),
    minimumMatchedCharacters: z.number().optional(),
    consecutiveFailureCount: z.number().optional(),
    disableAfterConsecutiveFailures: z.number().optional(),
  }).optional(),
}).strict().default({});
```

## Core Components

### FileSystemService

The main service class implementing `TokenRingService`. It manages filesystem providers, agent state, and delegates operations.

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

#### File Validator Management

- `registerFileValidator(extension: string, validator: FileValidator)`: Registers a validator for file extension
- `getFileValidatorForExtension(extension: string)`: Gets validator for file extension

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
  this.defaultProvider = this.fileSystemProviderRegistry.requireItemByName(this.options.agentDefaults.provider);
}
```

**Attach Method:**

```typescript
attach(agent: Agent, creationContext: AgentCreationContext): void {
  const config = deepMerge(this.options.agentDefaults, agent.getAgentConfigSlice('filesystem', FileSystemAgentConfigSchema))
  const initialState = agent.initializeState(FileSystemState, config);
  if (config.selectedFiles.length > 0) {
    creationContext.items.push(`Selected Files: ${Array.from(initialState.selectedFiles).join(', ')}`);
  }
  creationContext.items.push(`Working Directory: ${initialState.workingDirectory}`);
}
```

### FileSystemProvider

Abstract interface for filesystem implementations. Implementations can provide virtual, remote, or local filesystem access.

**Interface:**

```typescript
export type StatLike = {
  path: string;
  absolutePath?: string;
  exists: true;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink?: boolean;
  size?: number;
  created?: Date;
  modified?: Date;
  accessed?: Date;
} | {
  path: string;
  exists: false;
}

export interface GrepResult {
  file: string;
  line: number;
  match: string;
  matchedString?: string;
  content: string | null;
}

export interface DirectoryTreeOptions {
  ignoreFilter: (path: string) => boolean;
  recursive?: boolean;
}

export interface GlobOptions {
  ignoreFilter: (path: string) => boolean;
  absolute?: boolean;
  includeDirectories?: boolean;
}

export interface WatchOptions {
  ignoreFilter: (path: string) => boolean;
  pollInterval?: number;
  stabilityThreshold?: number;
}

export interface GrepOptions {
  ignoreFilter: (path: string) => boolean;
  includeContent?: { linesBefore?: number; linesAfter?: number };
  cwd?: string;
}

export default interface FileSystemProvider {
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
  watch?(absoluteDir: string, options?: WatchOptions): MaybePromise<any>;
  grep?(
    searchString: string | string[],
    options?: GrepOptions,
  ): MaybePromise<GrepResult[]>;
}
```

### FileMatchResource

A resource class for matching files based on include/exclude patterns. Provides async generation of matched files using the FileSystemService.

**Exports:**

```typescript
import FileMatchResource from "@tokenring-ai/filesystem/FileMatchResource";

export interface MatchItem {
  path: string;
  include?: RegExp;
  exclude?: RegExp;
}
```

**Class:**

```typescript
export default class FileMatchResource {
  constructor(private readonly items: MatchItem[])

  async* getMatchedFiles(agent: Agent): AsyncGenerator<string>
  async addFilesToSet(set: Set<string>, agent: Agent): Promise<void>
}
```

**Usage:**

```typescript
const fileMatchResource = new FileMatchResource([
  { path: 'src', include: /\.ts$/ },
  { path: 'pkg', exclude: /node_modules/ }
]);

for await (const file of fileMatchResource.getMatchedFiles(agent)) {
  console.log(file);
}
```

## Tools

Tools are exported from `tools.ts` and registered with `ChatService` during plugin installation.

Currently, five tools are actively exported: `file_edit`, `file_write`, `file_read`, `file_glob`, and `file_grep`. The `append` tool is defined but commented out in the exports.

### file_edit

Modifies an existing file by finding and replacing contiguous blocks of lines.

**File:** `pkg/filesystem/tools/edit.ts`

**Tool Definition:**

```typescript
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import edit from "@tokenring-ai/filesystem/tools/edit";

const name = "file_edit";
const displayName = "Filesystem/edit";
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Relative path of the file to edit (required). Relative to the project root directory. |
| `findLines` | `string` | Up to 3 contiguous lines to match in the file (required). Each line must be complete, and all matched lines must be contiguous. |
| `replaceLines` | `string` | The complete lines that will replace the matched block (required). Provide an empty string to delete the matched lines. |

**Behavior:**

- Finds a contiguous block of complete lines in an existing file
- Replaces those lines with new lines
- Matches must be exact, complete lines, with the exact prior content of the line
- Partial-line matches are never allowed
- Supports fuzzy matching with configurable similarity threshold (default: 0.85) when exact match fails
- Automatically writes the updated file if content changes
- Returns diff if file existed before (up to `maxReturnedDiffSize` limit)
- Sets filesystem as dirty on success
- Resets consecutive failure count on success
- Runs file validator if configured (`validateWrittenFiles`)
- Tool can be automatically disabled after `disableAfterConsecutiveFailures` consecutive failures

**Matching Rules:**

- Ignores whitespace when matching lines
- Requires contiguous block of lines (no gaps)
- Maximum 3 lines for find operation
- Fuzzy matching uses Levenshtein similarity when exact match fails
- Minimum 15 characters required for fuzzy matching
- Configurable via `fuzzyMatchSimilarity` and `minimumMatchedCharacters` options

**Error Cases:**

- Returns error if multiple exact matches found
- Returns error if fuzzy match is not unique enough
- Returns error if no match found
- Returns error if file cannot be read
- Returns error if file edit is disabled for the session

**Agent State:**

- Sets `state.dirty = true`
- Updates `state.fileEdit.consecutiveFailureCount` (resets on success, increments on failure)
- May disable `state.fileEdit.enabled` after consecutive failures

**Required Context Handlers:** `["selected-files"]`

**Adjust Activation:**

The tool supports dynamic activation based on `state.fileEdit.enabled`:

```typescript
function adjustActivation(enabled: boolean, agent: Agent): boolean {
  return enabled && agent.getState(FileSystemState).fileEdit.enabled;
}
```

**Example:**

```typescript
// Modify an existing file
const result = await edit({
  path: 'src/main.ts',
  findLines: 'const x = 1;\nconst y = 2;',
  replaceLines: 'const x = 10;\nconst y = 20;'
}, agent);

// Delete lines
const result = await edit({
  path: 'src/main.ts',
  findLines: '// Old comment\nconst old = true;',
  replaceLines: ''
}, agent);
```

### file_write

Writes a file to the filesystem.

**File:** `pkg/filesystem/tools/write.ts`

**Tool Definition:**

```typescript
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import write from "@tokenring-ai/filesystem/tools/write";

const name = "file_write";
const displayName = "Filesystem/write";
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Relative path of the file to write (required). Paths are relative to the project root directory, and should not have a prefix (e.g. 'subdirectory/file.txt' or 'docs/file.md'). Directories are auto-created as needed. |
| `content` | `string` | Content to write to the file (required). ALWAYS include the ENTIRE file contents to avoid data loss. |

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

**Required Context Handlers:** `["selected-files"]`

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

**File:** `pkg/filesystem/tools/read.ts`

**Tool Definition:**

```typescript
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import read from "@tokenring-ai/filesystem/tools/read";

const name = "file_read";
const displayName = "Filesystem/read";
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `files` | `string[]` | List of file paths or glob patterns (required). Examples: `'**/*.ts'`, `'path/to/file.txt'` |

**Behavior:**

- Resolves glob patterns to specific files
- Checks file existence for each path
- Reads file contents (up to `maxFileSize` limit)
- Marks read files in `FileSystemState` Map with modification time
- Returns file names only if too many files are matched
- Handles binary files gracefully (returns "[File is binary and cannot be displayed]")
- Handles directories by recursively reading contents
- Treats pattern resolution errors as informational

**Error Cases:**

- Returns "No files were found that matched the search criteria" if no files match
- Returns directory listing if more than `maxFileReadCount` files matched
- Returns "[File is too large to retrieve]" for files exceeding `maxFileSize`

**Agent State:**

- Adds matched file paths to `state.readFiles` Map with modification time

**Required Context Handlers:** `["selected-files"]`

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

**File:** `pkg/filesystem/tools/glob.ts`

**Tool Definition:**

```typescript
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import glob from "@tokenring-ai/filesystem/tools/glob";

const name = "file_glob";
const displayName = "Filesystem/glob";
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filePaths` | `string[]` | `["**/*"]` | List of glob patterns to match files. Examples: `'**/*.ts'`, `'path/to/file.txt'` |

**Behavior:**

- Resolves glob patterns to specific files
- Returns matched files as a directory listing
- Handles multiple patterns (OR-based)
- Paths are relative to the project root folder
- Uses Unix-style '/' separators

**Output Format:**

```
BEGIN DIRECTORY LISTING
- file1.ts
- file2.ts
- path/to/file3.ts
END DIRECTORY LISTING
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

**File:** `pkg/filesystem/tools/grep.ts`

**Tool Definition:**

```typescript
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import grep from "@tokenring-ai/filesystem/tools/grep";

const name = "file_grep";
const displayName = "Filesystem/grep";
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filePaths` | `string[]` | `["**/*"]` | List of file paths or glob patterns to search within. Examples: `'**/*.ts'`, `'path/to/file.txt'` |
| `searchTerms` | `string[]` | - | List of search terms. Plain strings use fuzzy substring match; wrap in `'/'` for regex. Examples: `"searchTerm"`, `"/searchTerm.*/"` |

**Behavior:**

- Supports substring, regex, and exact matching
- Returns grep-style snippets with context lines (`snippetLinesBefore` and `snippetLinesAfter`)
- Automatically decides whether to return full file contents, snippets, or file names based on match count
- Marks read files in state with modification time
- Searches are OR-based across multiple patterns (any match counts)
- Tool activation depends on filesystem provider supporting grep

**Search Patterns:**

- Plain strings: Fuzzy substring matching (case-insensitive)
- Regex: Enclosed in `/` (e.g., `/class \w+Service/`)

**Output Format:**

- When matches are few: Returns grep-style snippets with line numbers (format: `BEGIN FILE GREP MATCHES: {file} (line: match)`)
- When snippet is too large: Returns full file contents (format: `BEGIN FILE ATTACHMENT: {file}`)
- When too many files match: Returns directory listing with file names

**Error Cases:**

- Returns "No files were found that matched the search criteria" if no files match
- Returns directory listing if more than `maxSnippetCount` files matched

**Agent State:**

- Adds matched file paths to `state.readFiles` Map with modification time

**Required Context Handlers:** `["selected-files"]`

**Adjust Activation:**

The tool supports dynamic activation based on filesystem provider support:

```typescript
function adjustActivation(enabled: boolean, agent: Agent): boolean {
  const supportsGrep = agent.requireServiceByType(FileSystemService).supportsGrep(agent);
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
  searchTerms: ['/class \w+Service/']
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

**Location:** `commands/file/`

| Command | File | Aliases | Description |
|---------|------|---------|-------------|
| `file select` | `commands/file/select.ts` | - | Interactive file selector |
| `file add [files...]` | `commands/file/add.ts` | - | Add specific files to chat |
| `file remove [files...]` | `commands/file/remove.ts` | `file rm` | Remove specific files from chat |
| `file list` | `commands/file/list.ts` | `file ls` | List all files currently in chat |
| `file clear` | `commands/file/clear.ts` | - | Remove all files from chat |
| `file default` | `commands/file/default.ts` | - | Reset to default files from config |

**Command Examples:**

```bash
# Interactive file selection
/file select

# Add specific files
/file add src/main.ts src/utils.ts

# Remove a file
/file remove src/main.ts
/file rm src/main.ts

# List files in chat
/file list
/file ls

# Clear all files
/file clear

# Reset to default files
/file default
```

### filesystem/provider

Manage filesystem providers.

**Location:** `commands/filesystem/provider/`

| Command | File | Aliases | Description |
|---------|------|---------|-------------|
| `filesystem/provider get` | `commands/filesystem/provider/get.ts` | - | Get current provider for agent |
| `filesystem/provider set` | `commands/filesystem/provider/set.ts` | - | Set provider for agent |
| `filesystem/provider select` | `commands/filesystem/provider/select.ts` | - | Interactive provider selector |
| `filesystem/provider reset` | `commands/filesystem/provider/reset.ts` | - | Reset to default provider |

**Command Examples:**

```bash
# Get current provider
/filesystem/provider get

# Set provider
/filesystem/provider set local

# Interactive selection
/filesystem/provider select

# Reset to default
/filesystem/provider reset
```

## Context Handlers

Context handlers are exported from `contextHandlers.ts` and registered with ChatService during plugin installation.

### selected-files

Provides contents of selected files as chat context.

**Location:** `contextHandlers/selectedFiles.ts`

**Handler:** `getContextItems({agent}: ContextHandlerOptions): AsyncGenerator<ContextItem>`

**Behavior:**

- Yields file contents for files in `state.selectedFiles`
- For directories, yields directory listings
- Marks files as read in `state.readFiles` (using modification time as Map value)
- Output format:
  - Files: `BEGIN FILE ATTACHMENT: {path}\n{content}\nEND FILE ATTACHMENT`
  - Directories: `BEGIN DIRECTORY LISTING:\n{path}\n- {file}\n...\nEND DIRECTORY LISTING`

**Implementation:**

```typescript
export default async function* getContextItems({agent}: ContextHandlerOptions): AsyncGenerator<ContextItem> {
  const fileSystem = agent.requireServiceByType(FileSystemService);

  const fileContents: string[] = [];
  const directoryContents: string[] = [];
  for (const filePath of agent.getState(FileSystemState).selectedFiles) {
    const fileModificationTime = await fileSystem.getModifiedTimeNanos(filePath, agent);

    const content = await fileSystem.readTextFile(filePath, agent);
    if (content) {
      fileContents.push(`BEGIN FILE ATTACHMENT: ${filePath}\n${content}\nEND FILE ATTACHMENT`);
      if (fileModificationTime === null) {
        agent.infoMessage(`[FileSystemService] Could not get the modification time for file ${filePath}: Cannot enforce read before write policy`);
      } else {
        agent.mutateState(FileSystemState, (state) => {
          state.readFiles.set(filePath, fileModificationTime);
        });
      }
    } else {
      try {
        const directoryListing = await fileSystem.getDirectoryTree(filePath, {}, agent);
        const files = await Array.fromAsync(directoryListing);
        directoryContents.push(`BEGIN DIRECTORY LISTING:\n${filePath}\n${files.map(f => `- ${f}`).join("\n")}\nEND DIRECTORY LISTING`);
      } catch (error) {
        // The file does not exist, or is not a directory
      }
    }
  }

  if (fileContents.length > 0) {
    yield {
      role: "user",
      content: `// The user has attached the following files:\n\n${fileContents.join("\n\n")}`,
    }
  }

  if (directoryContents.length > 0) {
    yield {
      role: "user",
      content: `// The user has attached the following directory listing:\n\n${directoryContents.join("\n\n")}`,
    }
  }
}
```

### search-files

Provides file search results based on user input keywords.

**Location:** `contextHandlers/searchFiles.ts`

**Handler:** `getContextItems({input, attachments, chatConfig, sourceConfig, agent}: ContextHandlerOptions): AsyncGenerator<ContextItem>`

**Configuration Schema:**

```typescript
const FileSearchContextSchema = z.object({
  maxResults: z.number().default(25),
});
```

**Keyword Extraction:**

- Extracts quoted phrases (exact matches)
- Extracts file paths (containing / or \)
- Extracts file names with extensions
- Splits CamelCase and snake_case identifiers
- Removes stop words
- Deduplicates while preserving order

**Extension Detection:**

- Direct mentions (.ts, .js, etc.)
- Language patterns ("typescript files", "json files", etc.)

**Scoring Algorithm:**

- Filename match: 10 points
- Filename without extension match: 8 points
- Filename contains keyword: 5 * fuzzyScore
- Path contains keyword: 2 * fuzzyScore
- Penalties for deeply nested files: 0.05 per level

**Search Strategies:**

1. **Path/Filename matching**: Uses glob pattern matching over all files
2. **Content search**: Uses grep for high-value keywords (length > 3, alphanumeric pattern)

**Output Format:**

```markdown
Found X file(s) matching keywords: keyword1, keyword2

## filepath (filename + content)

Matching lines:
  Line N: content line
  ...

## anotherfile (content)

Matching lines:
  Line N: content
```

**Exported Utilities:**
The context handler exports utility functions for testing:

- `extractKeywords`: Extract meaningful keywords from user input
- `extractFileExtensions`: Extract potential file extensions mentioned in input
- `fuzzyScore`: Calculate fuzzy match score between two strings (0-1)
- `scoreFilePath`: Score a file path against search keywords
- `searchFiles`: Search for files matching the user's query
- `aggregateGrepResults`: Aggregate grep results by file
- `formatResults`: Format search results as human-readable text

## RPC Endpoints

The package registers RPC endpoints under `/rpc/filesystem`.

**Location:** `rpc/filesystem.ts`

**Schema:** `rpc/schema.ts`

### Endpoints

| Method | Type | Description | Request Params | Response Params |
|--------|------|-------------|----------------|-----------------|
| `getFilesystemProviders` | Query | Get all registered filesystem providers | `{}` | `{ providers: string[] }` |
| `readTextFile` | Query | Read file content as text | `{ provider: string, path: string }` | `{ content: string \| null }` |
| `exists` | Query | Check if a file exists | `{ provider: string, path: string }` | `{ exists: boolean }` |
| `stat` | Query | Get file statistics | `{ provider: string, path: string }` | `{ stats: string }` (JSON stringified StatLike) |
| `glob` | Query | Match files with glob pattern | `{ provider: string, pattern: string }` | `{ files: string[] }` |
| `listDirectory` | Query | List directory contents | `{ provider: string, path: string, showHidden: boolean (default: false), recursive: boolean (default: false) }` | `{ files: string[] }` |
| `writeFile` | Mutation | Write a file | `{ provider: string, path: string, content: string }` | `{ success: boolean }` |
| `appendFile` | Mutation | Append to a file | `{ provider: string, path: string, content: string }` | `{ success: boolean }` |
| `deleteFile` | Mutation | Delete a file | `{ provider: string, path: string }` | `{ success: boolean }` |
| `rename` | Mutation | Rename a file | `{ provider: string, oldPath: string, newPath: string }` | `{ success: boolean }` |
| `createDirectory` | Mutation | Create a directory | `{ provider: string, path: string, recursive: boolean (default: false) }` | `{ success: boolean }` |
| `copy` | Mutation | Copy a file or directory | `{ provider: string, source: string, destination: string, overwrite: boolean (default: false) }` | `{ success: boolean }` |
| `getFilesystemState` | Query | Get filesystem state for agent | `{ agentId: string }` | `{ provider: string, workingDirectory: string, selectedFiles: string[], readFiles: Record<string, number>, dirty: boolean }` |
| `addFileToChat` | Mutation | Add file to chat context | `{ agentId: string, file: string }` | `{ success: boolean }` |
| `removeFileFromChat` | Mutation | Remove file from chat context | `{ agentId: string, file: string }` | `{ success: boolean }` |

**RPC Client Example:**

```typescript
import { createRPCClient } from "@tokenring-ai/rpc";

const client = createRPCClient("/rpc/filesystem");

// Get available providers
const { providers } = await client.getFilesystemProviders({});

// Read a file
const { content } = await client.readTextFile({
  provider: "local",
  path: "src/main.ts"
});

// Write a file
const { success } = await client.writeFile({
  provider: "local",
  path: "src/new.ts",
  content: "// New file"
});

// List directory
const { files } = await client.listDirectory({
  provider: "local",
  path: "src",
  recursive: true
});

// Get filesystem state
const state = await client.getFilesystemState({
  agentId: "agent-123"
});
```

## Scripting Functions

The package registers scripting functions for common file operations:

**Location:** `plugin.ts`

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

## State Management

### FileSystemState

Tracks filesystem-related state for agents.

**Properties:**

```typescript
class FileSystemState {
  selectedFiles: Set<string>       // Files in chat context
  providerName: string | null      // Active provider name
  workingDirectory: string         // Working directory for path resolution
  dirty: boolean                   // Whether files have been modified
  readFiles: Map<string, number>  // Files that have been read (path -> modification time in ms)
  fileWrite: FileWriteConfig      // Write configuration
  fileRead: FileReadConfig        // Read configuration
  fileGrep: FileGrepConfig        // Grep/search configuration
  fileEdit: FileEditConfig        // Edit configuration
  initialConfig: {
    provider: string | null
    workingDirectory: string
    selectedFiles: string[]       // Initial selected files from config
    fileWrite: FileWriteConfig
    fileRead: FileReadConfig
    fileGrep: FileGrepConfig
    fileEdit: FileEditConfig
  }
}
```

**State Slices:**

```typescript
import {FileSystemState} from "./state/fileSystemState.js";

// Get config slice
const config = agent.getAgentConfigSlice('filesystem', FileSystemAgentConfigSchema);

// Initialize state
agent.initializeState(FileSystemState, config);

// Access state
const state = agent.getState(FileSystemState);
console.log('Active provider:', state.providerName);
console.log('Working Directory:', state.workingDirectory);
console.log('Dirty:', state.dirty);
console.log('Selected files:', Array.from(state.selectedFiles));
console.log('Read files:', Array.from(state.readFiles.keys()));
console.log('File edit enabled:', state.fileEdit.enabled);

// Mutate state
agent.mutateState(FileSystemState, (state) => {
  state.dirty = true;
  state.readFiles.set('src/main.ts', Date.now());
});
```

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
  fileRead: FileReadConfig;
  fileGrep: FileGrepConfig;
  fileWrite: FileWriteConfig;
  fileEdit: FileEditConfig;
  readFiles: Record<string, number>;  // Object form of Map
}
```

**State Transfers:**

```typescript
// Child agent transfers state from parent on attach
agent.attach(childAgent);
// childAgent transfers selectedFiles from parent on initialization
```

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
import createIgnoreFilter from "./util/createIgnoreFilter.ts";

async function createIgnoreFilter(fileSystem: FileSystemProvider): Promise<(p: string) => boolean> {
  const ig = ignore();
  ig.add(".git"); // always ignore .git dir at root
  ig.add("*.lock");
  ig.add("node_modules");
  ig.add(".*");

  const gitIgnorePath = ".gitignore";
  if (await fileSystem.exists(gitIgnorePath)) {
    const data = await fileSystem.readFile(gitIgnorePath);
    if (data) {
      const lines = data.toString('utf-8').split(/\r?\n/).filter(Boolean);
      ig.add(lines);
    }
  }

  const aiIgnorePath = ".aiignore";
  if (await fileSystem.exists(aiIgnorePath)) {
    const data = await fileSystem.readFile(aiIgnorePath);
    if (data) {
      const lines = data.toString('utf-8').split(/\r?\n/).filter(Boolean);
      ig.add(lines);
    }
  }

  return ig.ignores.bind(ig);
}
```

**Usage in Operations:**

```typescript
const fileSystem = agent.requireServiceByType(FileSystemService);

// In getDirectoryTree
options.ignoreFilter ??= await createIgnoreFilter(activeFileSystem);
for await (const path of fs.getDirectoryTree(path, options, agent)) {
  if (options.ignoreFilter?.(path)) continue;
  // process path
}

// In glob
options.ignoreFilter ??= await createIgnoreFilter(activeFileSystem);
const files = await fs.glob(pattern, options, agent);
```

## FileValidator Interface

The `FileValidator` type defines the interface for file validation functions:

```typescript
export type FileValidator = (path: string, content: string) => Promise<string | null>;
```

Validators receive the file path and content, and return:

- `null` for successful validation
- An error message string for validation failures

Validators are registered with the `FileSystemService`:

**Registration:**

```typescript
const fileSystemService = app.requireService(FileSystemService);

fileSystemService.registerFileValidator('.ts', async (path: string, content: string) => {
  // Validate TypeScript file
  const result = await runTypeScriptValidator(content);
  return result ? `TypeScript validation failed: ${result}` : null;
});
```

**Usage:**

- Validators are automatically run after file writes if `validateWrittenFiles` is enabled
- Validators receive the file path and content
- Return `null` for success, or an error message string for failure
- Error messages are appended to the tool result

## Hooks

Hooks are exported from `hooks.ts` and registered with AgentLifecycleService during plugin installation.

### clearReadFiles

Automatically clears the read files state when the chat context is compacted or cleared.

**Location:** `hooks/clearReadFiles.ts`

**Hook Subscription:**

```typescript
const name = "clearReadFiles";
const displayName = "Filesystem/Clear Read Files";
const description = "Automatically clears the read files state when the chat context is compacted or cleared";

function clearReadFiles(_data: any, agent: Agent) {
  agent.mutateState(FileSystemState, state => {
    state.readFiles.clear();
    state.dirty = false;
  });
}

const callbacks = [
  new HookCallback(AfterChatCompaction, clearReadFiles),
  new HookCallback(AfterChatClear, clearReadFiles),
];

export default {name, displayName, description, callbacks} satisfies HookSubscription;
```

**Behavior:**

- Clears `state.readFiles` Map when chat is compacted or cleared
- Resets `state.dirty` to false
- Subscribes to `AfterChatCompaction` and `AfterChatClear` lifecycle events

## Package Structure

```
pkg/filesystem/
├── index.ts                         # Main exports
├── package.json                     # Package configuration
├── plugin.ts                        # Plugin registration
├── schema.ts                        # Zod configuration schemas
├── FileSystemService.ts             # Core service implementation
├── FileSystemProvider.ts            # Provider interface definitions
├── FileMatchResource.ts             # File matching resource class
├── FileValidator.ts                 # File validator interface
├── tools.ts                         # Tool exports
├── tools/
│   ├── edit.ts                      # file_edit tool
│   ├── edit.test.ts                 # Tests for edit tool
│   ├── write.ts                     # file_write tool
│   ├── read.ts                      # file_read tool
│   ├── search.ts                    # file_search tool
│   ├── glob.ts                      # file_glob tool
│   ├── grep.ts                      # file_grep tool
│   └── append.ts                    # file_append tool (commented out)
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
│       ├── get.ts                   # /filesystem/provider get
│       ├── set.ts                   # /filesystem/provider set
│       ├── select.ts                # /filesystem/provider select
│       └── reset.ts                 # /filesystem/provider reset
├── contextHandlers.ts               # Context handler exports
├── contextHandlers/
│   ├── selectedFiles.ts             # selected-files context handler
│   └── searchFiles.ts               # search-files context handler
├── state/
│   └── fileSystemState.ts           # State management
├── util/
│   ├── createIgnoreFilter.ts        # Ignore filter creation
│   ├── runFileValidator.ts          # File validator runner
│   ├── createFileWriteResult.ts     # File write result creation
│   ├── findContiguousLineMatch.ts   # Line matching utility
│   ├── findContiguousLineMatch.test.ts  # Tests for line matching
│   ├── fallbackGlob.ts              # Fallback glob implementation
│   └── hooks/
│       └── autoCommit.ts            # Auto-commit hook utility
├── rpc/
│   ├── filesystem.ts                # RPC endpoint definitions
│   └── schema.ts                    # RPC schema definitions
├── hooks.ts                         # Hook exports
├── hooks/
│   └── clearReadFiles.ts            # clearReadFiles hook
├── vitest.config.ts                 # Test configuration
└── README.md                        # Package README
```

## Testing

The package uses `vitest` for testing. Test files follow the `*.test.ts` naming convention.

**Available Test Files:**

- `tools/edit.test.ts` - Tests for the edit tool
- `util/findContiguousLineMatch.test.ts` - Tests for line matching utility

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test:watch

# Run tests with coverage
bun test:coverage

# Run integration tests
bun test:integration

# Run e2e tests
bun test:e2e

# Run all tests including integration
bun test:all

# Build (type check)
bun build
```

## Dependencies

**Production Dependencies:**

| Package | Version | Description |
|---------|---------|-------------|
| `@tokenring-ai/agent` | 0.2.0 | Agent framework |
| `@tokenring-ai/app` | 0.2.0 | Application framework |
| `@tokenring-ai/chat` | 0.2.0 | Chat service |
| `@tokenring-ai/ai-client` | 0.2.0 | AI client registry |
| `@tokenring-ai/utility` | 0.2.0 | Utility functions |
| `@tokenring-ai/lifecycle` | 0.2.0 | Lifecycle service |
| `@tokenring-ai/scripting` | 0.2.0 | Scripting service |
| `@tokenring-ai/rpc` | 0.2.0 | RPC service |
| `zod` | ^4.3.6 | Schema validation |
| `ignore` | ^7.0.5 | Git ignore pattern matching |
| `path-browserify` | ^1.0.1 | Path manipulation for browser |
| `diff` | ^8.0.4 | Diff generation for file operations |
| `mime-types` | ^3.0.2 | MIME type detection |

**Development Dependencies:**

| Package | Version | Description |
|---------|---------|-------------|
| `@vitest/coverage-v8` | ^4.1.1 | Coverage tool |
| `vitest` | ^4.1.1 | Testing framework |
| `typescript` | ^6.0.2 | TypeScript compiler |

## License

MIT License - see [LICENSE](./LICENSE) file for details.
