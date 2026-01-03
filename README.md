# @tokenring-ai/filesystem Package Documentation

## Overview

The `@tokenring-ai/filesystem` package provides a filesystem abstraction service for Token Ring AI agents. It enables file operations including reading, writing, searching, and executing shell commands through a provider-based architecture. The package integrates with the agent system for chat-based file management and state tracking.

Key features:
- Unified API for file operations (read, write, delete, rename, copy)
- Ignore filters based on `.gitignore` and `.aiignore` patterns
- Tools for AI agent interactions: file read, file write, file search, and shell execution
- Chat command `/file` for managing files in agent conversations
- Context handlers for providing file contents and search results to agents
- Command safety validation for shell commands
- Support for multiple filesystem providers with provider registry
- State management with file tracking and read-before-write enforcement
- JSON-RPC endpoints for remote filesystem access

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
├── index.ts                      # Main exports and config schemas
├── plugin.ts                     # Plugin installation and service registration
├── FileSystemService.ts          # Core service implementation
├── FileSystemProvider.ts         # Provider interface definitions
├── FileMatchResource.ts          # Pattern-based file selection utility
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
│   ├── search.ts                 # file_search tool
│   └── bash.ts                   # terminal_bash tool
├── rpc/
│   ├── schema.ts                 # RPC method definitions
│   └── filesystem.ts             # RPC endpoint implementation
├── state/
│   └── fileSystemState.ts        # State management
├── test/
│   ├── createTestFilesystem.ts   # Test helper
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
- `setActiveFileSystem(providerName: string, agent: Agent)`: Sets the active provider
- `attach(agent: Agent)`: Initializes state with FileSystemState
- `getDirectoryTree(path, options, agent)`: Async generator for directory contents
- `writeFile(path, content, agent)`: Writes/overwrites file
- `appendFile(path, content, agent)`: Appends to file
- `deleteFile(path, agent)`: Deletes a file
- `getFile(path, agent)`: Reads file as UTF-8 string
- `readFile(path, encoding, agent)`: Raw file read
- `exists(path, agent)`: Checks if file exists
- `stat(path, agent)`: Returns file stat information
- `rename(oldPath, newPath, agent)`: Renames a file
- `createDirectory(path, options, agent)`: Creates a directory
- `copy(source, dest, options, agent)`: Copies a file
- `glob(pattern, options, agent)`: Returns matches for glob pattern
- `grep(searchString, options, agent)`: Searches for text patterns
- `executeCommand(command, options, agent)`: Executes shell command
- `getCommandSafetyLevel(command)`: Returns 'safe', 'unknown', or 'dangerous'
- `parseCompoundCommand(command)`: Parses compound shell commands

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
- `returnType`: 'names' | 'content' (default: 'content')

**Returns:**
```typescript
{
  files: Array<{
    file: string;
    exists: boolean;
    content?: string;
  }>,
  summary: {
    totalFiles: number,
    totalMatches: 0,
    returnType: 'names' | 'content',
    limitExceeded: boolean
  }
}
```

**Behavior:**
- Resolves glob patterns to specific file paths
- Checks file existence for each path
- For `returnType: 'content'`:
  - Reads file contents
  - Limits to 50 files (degrades to "names" if exceeded)
  - Tracks read files in `FileSystemState`
- For `returnType: 'names'`:
  - Returns only file paths with existence status

**Example:**
```typescript
// Read specific file
const result = await file_read({
  files: ['src/main.ts'],
  returnType: 'content'
});

// Get list of files matching a pattern
const result = await file_read({
  files: ['src/**/*.ts'],
  returnType: 'names'
});
```

### file_write

Writes a file to the filesystem.

**Parameters:**
- `path`: Relative path of the file to write (e.g., 'src/main.ts')
- `content`: Content to write to the file (must include ENTIRE content)

**Behavior:**
- Automatically creates parent directories if needed
- Enforces read-before-write policy if configured
- Marks filesystem as dirty on success

**Example:**
```typescript
await file_write({path: 'src/main.ts', content: '...'}, agent);
```

### file_search

Searches for text patterns within files.

