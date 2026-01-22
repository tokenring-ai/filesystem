# @tokenring-ai/filesystem Package Documentation

## Overview

The `@tokenring-ai/filesystem` package provides a filesystem abstraction service for Token Ring AI agents. It enables file operations including reading, writing, searching, and executing shell commands through a provider-based architecture. The package integrates with the agent system for chat-based file management and state tracking.

Key features:
- Unified API for file operations (read, write, delete, rename, copy, append)
- Ignore filters based on `.gitignore` and `.aiignore` patterns
- Tools for AI agent interactions: file read, file write, file append, file search, and shell execution
- Chat command `/file` for managing files in agent conversations
- Context handlers for providing file contents and search results to agents
- Command safety validation for shell commands
- Support for multiple filesystem providers with provider registry
- State management with file tracking and read-before-write enforcement
- JSON-RPC endpoints for remote filesystem access
- Scripting service integration with file manipulation functions

This package abstracts filesystem access, making it suitable for sandboxed or virtual environments in AI workflows, while providing safety mechanisms for shell commands.

## Installation/Setup

1. Install the package via npm:
   ```bash
   bun install @tokenring-ai/filesystem
   ```

2. Configure the filesystem plugin in your application config:
   ```typescript
   import filesystemPlugin from '@tokenring-ai/filesystem';

   const appConfig = {
     filesystem: {
       agentDefaults: {
         provider: 'local',
         selectedFiles: ['src/index.ts'],
         requireReadBeforeWrite: true,
       },
       providers: {
         local: { /* local filesystem provider config */ }
       },
       safeCommands: ['ls', 'cat', 'grep', 'git', 'npm', 'bun', 'node'],
       dangerousCommands: ['rm', 'chmod', 'chown', 'sudo']
     }
   };
   ```

3. Run tests:
   ```bash
   bun test
   ```

## Package Structure

```
pkg/filesystem/
├── index.ts                      # Main exports (FileMatchResource, FileSystemService)
├── plugin.ts                     # Plugin installation and service registration
├── FileSystemService.ts          # Core service implementation
├── FileSystemProvider.ts         # Provider interface definitions
├── FileMatchResource.ts          # Pattern-based file selection utility
├── schema.ts                     # Configuration schemas
├── chatCommands.ts               # Chat command exports
├── commands/
│   └── file.ts                   # /file command implementation
├── contextHandlers.ts            # Context handler exports
├── contextHandlers/
│   ├── selectedFiles.ts          # Selected files context provider
│   └── searchFiles.ts            # File search context provider
├── tools.ts                      # Tool exports
├── tools/
│   ├── read.ts                   # file_read tool
│   ├── write.ts                  # file_write tool
│   ├── append.ts                 # file_append tool
│   ├── search.ts                 # file_search tool
│   └── bash.ts                   # terminal_bash tool
├── rpc/
│   ├── schema.ts                 # RPC method definitions
│   └── filesystem.ts             # RPC endpoint implementation
├── state/
│   └── fileSystemState.ts        # State management
├── util/
│   └── createIgnoreFilter.ts     # Ignore filter creation utility
├── test/
│   └── FileSystemService.commandValidation.test.ts
├── package.json
├── vitest.config.ts
└── README.md
```

## Core Components

### FileSystemService

The main service class implementing `TokenRingService`. It manages filesystem providers, state (selected files for chat), and delegates operations.

**Key Properties/Methods:**

