# @tokenring-ai/filesystem Package

A filesystem abstraction service for Token Ring AI agents that provides unified file operations including reading, writing, searching, and executing shell commands through a provider-based architecture.

## Overview

The `@tokenring-ai/filesystem` package provides a unified, abstracted filesystem interface for AI agents in Token Ring applications. It enables secure file operations including:

- File reading and writing with safety controls
- File search and content management
- Shell command execution with safety validation
- Chat-based file management
- Context-aware file tracking and state management
- Multi-provider architecture for different filesystem implementations

The package integrates deeply with the agent system, providing both tools for AI-driven operations and chat commands for user interface control.

## Installation

```bash
bun install @tokenring-ai/filesystem
```

## Plugin Registration

```typescript
import {TokenRingPlugin} from "@tokenring-ai/app";
import {z} from "zod";
import FileSystemService from "./FileSystemService.ts";
import FileMatchResource from "./FileMatchResource.ts";
import packageJSON from './package.json' with {type: 'json'};
import {FileSystemConfigSchema} from "./schema.ts";

const packageConfigSchema = z.object({
  filesystem: FileSystemConfigSchema.optional(),
});

export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  config: packageConfigSchema,
  install(app, config) {
    if (!config.filesystem) return;

    const fileSystemService = new FileSystemService(config.filesystem);
    app.addServices(fileSystemService);

    // Register resources if configured
    if (config.filesystem.resources) {
      for (const [name, resourceConfig] of Object.entries(config.filesystem.resources)) {
        app.addResource(name, new FileMatchResource(resourceConfig));
      }
    }
  },
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
```

## Configuration Schema

### FileSystemConfigSchema

```typescript
const FileSystemConfigSchema = z.object({
  agentDefaults: z.object({
    provider: z.string(),
    selectedFiles: z.array(z.string()).default([]),
    fileWrite: z.object({
      requireReadBeforeWrite: z.boolean().default(true),
      maxReturnedDiffSize: z.number().default(1024),
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
  resources: z.record(z.string(), z.any()),
  safeCommands: z.array(z.string()).default([
    "awk", "cat", "cd", "chdir", "diff", "echo", "find", "git", "grep", "head", "help", "hostname", "id", "ipconfig", "tee",
    "ls", "netstat", "ps", "pwd", "sort", "tail", "tree", "type", "uname", "uniq", "wc", "which", "touch", "mkdir",
    "npm", "yarn", "bun", "tsc", "node", "npx", "bunx", "vitest"
  ]),
  dangerousCommands: z.array(z.string()).default([
    "(^|\\s)dd\\s",
    "(^|\\s)rm.*-.*r",
    "(^|\\s)chmod.*-.*r",
    "(^|\\s)chown.*-.*r",
    "(^|\\s)rmdir\\s",
    "find.*-(delete|exec)",
    "(^|\\s)sudo\\s",
    "(^|\\s)del\\s",
    "(^|\\s)format\\s",
    "(^|\\s)reboot",
    "(^|\\s)shutdown",
    "git.*reset",
  ])
}).strict();
```

### FileSystemAgentConfigSchema