**Parameters:**
- `searches`: List of search patterns for text search (required)
- `files`: Optional list of file paths or glob patterns to search within
- `returnType`: 'names' | 'matches' (default: 'matches')
- `linesBefore`: Context lines before each match (default: 10 for matches mode)
- `linesAfter`: Context lines after each match (default: 10 for matches mode)
- `caseSensitive`: Whether searches are case-sensitive (default: true)
- `matchType`: 'substring' | 'whole-word' | 'regex' (default: 'substring')

**Returns:**
```typescript
{
  files: Array<{
    file: string;
    matches?: number;
  }>,
  matches: Array<{
    file: string;
    line: number;
    match: string;
    linesBefore: string[];
    linesAfter: string[];
  }>,
  summary: {
    totalFiles: number,
    totalMatches: number,
    returnType: 'names' | 'matches',
    limitExceeded: boolean
  }
}
```

**Behavior:**
- If `files` provided: searches only within specified files
- If no `files` provided: searches across all accessible files
- Supports substring, whole-word, and regex matching
- For `returnType: 'matches'`:
  - Returns matched lines with context
  - Includes `linesBefore` and `linesAfter` context
  - Limits to 50 matches (degrades to "names" if exceeded)
- For `returnType: 'names'`:
  - Returns only file paths with match counts

**Examples:**
```typescript
// Search for a function across all files
const result = await file_search({
  searches: ['function execute'],
  returnType: 'matches',
  linesBefore: 2,
  linesAfter: 2
});

// Search with whole-word matching in specific directory
const result = await file_search({
  searches: ['ToolDefinition'],
  files: ['pkg/filesystem/**/*.ts'],
  matchType: 'whole-word',
  caseSensitive: false
});

// Regex search for pattern
const result = await file_search({
  searches: ['class \\w+Service'],
  matchType: 'regex',
  files: ['pkg/agent/**/*.ts']
});

// Get only file names containing matches
const result = await file_search({
  searches: ['TODO', 'FIXME'],
  returnType: 'names'
});
```

### terminal_bash

Executes shell commands with safety validation.

**Parameters:**
- `command`: The shell command to execute
- `timeoutSeconds`: Timeout in seconds (default: 60, max: 600)
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
["awk", "cat", "cd", "chdir", "diff", "echo", "find", "git", "grep",
 "head", "help", "hostname", "id", "ipconfig", "tee", "ls", "netstat",
 "ps", "pwd", "sort", "tail", "tree", "type", "uname", "uniq", "wc", "which",
 "npm", "yarn", "bun", "tsc", "node", "npx", "bunx", "vitest"]
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

**Parameters:**
- `maxResults`: Maximum number of results (default: 25)

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
    requireReadBeforeWrite: z.boolean().default(true)
  }),
  providers: z.record(z.string(), z.any()),
  safeCommands: z.array(z.string()).default([...]),
  dangerousCommands: z.array(z.string()).default([...])
});
```

**agentDefaults:**
- `provider`: Name of the default filesystem provider
- `selectedFiles`: Array of file paths initially selected for chat
- `requireReadBeforeWrite`: Whether files must be read before writing (default: true)

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
- `requireReadBeforeWrite`: Enforces read-before-write policy
- `readFiles`: Set of files that have been read

**Methods:**
- `reset(what)`: Resets state (supports 'chat' reset)
- `serialize()`: Returns serializable state object
- `deserialize(data)`: Restores state from object
- `show()`: Returns human-readable state summary

## RPC Endpoints

JSON-RPC endpoints available at `/rpc/filesystem`:

| Method | Type | Input | Output |
|--------|------|-------|--------|
| readFile | query | {agentId, path} | {content} |
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

// Read a file
const content = await fs.getFile('example.txt', agent);

// Append to a file
await fs.appendFile('example.txt', '\nAdditional content', agent);
```

### Directory Traversal

```typescript
// Get directory tree
for await (const path of fs.getDirectoryTree('./src', {recursive: true}, agent)) {
  console.log(path);
}

// Find files with glob pattern
const tsFiles = await fs.glob('**/*.ts', {}, agent);
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
```

## License

MIT License - see [LICENSE](./LICENSE) file for details.