- `registerFileSystemProvider(provider: FileSystemProvider)`: Registers a provider
- `requireFileSystemProviderByName(name: string)`: Retrieves a registered provider by name
- `setActiveFileSystem(providerName: string, agent: Agent)`: Sets the active provider
- `attach(agent: Agent)`: Initializes state with FileSystemState
- `getDirectoryTree(path, options, agent)`: Async generator for directory contents
- `writeFile(path, content, agent)`: Writes/overwrites file
- `appendFile(path, content, agent)`: Appends to file
- `deleteFile(path, agent)`: Deletes a file
- `readTextFile(path, agent)`: Reads file as UTF-8 string
- `readFile(path, agent)`: Raw file read
- `exists(path, agent)`: Checks if file exists
- `stat(path, agent)`: Returns file stat information
- `rename(oldPath, newPath, agent)`: Renames a file
- `createDirectory(path, options, agent)`: Creates a directory
- `copy(source, dest, options, agent)`: Copies a file
- `glob(pattern, options, agent)`: Returns matches for glob pattern
- `watch(dir, options, agent)`: Watch for changes
- `executeCommand(command, options, agent)`: Executes shell command
- `getCommandSafetyLevel(command)`: Returns 'safe', 'unknown', or 'dangerous'
- `parseCompoundCommand(command)`: Parses compound shell commands
- `grep(searchString, options, agent)`: Searches for text patterns

**Chat-specific methods:**
- `addFileToChat(file, agent)`: Adds file to chat context
- `removeFileFromChat(file, agent)`: Removes file from chat context
- `getFilesInChat(agent)`: Returns set of files in chat
- `setFilesInChat(files, agent)`: Sets files in chat
- `askForFileSelection(options, agent)`: Interactive tree-based file selection
- `setDirty(dirty, agent) / isDirty(agent)`: Tracks modifications

### FileSystemProvider

Abstract interface for filesystem implementations.

**Key Methods:**
- `getDirectoryTree(path, options)`: Async generator for directory traversal
- `writeFile(path, content)`: Write file
- `appendFile(path, content)`: Append to file
- `deleteFile(path)`: Delete file
- `readFile(path, encoding)`: Read file
- `rename(oldPath, newPath)`: Rename file
- `exists(path)`: Check existence
- `stat(path)`: Get file stats
- `createDirectory(path, options)`: Create directory
- `copy(source, dest, options)`: Copy file
- `glob(pattern, options)`: Glob pattern matching
- `watch(dir, options)`: Watch for changes
- `executeCommand(command, options)`: Execute shell command
- `grep(searchString, options)`: Text search

### FileMatchResource

Utility for pattern-based file selection.

**Constructor:**
```typescript
constructor({items: MatchItem[]})
```

**MatchItem interface:**
```typescript
interface MatchItem {
  path: string;
  include?: RegExp;
  exclude?: RegExp;
}
```

**Key Methods:**
- `getMatchedFiles(agent)`: Async generator yielding matching paths
- `addFilesToSet(set, agent)`: Populates a Set with matches

## Tools

Exported via `tools.ts` for AI agent use.

### file_read

Retrieves files from the filesystem by path or glob pattern.

**Parameters:**
- `files`: List of file paths or glob patterns (required)

**Behavior:**
- Resolves glob patterns to specific file paths
- Checks file existence for each path
- Reads file contents (up to maxFileSize limit)
- Marks read files in `FileSystemState`
- Returns file names only if too many files are matched
- Handles binary files gracefully

**Example:**
```typescript
// Read specific file
const result = await file_read({
  files: ['src/main.ts']
});

// Get list of files matching a pattern
const result = await file_read({
  files: ['src/**/*.ts']
});
```

### file_write

Writes a file to the filesystem.

**Parameters:**
- `path`: Relative path of the file to write (required)
- `content`: Content to write to the file (required)

**Behavior:**
- Automatically creates parent directories if needed
- Enforces read-before-write policy if configured
- Marks filesystem as dirty on success
- Returns diff if file existed before
- Marks file as read in state

**Example:**
```typescript
await file_write({path: 'src/main.ts', content: '...'}, agent);
```

### file_append

Appends content to the end of an existing file.

**Parameters:**
- `path`: Relative path of the file to append to (required)
- `content`: Content to append to the file (required)

**Behavior:**
- Automatically creates parent directories if needed
- Ensures newline separator before appending
- Enforces read-before-write policy if configured
- Marks filesystem as dirty on success
- Returns diff if file existed before
- Marks file as read in state

**Example:**
```typescript
await file_append({path: 'logs/app.log', content: 'New entry\n'}, agent);
```

