# @tokenring-ai/filesystem Package

A filesystem abstraction service for Token Ring AI agents that provides unified file operations including reading, writing, searching, and executing commands through a provider-based architecture.

## Overview

The `@tokenring-ai/filesystem` package provides a unified, abstracted filesystem interface for AI agents in Token Ring applications. It enables secure file operations including:

- File reading and writing with safety controls
- File search and content management
- Chat-based file management
- Context-aware file tracking and state management
- Multi-provider architecture for different filesystem implementations
- RPC endpoints for remote file operations
- Scripting functions for common file operations
- Automatic ignore filter system (.gitignore, .aiignore support)
- File validation system for post-write validation

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
    fileSearch: z.object({
      maxSnippetCount: z.number().default(10),
      maxSnippetSizePercent: z.number().default(0.3),
      snippetLinesBefore: z.number().default(5),
      snippetLinesAfter: z.number().default(5),
    }).prefault({}),
  }),
  providers: z.record(z.string(), z.any()),
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
  fileSearch: z.object({
    maxSnippetCount: z.number().optional(),
    maxSnippetSizePercent: z.number().optional(),
    snippetLinesBefore: z.number().optional(),
    snippetLinesAfter: z.number().optional(),
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
- `requireFileSystemProviderByName(name: string)`: Retrieves a registered provider
- `setActiveFileSystem(providerName: string, agent: Agent)`: Sets the active provider for an agent
- `requireActiveFileSystem(agent: Agent)`: Gets the active provider for an agent

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
  agent.initializeState(FileSystemState, config);
  if (config.selectedFiles.length > 0) {
    creationContext.items.push(`Selected Files: ${config.selectedFiles.join(', ')}`);
  }
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
  ): AsyncGenerator<string>;

  // File operations
  writeFile(absolutePath: string, content: string | Buffer): Promise<boolean>;
  appendFile(absoluteFilePath: string, finalContent: string | Buffer): Promise<boolean>;
  deleteFile(absolutePath: string): Promise<boolean>;
  readFile(absolutePath: string): Promise<Buffer|null>;
  rename(oldAbsolutePath: string, newAbsolutePath: string): Promise<boolean>;
  exists(absolutePath: string): Promise<boolean>;
  stat(absolutePath: string): Promise<StatLike>;
  createDirectory(
    absolutePath: string,
    options?: { recursive?: boolean },
  ): Promise<boolean>;
  copy(
    absoluteSource: string,
    absoluteDestination: string,
    options?: { overwrite?: boolean },
  ): Promise<boolean>;
  glob(absolutePattern: string, options?: GlobOptions): Promise<string[]>;
  watch(absoluteDir: string, options?: WatchOptions): Promise<any>;
  grep(
    searchString: string | string[],
    options?: GrepOptions,
  ): Promise<GrepResult[]>;
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

Tools are exported from `tools.ts` and registered with ChatService during plugin installation.

### file_write

Writes a file to the filesystem.

**Tool Definition:**
```typescript
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import write from "./tools/write.ts";

const name = "file_write";
const displayName = "Filesystem/write";
```

**Parameters:**
- `path`: Relative path of the file to write (required). Paths are relative to the project root directory, and should not have a prefix (e.g. 'subdirectory/file.txt' or 'docs/file.md'). Directories are auto-created as needed.
- `content`: Content to write to the file (required). ALWAYS include the ENTIRE file contents to avoid data loss.

**Behavior:**
- Enforces read-before-write policy if configured (`requireReadBeforeWrite`)
- Creates parent directories automatically if needed
- Returns diff if file existed before (up to `maxReturnedDiffSize` limit)
- Sets filesystem as dirty on success
- Marks file as read in state
- Generates artifact output (diff for modifications, full content for new files)
- Runs file validator if configured (`validateWrittenFiles`)

**Error Cases:**
- Returns helpful message if file wasn't read before write and policy is enforced
- Includes original file contents in error message to expedite the workflow

**Agent State:**
- Sets `state.dirty = true`
- Adds file to `state.readFiles`

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

**Tool Definition:**
```typescript
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import read from "./tools/read.ts";

const name = "file_read";
const displayName = "Filesystem/read";
```

**Parameters:**
- `files`: List of file paths or glob patterns (required). Examples: `'**/*.ts'`, `'path/to/file.txt'`

**Behavior:**
- Resolves glob patterns to specific files
- Checks file existence for each path
- Reads file contents (up to `maxFileSize` limit)
- Marks read files in `FileSystemState`
- Returns file names only if too many files are matched
- Handles binary files gracefully (returns "[File is binary and cannot be displayed]")
- Handles directories by recursively reading contents
- Treats pattern resolution errors as informational

**Error Cases:**
- Returns "No files were found that matched the search criteria" if no files match
- Returns directory listing if more than `maxFileReadCount` files matched
- Returns "[File is too large to retrieve]" for files exceeding `maxFileSize`

**Agent State:**
- Adds matched file paths to `state.readFiles`

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

### file_search

Searches for text patterns within files.

**Tool Definition:**
```typescript
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import search from "./tools/search.ts";

const name = "file_search";
const displayName = "Filesystem/search";
```

**Parameters:**
- `filePaths`: List of file paths or glob patterns to search within (defaults to `["**/*"]`)
- `searchTerms`: List of search terms to search for. Can be plain strings (fuzzy substring match) or regex (enclosed in `/`)

**Behavior:**
- Supports substring, regex, and exact matching
- Returns grep-style snippets with context lines (`snippetLinesBefore` and `snippetLinesAfter`)
- Automatically decides whether to return full file contents, snippets, or file names based on match count
- Marks read files in state
- Searches are OR-based across multiple patterns (any match counts)

**Search Patterns:**
- Plain strings: Fuzzy substring matching (case-insensitive)
- Regex: Enclosed in `/` (e.g., `/class \w+Service/`)

**Output Format:**
- When matches are few: Returns grep-style snippets with line numbers
- When snippet is too large: Returns full file contents
- When too many files match: Returns directory listing with file names

**Error Cases:**
- Returns "No files were found that matched the search criteria" if no files match
- Returns directory listing if more than `maxSnippetCount` files matched

**Agent State:**
- Adds matched file paths to `state.readFiles`

**Required Context Handlers:** `["selected-files"]`

**Examples:**
```typescript
// Search for a function across all files
const result = await search({
  filePaths: ['src/**/*.ts'],
  searchTerms: ['function execute']
}, agent);

// Regex search for pattern
const result = await search({
  filePaths: ['pkg/agent/**/*.ts'],
  searchTerms: ['/class \w+Service/']
}, agent);

// Search with specific files
const result = await search({
  filePaths: ['src/**/*.ts', 'pkg/**/*.ts'],
  searchTerms: ['TODO', 'FIXME']
}, agent);

// Search across all files (default)
const result = await search({
  searchTerms: ['import']
}, agent);
```

## Chat Commands

### /file

Manage files in the chat session.

**Location:** `commands/file/`

| Command | File | Aliases | Description |
|---------|------|---------|-------------|
| `/file select` | `commands/file/select.ts` | - | Interactive file selector |
| `/file add [files...]` | `commands/file/add.ts` | - | Add specific files to chat |
| `/file remove [files...]` | `commands/file/remove.ts` | `/file rm` | Remove specific files from chat |
| `/file list` | `commands/file/list.ts` | `/file ls` | List all files currently in chat |
| `/file clear` | `commands/file/clear.ts` | - | Remove all files from chat |
| `/file default` | `commands/file/default.ts` | - | Reset to default files from config |

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

## Context Handlers

### selected-files

Provides contents of selected files as chat context.

**Location:** `contextHandlers/selectedFiles.ts`

**Handler:** `getContextItems({agent}: ContextHandlerOptions): AsyncGenerator<ContextItem>`

**Behavior:**
- Yields file contents for files in `state.selectedFiles`
- For directories, yields directory listings
- Marks files as read in `state.readFiles`
- Output format:
  - Files: `BEGIN FILE ATTACHMENT: {path}\n{content}\nEND FILE ATTACHMENT: {path}`
  - Directories: `BEGIN DIRECTORY LISTING:\n{path}\n- {file}\n...\nEND DIRECTORY LISTING`

**Implementation:**
```typescript
export default async function* getContextItems({agent}: ContextHandlerOptions): AsyncGenerator<ContextItem> {
  const fileSystemService = agent.requireServiceByType(FileSystemService);

  const fileContents: string[] = [];
  const directoryContents: string[] = [];
  for (const file of agent.getState(FileSystemState).selectedFiles) {
    const content = await fileSystemService.readTextFile(file, agent);
    if (content) {
      fileContents.push(`BEGIN FILE ATTACHMENT: ${file}\n${content}\nEND FILE ATTACHMENT: ${file}`);
      agent.mutateState(FileSystemState, (state: FileSystemState) => {
        state.readFiles.add(file);
      });
    } else {
      try {
        const directoryListing = await fileSystemService.getDirectoryTree(file, {}, agent);
        const files = await Array.fromAsync(directoryListing);
        directoryContents.push(`BEGIN DIRECTORY LISTING:\n${file}\n${files.map(f => `- ${f}`).join("\n")}\nEND DIRECTORY LISTING`);
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

## filepath (filename)

Matching lines:
  Line N: content line
  ...

## anotherfile (content)

Finding line N: content
```

## RPC Endpoints

The package registers RPC endpoints under `/rpc/filesystem`.

**Location:** `rpc/filesystem.ts`

### Endpoints

| Method | Type | Description | Request Params | Response Params |
|--------|------|-------------|----------------|-----------------|
| `readTextFile` | Query | Read file content as text | `{ agentId, path }` | `{ content: string \| null }` |
| `exists` | Query | Check if a file exists | `{ agentId, path }` | `{ exists: boolean }` |
| `stat` | Query | Get file statistics | `{ agentId, path }` | `{ stats: string }` |
| `glob` | Query | Match files with glob pattern | `{ agentId, pattern }` | `{ files: string[] }` |
| `listDirectory` | Query | List directory contents | `{ agentId, path, showHidden?, recursive? }` | `{ files: string[] }` |
| `writeFile` | Mutation | Write a file | `{ agentId, path, content }` | `{ success: boolean }` |
| `appendFile` | Mutation | Append to a file | `{ agentId, path, content }` | `{ success: boolean }` |
| `deleteFile` | Mutation | Delete a file | `{ agentId, path }` | `{ success: boolean }` |
| `rename` | Mutation | Rename a file | `{ agentId, oldPath, newPath }` | `{ success: boolean }` |
| `createDirectory` | Mutation | Create a directory | `{ agentId, path, recursive? }` | `{ success: boolean }` |
| `copy` | Mutation | Copy a file or directory | `{ agentId, source, destination, overwrite? }` | `{ success: boolean }` |
| `addFileToChat` | Mutation | Add file to chat context | `{ agentId, file }` | `{ success: boolean }` |
| `removeFileFromChat` | Mutation | Remove file from chat context | `{ agentId, file }` | `{ success: boolean }` |
| `getSelectedFiles` | Query | Get currently selected files in chat | `{ agentId }` | `{ files: string[] }` |

**RPC Client Example:**
```typescript
import { createRPCClient } from "@tokenring-ai/rpc";

const client = createRPCClient("/rpc/filesystem");

// Read a file
const { content } = await client.readTextFile({
  agentId: "agent-123",
  path: "src/main.ts"
});

// Write a file
const { success } = await client.writeFile({
  agentId: "agent-123",
  path: "src/new.ts",
  content: "// New file"
});

// List directory
const { files } = await client.listDirectory({
  agentId: "agent-123",
  path: "src",
  recursive: true
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
  readFiles: Set<string>          // Files that have been read
  fileWrite: FileWriteConfig      // Write configuration
  fileRead: FileReadConfig        // Read configuration
  fileSearch: FileSearchConfig    // Search configuration
  initialConfig?: {
    selectedFiles: string[]       // Initial selected files from config
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
console.log('Read files:', Array.from(state.readFiles));

// Mutate state
agent.mutateState(FileSystemState, (state) => {
  state.dirty = true;
  state.readFiles.add('src/main.ts');
});
```

**State Methods:**
```typescript
state.reset()                    // Reset to initial config
state.serialize()                // Return serializable state
state.deserialize(data)          // Restore state from object
state.show()                     // Return human-readable summary
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

## File Validator System

File validators can be registered to validate file contents after writing:

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

### clearReadFiles

Automatically clears the read files state when the chat context is compacted or cleared.

**Location:** `hooks/clearReadFiles.ts`

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
- Clears `state.readFiles` when chat is compacted or cleared
- Resets `state.dirty` to false

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
├── tools.ts                         # Tool exports
├── tools/
│   ├── write.ts                     # file_write tool
│   ├── read.ts                      # file_read tool
│   └── search.ts                    # file_search tool
├── commands.ts                      # Command exports
├── commands/
│   └── file/
│       ├── select.ts                # /file select
│       ├── add.ts                   # /file add
│       ├── remove.ts                # /file remove
│       ├── list.ts                  # /file list
│       ├── clear.ts                 # /file clear
│       └── default.ts               # /file default
├── contextHandlers.ts               # Context handler exports
├── contextHandlers/
│   ├── selectedFiles.ts             # selected-files context handler
│   └── searchFiles.ts               # search-files context handler
├── state/
│   └── fileSystemState.ts           # State management
├── util/
│   ├── createIgnoreFilter.ts        # Ignore filter creation
│   └── runFileValidator.ts          # File validator runner
├── rpc/
│   ├── filesystem.ts                # RPC endpoint definitions
│   └── schema.ts                    # RPC schema definitions
├── hooks.ts                         # Hook exports
├── hooks/
│   └── clearReadFiles.ts            # clearReadFiles hook
├── vitest.config.ts                 # Test configuration
└── README.md                        # This file
```

## Testing

```bash
# Run tests
bun test

# Run with watch mode
bun test:watch

# Run coverage
bun test:coverage

# Run integration tests
bun test:integration

# Run e2e tests
bun test:e2e

# Run all tests including integration
bun test:all
```

## Dependencies

**Production Dependencies:**
- `@tokenring-ai/agent`: Agent framework
- `@tokenring-ai/app`: Application framework
- `@tokenring-ai/chat`: Chat service
- `@tokenring-ai/ai-client`: AI client registry
- `@tokenring-ai/utility`: Utility functions
- `@tokenring-ai/lifecycle`: Lifecycle service
- `@tokenring-ai/scripting`: Scripting service
- `@tokenring-ai/rpc`: RPC service
- `zod`: Schema validation
- `ignore`: Git ignore pattern matching
- `path-browserify`: Path manipulation for browser
- `diff`: Diff generation for file operations
- `mime-types`: MIME type lookup for file artifacts

**Development Dependencies:**
- `@vitest/coverage-v8`: Coverage tool
- `vitest`: Testing framework
- `typescript`: TypeScript compiler

## License

MIT License - see [LICENSE](./LICENSE) file for details.