```typescript
const FileSystemAgentConfigSchema = z.object({
  provider: z.string().optional(),
  selectedFiles: z.array(z.string()).optional(),
  fileWrite: z.object({
    requireReadBeforeWrite: z.boolean().optional(),
    maxReturnedDiffSize: z.number().optional(),
  }).optional(),
  fileRead: z.object({
    maxFileReadCount: z.number().optional(),
    maxFileSize: z.number().optional()
  }).optional(),
  fileSearch: z.object({
    maxSnippetCount: z.number().default(10),
    maxSnippetSizePercent: z.number().default(0.3),
    snippetLinesBefore: z.number().default(5),
    snippetLinesAfter: z.number().default(5),
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
- `setActiveFileSystem(name: string, agent: Agent)`: Sets the active provider for an agent
- `requireActiveFileSystem(agent: Agent)`: Gets the active provider for an agent

#### State Management
- `attach(agent: Agent)`: Initializes state for agent
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
- `executeCommand(command: string | string[], options, agent)`: Execute shell command
- `getCommandSafetyLevel(command: string)`: Returns "safe", "unknown", or "dangerous"
- `parseCompoundCommand(command: string)`: Parse compound commands (&&, ||, ;, |)
- `grep(searchString: string | string[], options, agent)`: Search for text patterns in files

**Run Method:**
```typescript
run(): void {
  this.defaultProvider = this.fileSystemProviderRegistry.requireItemByName(this.options.agentDefaults.provider);
}
```

**Attach Method:**
```typescript
attach(agent: Agent): void {
  const config = deepMerge(this.options.agentDefaults, agent.getAgentConfigSlice('filesystem', FileSystemAgentConfigSchema))
  agent.initializeState(FileSystemState, config);
  if (config.selectedFiles.length > 0) {
    agent.infoMessage(`Selected files: ${config.selectedFiles.join(', ')}`);
  }
}
```

### FileSystemProvider

Abstract interface for filesystem implementations. Implementations can provide virtual, remote, or local filesystem access.

**Interface:**
```typescript
export interface StatLike {
  path: string;
  absolutePath?: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink?: boolean;
  size?: number;
  created?: Date;
  modified?: Date;
  accessed?: Date;
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

export interface ExecuteCommandOptions {
  timeoutSeconds: number;
  env?: Record<string, string | undefined>;
  workingDirectory?: string;
}

export interface ExecuteCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}

export interface GrepOptions {
  ignoreFilter: (path: string) => boolean;
  includeContent?: { linesBefore?: number; linesAfter?: number };
}

export default interface FileSystemProvider {
  // Directory walking
  getDirectoryTree(
    path: string,
    params?: DirectoryTreeOptions,
  ): AsyncGenerator<string>;