### file_search

Searches for text patterns within files.

**Parameters:**
- `searches`: List of search patterns for text search (required)
- `files`: Optional list of file paths or glob patterns to search within (default: ['**/*'])

**Behavior:**
- Supports substring, regex, and exact matching
- Returns grep-style snippets with context lines
- Automatically decides whether to return full file contents, snippets, or file names based on match count
- Marks read files in state
- Supports fuzzy matching and keyword extraction

**Examples:**
```typescript
// Search for a function across all files
const result = await file_search({
  searches: ['function execute'],
  files: ['src/**/*.ts']
});

// Regex search for pattern
const result = await file_search({
  searches: ['/class \\w+Service/'],
  files: ['pkg/agent/**/*.ts']
});

// Search with specific files
const result = await file_search({
  searches: ['TODO', 'FIXME'],
  files: ['src/**/*.ts', 'pkg/**/*.ts']
});
```

### terminal_bash

Executes shell commands with safety validation.

**Parameters:**
- `command`: The shell command to execute (required)
- `timeoutSeconds`: Timeout in seconds (default: 60, max: 90)
- `workingDirectory`: Working directory relative to filesystem root

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

**Safe Commands:**
```typescript
["awk", "cat", "cd", "chdir", "diff", "echo", "find", "git", "grep", "head", "help", "hostname", "id", "ipconfig", "tee", "ls", "netstat", "ps", "pwd", "sort", "tail", "tree", "type", "uname", "uniq", "wc", "which", "touch", "mkdir", "npm", "yarn", "bun", "tsc", "node", "npx", "bunx", "vitest"]
```

**Dangerous Commands:**
Commands matching patterns like `rm -rf`, `chmod -R`, `sudo`, `format`, `shutdown`, etc.

## Chat Commands

### /file

Manage files in the chat session.

**Actions:**
- `select`: Open interactive file selector
- `add [files...]`: Add specific files to chat
- `remove [files...]` or `rm [files...]`: Remove specific files from chat
- `list` or `ls`: List current files in chat
- `clear`: Remove all files from chat
- `default`: Reset to config defaults

**Usage Examples:**
```
/file select                    # Interactive file selection
/file add src/main.ts           # Add a specific file
/file add src/*.ts              # Add all TypeScript files
/file add file1.txt file2.txt   # Add multiple files
/file remove src/main.ts        # Remove a specific file
/file rm old-file.js            # Remove using alias
/file list                      # Show current files
/file ls                        # Show current files (alias)
/file clear                     # Remove all files
/file default                   # Reset to config defaults
```

## Context Handlers

### selectedFiles

Provides contents of selected files as chat context.

**Behavior:**
- Yields file contents for files in the chat context
- For directories, provides directory listings
- Marks files as read in state
- Output format:
  - For files: `BEGIN FILE ATTACHMENT: {path}\n{content}\nEND FILE ATTACHMENT: {path}`
  - For directories: `BEGIN DIRECTORY LISTING:\n{path}\n- {file}\n...\nEND DIRECTORY LISTING`

### searchFiles

Provides file search results as chat context based on user input.

**Behavior:**
- Extracts keywords from chat input (ignores stop words)
- Performs fuzzy matching on file paths
- Optionally searches file contents for high-value keywords
- Returns formatted results with match types (filename/content/both)

## Configuration

### FileSystemConfigSchema

```typescript
const FileSystemConfigSchema = z.object({
  agentDefaults: z.object({
    provider: z.string(),
    selectedFiles: z.array(z.string()).default([]),
    fileWrite: z.object({
      requireReadBeforeWrite: z.boolean().default(true),
      maxReturnedDiffSize: z.number().default(1024)
    }).optional(),
    fileRead: z.object({
      maxFileReadCount: z.number().default(10),
      maxFileSize: z.number().default(128 * 1024) // 128KB default
    }).optional(),
    fileSearch: z.object({
      maxSnippetCount: z.number().default(10),
      maxSnippetSizePercent: z.number().default(0.3),
      snippetLinesBefore: z.number().default(5),
      snippetLinesAfter: z.number().default(5)
    }).optional()
  }),
  providers: z.record(z.string(), z.any()),
  safeCommands: z.array(z.string()).default([...]),
  dangerousCommands: z.array(z.string()).default([...])
});
```

**agentDefaults:**
- `provider`: Name of the default filesystem provider
- `selectedFiles`: Array of file paths initially selected for chat
- `fileWrite.requireReadBeforeWrite`: Whether files must be read before writing (default: true)
- `fileWrite.maxReturnedDiffSize`: Maximum size of diff to return (default: 1024)
- `fileRead.maxFileReadCount`: Maximum number of files to read (default: 10)
- `fileRead.maxFileSize`: Maximum file size in bytes to read (default: 30KB)
- `fileSearch.maxSnippetCount`: Maximum number of files to return snippets for (default: 10)
- `fileSearch.maxSnippetSizePercent`: Max percentage of file content to return if too many matches (default: 30%)
- `fileSearch.snippetLinesBefore`: Context lines before matches (default: 5)
- `fileSearch.snippetLinesAfter`: Context lines after matches (default: 5)

**safeCommands:**
List of commands considered safe to execute without confirmation.

**dangerousCommands:**
List of regex patterns for commands that require explicit confirmation.

### Package Config Schema

```typescript
const packageConfigSchema = z.object({
  filesystem: FileSystemConfigSchema.optional(),
});
```

## State Management

### FileSystemState

Tracks filesystem-related state for agents.

**Properties:**
- `selectedFiles`: Set of file paths in chat context
- `providerName`: Active filesystem provider name
- `dirty`: Whether files have been modified
- `readFiles`: Set of files that have been read
- `fileRead`: Read configuration (maxFileReadCount, maxFileSize)
- `fileWrite`: Write configuration (requireReadBeforeWrite, maxReturnedDiffSize)
- `fileSearch`: Search configuration (maxSnippetCount, maxSnippetSizePercent, snippetLinesBefore, snippetLinesAfter)

**Methods:**
- `reset(what)`: Resets state (supports 'chat' reset)
- `serialize()`: Returns serializable state object
- `deserialize(data)`: Restores state from object
- `show()`: Returns human-readable state summary

## RPC Endpoints

JSON-RPC endpoints available at `/rpc/filesystem`:

| Method | Type | Input | Output |
|--------|------|-------|--------|
| readTextFile | query | {agentId, path} | {content} |
| exists | query | {agentId, path} | {exists} |
| stat | query | {agentId, path} | {stats} |
| glob | query | {agentId, pattern} | {files} |
| listDirectory | query | {agentId, path, showHidden, recursive} | {files} |
| writeFile | mutation | {agentId, path, content} | {success} |
| appendFile | mutation | {agentId, path, content} | {success} |
| deleteFile | mutation | {agentId, path} | {success} |
| rename | mutation | {agentId, oldPath, newPath} | {success} |
| createDirectory | mutation | {agentId, path, recursive} | {success} |
| copy | mutation | {agentId, source, destination, overwrite} | {success} |
| addFileToChat | mutation | {agentId, file} | {success} |
| removeFileFromChat | mutation | {agentId, file} | {success} |
| getSelectedFiles | query | {agentId} | {files} |

## Scripting Service Integration

The filesystem plugin registers native functions in the scripting service:

### createFile

Creates a new file.

```typescript
scriptingService.registerFunction("createFile", {
  type: 'native',
  params: ['path', 'content'],
  async execute(this: ScriptingThis, path: string, content: string): Promise<string> {
    await this.agent.requireServiceByType(FileSystemService).writeFile(path, content, this.agent);
    return `Created file: ${path}`;
  }
});
```

### deleteFile

Deletes a file.

```typescript
scriptingService.registerFunction("deleteFile", {
  type: 'native',
  params: ['path'],
  async execute(this: ScriptingThis, path: string): Promise<string> {
    await this.agent.requireServiceByType(FileSystemService).deleteFile(path, this.agent);
    return `Deleted file: ${path}`;
  }
});
```