  // File operations
  writeFile(path: string, content: string | Buffer): Promise<boolean>;
  appendFile(filePath: string, content: string | Buffer): Promise<boolean>;
  deleteFile(path: string): Promise<boolean>;
  readFile(path: string): Promise<Buffer|null>;
  rename(oldPath: string, newPath: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<StatLike>;
  createDirectory(
    path: string,
    options?: { recursive?: boolean },
  ): Promise<boolean>;
  copy(
    source: string,
    destination: string,
    options?: { overwrite?: boolean },
  ): Promise<boolean>;
  glob(pattern: string, options?: GlobOptions): Promise<string[]>;
  watch(dir: string, options?: WatchOptions): Promise<any>;
  executeCommand(
    command: string | string[],
    options?: ExecuteCommandOptions,
  ): Promise<ExecuteCommandResult>;
  grep(
    searchString: string | string[],
    options?: GrepOptions,
  ): Promise<GrepResult[]>;
}
```

### FileMatchResource

A resource class for matching files based on include/exclude patterns. Provides async generation of matched files.

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
  constructor({items}: { items: MatchItem[] })

  async* getMatchedFiles(agent: Agent): AsyncGenerator<string>
  async addFilesToSet(set: Set<string>, agent: Agent): Promise<void>
}
```

## Tools

Tools are exported from `tools.ts` and registered with ChatService during plugin installation.

### file_write

Writes a file to the filesystem.

**Tool Basic Setup:**
```typescript
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import write from "./tools/write.ts";

const name = "file_write";
const displayName = "Filesystem/write";
```

**Parameters:**
- `path`: Relative path of the file to write (required)
- `content`: Content to write to the file (required)

**Behavior:**
- Enforces read-before-write policy if configured
- Creates parent directories automatically if needed
- Returns diff if file existed before (up to maxReturnedDiffSize limit)
- Sets filesystem as dirty on success
- Marks file as read in state
- Generates artifact output (diff)
- Cannot write `skipArtifactOutput: true` to suppress

**Error Cases:**
- Throws error if path or content is missing
- Returns helpful message if file wasn't read before write and policy is enforced

**Agent State:**
- Sets `state.dirty = true`
- Adds file to `state.readFiles`

**Example:**
```typescript
const result = await write({
  path: 'src/main.ts',
  content: '// New file content'
}, agent);
```

### file_append

Appends content to the end of a file.

**Tool Basic Setup:**
```typescript
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import append from "./tools/append.ts";

const name = "file_append";
const displayName = "Filesystem/append";
```

**Parameters:**
- `path`: Relative path of the file to append to (required)
- `content`: The content to add to the end of the file (required)

**Behavior:**
- Ensures file has newline before appending if file exists
- Enforces read-before-write policy if configured
- Creates parent directories automatically if needed
- Returns diff if file existed before (up to maxReturnedDiffSize limit)
- Sets filesystem as dirty on success
- Marks file as read in state
- Generates artifact output (diff)
- Cannot write `skipArtifactOutput: true` to suppress

**Example:**
```typescript
const result = await append({
  path: 'logs/app.log',
  content: '2024-01-15: New entry\n'
}, agent);
```

### file_read

Reads files from the filesystem by path or glob pattern.

**Tool Basic Setup:**
```typescript
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import read from "./tools/read.ts";

const name = "file_read";
const displayName = "Filesystem/read";
```

**Parameters:**
- `files`: List of file paths or glob patterns (required)

**Behavior:**
- Resolves glob patterns to specific files
- Checks file existence for each path
- Reads file contents (up to maxFileSize limit)
- Marks read files in `FileSystemState`
- Returns file names only if too many files are matched
- Handles binary files gracefully

**Error Cases:**
- Returns "No files were found" if no files match
- Returns directory listing if more than `maxFileReadCount` files matched
- Treats pattern resolution errors as informational

**Agent State:**
- Adds matched file paths to `state.readFiles`

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
```

### patchFilesNaturalLanguage

Patches multiple files using natural language descriptions processed by an LLM.

**Tool Basic Setup:**
```typescript
import Agent from "@tokenring-ai/agent/Agent";
import {ChatModelRegistry} from "@tokenring-ai/ai-client/ModelRegistry";
import {ChatService} from "@tokenring-ai/chat";
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import patchFilesNaturalLanguage from "./tools/patchFilesNaturalLanguage.ts";

const systemPrompt = `:The user has provided a file, and a natural language description of an adjustment or patch that needs to be made to the file.:Apply the adjustment to the file, and return the raw updated file content.:`;

const name = "file_patchFilesNaturalLanguage";
const displayName = "Filesystem/patchFilesNaturalLanguage";
```

**Parameters:**
- `files`: List of file paths to patch
- `naturalLanguagePatch`: Detailed natural language description of the patch to apply

**Behavior:**
- Reads original file content
- Uses AI client to generate patched content
- Validates that content is different from original
- Deletes AI! markers from patched content
- Writes patched content back to files
- Sets filesystem as dirty
- Returns success count

**Error Handling:**
- Throws error if no files provided
- Throws error if patch description is required
- Throws error if file doesn't exist
- Throws error if file content can't be read
- Throws error if LLM returns empty content

**Agent State:**
- Sets `state.dirty = true`
- Returns string message with success count

**Example:**
```typescript
const result = await patchFilesNaturalLanguage({
  files: ['src/main.ts'],
  naturalLanguagePatch: 'Replace the deprecated function call with the new async equivalent'
}, agent);
```

### file_patch

Patches a file by replacing content between two specific lines that match exactly.

**Tool Basic Setup:**
```typescript
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import patch from "./tools/patch.ts";

const name = "file_patch";
const displayName = "Filesystem/patch";
```

**Parameters:**
- `file`: Path to the file to patch
- `fromLine`: A line of text that must match exactly to mark the beginning of the content to replace
- `toLine`: A line of text that must match exactly to mark the end of the content to replace
- `content`: The content that will replace everything from fromLine to toLine (inclusive)

**Behavior:**
- Reads original file content
- Normalizes whitespace for comparison
- Finds exact matches for fromLine
- Validates exactly one fromLine match
- Finds toLine matches after fromLine
- Validates exactly one toLine match after fromLine
- Replaces content between fromLine and toLine (inclusive)
- Writes patched content back to file
- Sets filesystem as dirty
- Returns success message with line numbers

**Error Handling:**
- Throws error if required parameters are missing
- Throws error if file content can't be read
- Throws error if fromLine doesn't match anywhere in file
- Throws error if fromLine matches multiple times
- Throws error if toLine doesn't match after fromLine
- Throws error if toLine matches multiple times after fromLine
- All informational messages prefixed with `[patch]`

**Agent State:**
- Sets `state.dirty = true`

**Example:**
```typescript
const result = await patch({
  file: 'src/old-config.ts',
  fromLine: 'export const oldConfig = {',
  toLine: 'export const newConfig = {',
  content: '// New configuration values'
}, agent);
```

### file_regexPatch

Patches a file using regular expressions.

**Tool Basic Setup:**
```typescript
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import regexPatch from "./tools/regexPatch.ts";

const name = "file_regexPatch";
const displayName = "Filesystem/regexPatch";
```

**Parameters:**
- `file`: Path to the file to patch
- `startRegex`: Regular expression to match beginning of block
- `endRegex`: Regular expression to match end of block
- `replacement`: Code to replace matched block

**Behavior:**
- Reads original file content
- Validates regex patterns exist in file
- Replaces content between start and end patterns
- Writes patched content back to file
- Sets filesystem as dirty
- Returns success message

**Error Handling:**
- Throws error if file content can't be read
- Throws error if patterns don't match
- All informational messages prefixed with `[regexPatch]`
- Errors thrown with tool name prefix

**Agent State:**
- Sets `state.dirty = true`

**Example:**
```typescript
const result = await regexPatch({
  file: 'src/main.ts',
  startRegex: 'function oldFunction\\(',
  endRegex: '\\}$',
  replacement: 'async function newFunction() {'
}, agent);
```

### file_search

Searches for text patterns within files.

**Tool Basic Setup:**
```typescript
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import search from "./tools/search.ts";

const name = "file_search";
const displayName = "Filesystem/search";
```

**Parameters:**
- `filePaths`: List of file paths or glob patterns to search within (defaults to ["**/*"])
- `searchTerms`: List of search terms to search for

**Behavior:**
- Supports substring, regex, and exact matching
- Returns grep-style snippets with context lines
- Automatically decides whether to return full file contents, snippets, or file names based on match count
- Marks read files in state
- Supports fuzzy matching and keyword extraction

**Search Patterns:**
- Plain strings: Fuzzy substring matching
- Regex: Enclosed in `/` (e.g., `/class \w+Service/`)

**Error Cases:**
- Returns directory listing if more than `maxSnippetCount` files matched

**Agent State:**
- Adds matched file paths to `state.readFiles`

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
  searchTerms: ['/class \\w+Service/']
}, agent);

// Search with specific files
const result = await search({
  filePaths: ['src/**/*.ts', 'pkg/**/*.ts'],
  searchTerms: ['TODO', 'FIXME']
}, agent);
```

### terminal_bash

Executes shell commands with safety validation.

**Tool Basic Setup:**
```typescript
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import bash from "./tools/bash.ts";

const name = "terminal_bash";
const displayName = "Terminal/bash";
```

**Parameters:**
- `command`: The shell command to execute (required)
- `timeoutSeconds`: Timeout for the command in seconds (default 60, max 90)
- `workingDirectory`: Working directory, relative to the filesystem root

**Returns:**
```typescript
{
  ok: boolean,
  stdout: string,
  stderr: string,
  exitCode: number,
  error?: string
}
```

**Safety Levels:**
- `safe`: Pre-approved commands (e.g., ls, cat, git, npm, bun)
- `unknown`: Commands not in safe/dangerous lists (requires confirmation)
- `dangerous`: Commands matching dangerous patterns (e.g., rm, sudo, chmod)

**Confirmation Flow:**
- Asks for confirmation for unknown commands
- Asks for confirmation for dangerous commands
- User can choose to cancel execution

**Safe Commands:**
```typescript
["awk", "cat", "cd", "chdir", "diff", "echo", "find", "git", "grep", "head", "help", "hostname", "id", "ipconfig", "tee",
 "ls", "netstat", "ps", "pwd", "sort", "tail", "tree", "type", "uname", "uniq", "wc", "which", "touch", "mkdir",
 "npm", "yarn", "bun", "tsc", "node", "npx", "bunx", "vitest"]
```

**Dangerous Commands:**
Commands matching patterns like:
- `rm -rf *`
- `dd *`
- `chmod -R *`
- `chown -R *`
- `rmdir *`
- `find --delete`
- `find --exec rm`
- `sudo *`
- `del *`
- `format *`
- `reboot`
- `shutdown`
- `git reset`

**Example:**
```typescript
const result = await bash({
  command: ['npm', 'install'],
  timeoutSeconds: 120,
  workingDirectory: './frontend'
}, agent);

if (result.ok) {
  console.log('Install completed:', result.stdout);
} else {
  console.error('Install failed:', result.stderr);
}
```

**Tool Export Pattern:**
```typescript
// tools.ts
import write from "./tools/write.ts";
import read from "./tools/read.ts";
import append from "./tools/append.ts";
import patch from "./tools/patch.ts";
import search from "./tools/search.ts";
import bash from "./tools/bash.ts";
import patchFilesNaturalLanguage from "./tools/patchFilesNaturalLanguage.ts";
import regexPatch from "./tools/regexPatch.ts";

export default {
  write,
  read,
  append,
  patch,
  patchFilesNaturalLanguage,
  regexPatch,
  search,
  bash,
};
```

## Chat Commands

### /file

Manage files in the chat session.

**Location:** `commands/file.ts`

**Usage:**
```
/file [action] [files...]
```

**Actions:**
- `select`: Interactive file selector (tree-based selection)
- `add [files...]`: Add specific files to chat (or interactive if no files)
- `remove [files...]` or `rm [files...]`: Remove specific files from chat
- `list` or `ls`: List all files currently in chat
- `clear`: Remove all files from chat
- `default`: Reset to default files from config

**Handler:** `execute(remainder: string, agent: Agent)`

**Help Doc:**
```typescript
const help: string = `# 📁 FILE MANAGEMENT COMMAND

## Usage

/file [action] [files...]

Manage files in your chat session with various actions to add, remove, list, or clear files.

## Available Actions

- **select** - Open interactive file selector
- **add [files...]** - Add specific files to chat session
- **remove [files...]** or `rm [files...]` - Remove specific files from chat
- **list** or `ls` - Show all files currently in chat session
- **clear** - Remove all files from chat session
- **default** - Reset to default files from configuration
```

**Options:**
```typescript
async function selectFiles(filesystem: FileSystemService, agent: Agent) {
  const selectedFiles = await agent.askQuestion({
    message: "Select a file or directory:",
    question: {
      type: 'fileSelect',
      label: "File Selection",
      defaultValue: Array.from(filesystem.getFilesInChat(agent)),
      allowDirectories: true,
      allowFiles: true,
    }
  });
  if (selectedFiles) {
    await filesystem.setFilesInChat(selectedFiles, agent);
    agent.infoMessage(`Selected ${selectedFiles.length} files`);
  }
}

async function addFiles(filesystem: FileSystemService, agent: Agent, filesToAdd: string[]) {
  let addedCount = 0;
  for (const file of filesToAdd) {
    try {
      await filesystem.addFileToChat(file, agent);
      agent.infoMessage(`Added file to chat: ${file}`);
      addedCount++;
    } catch (error) {
      agent.errorMessage(`Failed to add file ${file}:`, error);
    }
  }
  if (addedCount > 0) {
    agent.infoMessage(`Successfully added ${addedCount} file(s)`);
  }
}
```

## Context Handlers

### selectedFiles

Provides contents of selected files as chat context.

**Location:** `contextHandlers/selectedFiles.ts`

**Handler:** `getContextItems(input: string, chatConfig: ParsedChatConfig, params: {}, agent: Agent): AsyncGenerator<ContextItem>`

**Behavior:**
- Yields file contents for files in `state.selectedFiles`
- For directories, yields directory listings
- Marks files as read in `state.readFiles`
- Outputs format:
  - Files: `BEGIN FILE ATTACHMENT: {path}\n{content}\nEND FILE ATTACHMENT: {path}`
  - Directories: `BEGIN DIRECTORY LISTING:\n{path}\n- {file}\n...\nEND DIRECTORY LISTING`

**Implementation:**
```typescript
export default async function* getContextItems(input: string, chatConfig: ParsedChatConfig, params: {}, agent: Agent): AsyncGenerator<ContextItem> {
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
        // File doesn't exist or is not a directory
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

### searchFiles

Provides file search results based on user input keywords.

**Location:** `contextHandlers/searchFiles.ts`

**Handler:** `getContextItems(chatInputMessage: string, chatConfig: ParsedChatConfig, params: unknown, agent: Agent): AsyncGenerator<ContextItem>`

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
- Penalties recursively nested files: 0.05 per level

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

## State Management

### FileSystemState

Tracks filesystem-related state for agents.

**Properties:**
```typescript
interface FileSystemState {
  selectedFiles: Set<string>       // Files in chat context
  providerName: string            // Active provider name
  dirty: boolean                  // Whether files have been modified
  readFiles: Set<string>          // Files that have been read
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
console.log('Dirty:', state.dirty);
console.log('Selected files:', Array.from(state.selectedFiles));
console.log('Read files:', Array.from(state.readFiles));

// Mutate state
agent.mutateState(FileSystemState, (state) => {
  state.dirty = true;
  state.readFiles.add('src/main.ts');
});
```

**State Transfers:**
```typescript
// Child agent transfers state from parent on attach
agent.attach(childAgent);
// childAgent transfers selectedFiles from parent on initialization
```

**State Methods:**
```typescript
state.reset('chat')           // Reset chat context
state.serialize()             // Return serializable state
state.deserialize(data)       // Restore state from object
state.show()                  // Return human-readable summary
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
  ig.add(".git");
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

## Package Structure

```
pkg/filesystem/
├── index.ts                         # Main exports
├── package.json                     # Package configuration
├── schema.ts                        # Zod configuration schemas
├── FileSystemService.ts             # Core service implementation
├── FileSystemProvider.ts            # Provider interface definitions
├── FileMatchResource.ts             # File matching resource class
├── tools.ts                         # Tool exports
├── tools/
│   ├── write.ts                     # file_write tool
│   ├── append.ts                    # file_append tool
│   ├── read.ts                      # file_read tool
│   ├── patch.ts                     # file_patch tool
│   ├── patchFilesNaturalLanguage.ts # file_patchFilesNaturalLanguage tool
│   ├── regexPatch.ts                # file_regexPatch tool
│   ├── search.ts                    # file_search tool
│   └── bash.ts                      # terminal_bash tool
├── commands/
│   └── file.ts                      # /file command implementation
├── contextHandlers.ts               # Context handler exports
├── contextHandlers/
│   ├── selectedFiles.ts             # selectedFiles context handler
│   └── searchFiles.ts               # searchFiles context handler
├── state/
│   └── fileSystemState.ts           # State management
├── util/
│   └── createIgnoreFilter.ts        # Ignore filter creation
├── test/
│   └── FileSystemService.commandValidation.test.ts
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
- `@tokenring-ai/scripting`: Scripting service
- `@tokenring-ai/web-host`: Web host services
- `ignore`: Git ignore pattern matching
- `path-browserify`: Path manipulation for browser
- `zod`: Schema validation
- `diff`: Diff generation for file operations
- `mime-types`: MIME type detection

## License

MIT License - see [LICENSE](./LICENSE) file for details.