### globFiles

Returns files matching a glob pattern.

```typescript
scriptingService.registerFunction("globFiles", {
  type: 'native',
  params: ['pattern'],
  async execute(this: ScriptingThis, pattern: string): Promise<string[]> {
    return await this.agent.requireServiceByType(FileSystemService).glob(pattern, {}, this.agent);
  }
});
```

### searchFiles

Searches for text in files and returns formatted results.

```typescript
scriptingService.registerFunction("searchFiles", {
  type: 'native',
  params: ['searchString'],
  async execute(this: ScriptingThis, searchString: string): Promise<string[]> {
    const results = await this.agent.requireServiceByType(FileSystemService).grep([searchString], {}, this.agent);
    return results.map(r => `${r.file}:${r.line}: ${r.match}`);
  }
});
```

## Usage Examples

### Basic File Operations

```typescript
import FileSystemService from '@tokenring-ai/filesystem/FileSystemService';

const fs = new FileSystemService({
  agentDefaults: {
    provider: 'local',
    selectedFiles: [],
    requireReadBeforeWrite: true,
  },
  safeCommands: ['ls', 'cat', 'grep', 'git', 'npm', 'bun', 'node'],
  dangerousCommands: ['rm', 'chmod', 'chown', 'sudo'],
  providers: {
    local: { /* local provider config */ }
  }
});

// Write a file
await fs.writeFile('example.txt', 'Hello, world!', agent);

// Append to a file
await fs.appendFile('example.txt', '\nAdditional content', agent);

// Read a file
const content = await fs.readTextFile('example.txt', agent);

// Read raw file
const buffer = await fs.readFile('example.txt', agent);
```

### Directory Traversal

```typescript
// Get directory tree
for await (const path of fs.getDirectoryTree('./src', {recursive: true}, agent)) {
  console.log(path);
}

// Find files with glob pattern
const tsFiles = await fs.glob('**/*.ts', {}, agent);

// List directory
const files = await fs.glob('src/', {includeDirectories: true}, agent);
```

### Chat File Management

```typescript
// Add file to chat context
await fs.addFileToChat('src/main.ts', agent);

// Get all files in chat
const files = fs.getFilesInChat(agent);

// Remove file from chat
fs.removeFileFromChat('src/main.ts', agent);

// Interactive file selection
const selected = await fs.askForFileSelection({allowDirectories: true}, agent);
```

### File Search

```typescript
// Search for text in files
const results = await fs.grep(['TODO', 'FIXME'], {
  includeContent: {linesBefore: 2, linesAfter: 2}
}, agent);

// Glob pattern matching
const configs = await fs.glob('**/*.config.{js,json,ts}', {}, agent);

// Watch for changes
const watcher = await fs.watch('src/', {pollInterval: 1000}, agent);
```

### Shell Command Execution

```typescript
const result = await fs.executeCommand(
  ['npm', 'install'],
  {timeoutSeconds: 120, workingDirectory: './frontend'},
  agent
);

if (result.ok) {
  console.log('Install completed:', result.stdout);
} else {
  console.error('Install failed:', result.stderr);
}

// Check command safety
const safety = fs.getCommandSafetyLevel('rm -rf /');
console.log(safety); // 'dangerous'
```

### Advanced Usage

```typescript
// Parse compound commands
const commands = fs.parseCompoundCommand('cd frontend/chat && bun add lucide-react');
console.log(commands); // ['cd', 'bun']

// Get file stats
const stats = await fs.stat('src/main.ts', agent);
console.log(stats.isFile, stats.size, stats.modified);

// Copy files
await fs.copy('src/old', 'src/new', {overwrite: false}, agent);

// Create directory
await fs.createDirectory('src/utils', {recursive: true}, agent);

// Delete file
await fs.deleteFile('src/old.js', agent);

// Rename file
await fs.rename('src/old.js', 'src/new.js', agent);
```

## License

MIT License - see [LICENSE](./LICENSE) file for details.
