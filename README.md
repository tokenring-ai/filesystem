# @tokenring-ai/filesystem Package Documentation

## Overview

The `@tokenring-ai/filesystem` package provides an abstract filesystem interface designed for integration with AI agents in the Token Ring framework. It enables virtual filesystem operations such as reading/writing files, directory traversal, globbing, searching, and executing shell commands. The package supports multiple filesystem providers (e.g., local FS) and integrates seamlessly with the `@tokenring-ai/agent` for agent-state management, including file selection for chat sessions and memory injection.

Key features:
- Unified API for file operations (create, read, update, delete, rename, permissions)
- Ignore filters based on `.gitignore` and `.aiignore`
- Tools for AI-driven interactions: file modification, patching, searching, and shell execution
- Chat commands for managing files in agent conversations (e.g., `/file add`, `/foreach`)
- Async generators for directory trees and memories from selected files
- Dirty flag for tracking changes
- Command safety validation for shell commands
- Support for multiple filesystem providers with provider registry

This package abstracts filesystem access, making it suitable for sandboxed or virtual environments in AI workflows, while providing safety mechanisms for shell commands.

## Installation/Setup

1. Install the package via npm:
   ```bash
   bun install @tokenring-ai/filesystem
   ```

2. Ensure dependencies are met (see [Dependencies](#dependencies) below). The package uses ES modules (`type: "module"`).

3. In your Token Ring agent setup, register the `FileSystemService`:
   ```typescript
   import { FileSystemService } from '@tokenring-ai/filesystem';
   import Agent from '@tokenring-ai/agent';

   const fsService = new FileSystemService({
     defaultSelectedFiles: ['src/index.ts'],
     safeCommands: ['ls', 'cat', 'grep', 'git', 'npm', 'bun', 'node'],
     dangerousCommands: ['rm', 'chmod', 'chown', 'sudo']
   });
   agent.addService(fsService);
   await fsService.attach(agent);
   ```

4. Configure default files or providers as needed. For local FS, implement a `FileSystemProvider` subclass (see [Core Components](#core-components)).

5. Run tests:
   ```bash
   bun test
   ```

## Package Structure

The package is organized as follows:

- **Root files**:
  - `index.ts`: Main entry point, exports `FileSystemService` and `FileMatchResource`
  - `FileSystemService.ts`: Core service class implementing `TokenRingService`
  - `FileSystemProvider.ts`: Abstract base for filesystem implementations
  - `package.json`: Package metadata, scripts (e.g., `bun test` for Vitest)
  - `tsconfig.json`: TypeScript configuration
  - `vitest.config.js`: Test configuration
  - `README.md`: This documentation
  - `LICENSE`: MIT license
- **tools/**: AI tool implementations (exported via `tools.ts`):
  - `write.ts`: File write operations
  - `search.ts`: File retrieval and full-text search (globs, substrings/regex)
  - `runShellCommand.ts`: Execute shell commands (with timeout and safety validation)
- **commands/**: Chat commands (exported via `chatCommands.ts`):
  - `file.ts`: Manage chat files (`/file add/remove/list/clear`)
- **contextHandlers/**: Context provider handlers:
  - `selectedFiles.ts`: Provides selected files as chat context
  - `searchFiles.ts`: Provides file search results as chat context with fuzzy matching
- **rpc/**: JSON-RPC endpoints for remote filesystem access:
  - `schema.ts`: RPC method definitions
  - `filesystem.ts`: RPC endpoint implementation
- **state/**: State management:
  - `fileSystemState.ts`: Tracks selected files across agent sessions
- **test/**: Unit/integration tests:
  - `createTestFilesystem.ts`: Test filesystem factory
  - `FileSystemService.commandValidation.test.ts`: Command safety validation tests
- Other: `FileMatchResource.ts` for pattern-based file selection

## Core Components

### FileSystemService

The main service class, implementing `TokenRingService`. It manages filesystem providers, state (e.g., selected files for chat), and delegates operations.

- **Key Properties/Methods**:
  - `registerFileSystemProvider(provider: FileSystemProvider)`: Registers a provider (uses `KeyedRegistryWithSingleSelection`)
  - `getActiveFileSystemProviderName()`: Gets the current provider name
  - `attach(agent: Agent)`: Initializes state with `FileSystemState` (tracks `selectedFiles: Set<string>`)
  - `getDirectoryTree(path: string, options?: DirectoryTreeOptions)`: Async generator for directory contents (ignores via filter)
  - `writeFile(path: string, content: string | Buffer)`: Writes/overwrites file (returns `boolean` success)
  - `appendFile(path: string, content: string | Buffer)`: Appends to file
  - `deleteFile(path: string)`, `rename(oldPath: string, newPath: string)`, `copy(source: string, dest: string, {overwrite?: boolean})`: Standard ops (return `boolean`)
  - `getFile(path: string)`: Reads as UTF-8 string (or `null` if missing)
  - `readFile(path: string, encoding?: 'utf8' | 'buffer')`: Raw read
  - `exists(path: string)`, `stat(path: string)`: Returns `boolean` or `StatLike` (e.g., `{ isFile: boolean, size?: number }`)
  - `createDirectory(path: string, {recursive?: boolean})`: Creates dir
  - `chmod(path: string, mode: number)`: Sets permissions
  - `glob(pattern: string, {ignoreFilter, absolute?: boolean})`: Returns `string[]` matches
  - `grep(searchString: string | string[], {ignoreFilter, includeContent?: {linesBefore/After}})`: Returns `GrepResult[]` (e.g., `{file, line, match}`)
  - `executeCommand(command: string | string[], {timeoutSeconds, env, workingDirectory})`: Returns `ExecuteCommandResult` (e.g., `{ok: boolean, stdout, stderr, exitCode}`)
  - `watch(dir: string, {ignoreFilter, pollInterval})`: Watches for changes (returns watcher)
  - Chat-specific: `addFileToChat(file: string, agent)`, `getFilesInChat(agent)`, `setFilesInChat(files: Iterable<string>, agent)`, `getMemories(agent)`: Yields file contents as agent memories
  - `askForFileSelection({initialSelection?, allowDirectories?}, agent)`: Interactive tree-based selection via agent UI
  - `setDirty(dirty: boolean)` / `getDirty()`: Tracks modifications
  - `getCommandSafetyLevel(command: string)`: Validates command safety level (`safe`, `unknown`, `dangerous`)
  - `parseCompoundCommand(command: string)`: Parses compound commands (handles `&&`, `||`, `;`, `|` separators)

Interactions: Delegates to active `FileSystemProvider`. Auto-creates ignore filters from `.gitignore`/`.aiignore`. State persists across agent resets.

### FileSystemProvider

Abstract base class for concrete implementations (e.g., local FS, virtual FS).

- **Key Abstract Methods**: All ops mirror `FileSystemService` (e.g., `abstract writeFile(...)`)
- Subclasses must implement `getBaseDirectory()`, path conversions (`relativeOrAbsolutePathToAbsolutePath`), and all file ops
- `getFile(path)`: Convenience wrapper for `readFile(path, 'utf8')`

### Tools

Exported via `tools.ts` for AI agent use (e.g., in `@tokenring-ai/agent`).

- **file/write**:
  - Actions: `write` (full content, optional base64), `append`, `delete`, `rename` (to `toPath`), `adjust` (permissions as octal string, e.g., '644')
  - Params: `{path, action, content?, is_base64?, fail_if_exists?, permissions?, toPath?, check_exists?}`
  - Example: Write a file – returns success message
  - Auto-creates dirs, sets default 0o644 perms for new files

- **file/search**:
  - Retrieves files by paths/globs or searches text (substring/whole-word/regex)
  - Modes: `names` (paths), `content` (full text, limit 50), `matches` (lines with context)
  - Params: `{files?, searches?, returnType='content', linesBefore/After?, caseSensitive=true, matchType='substring'}`
  - Returns: `{files: [{file, exists, content}], matches: [...], summary: {...}}`
  - Skips binaries/.gitignore; OR-based searches
  - Supports glob patterns and regex matching

- **terminal/runShellCommand**:
  - Executes shell cmd (string or array)
  - Params: `{command, timeoutSeconds=60, workingDirectory?}`
  - Returns `ExecuteCommandResult`; validates command safety
  - Marks dirty on success
  - Safety validation: `safe`, `unknown`, or `dangerous` commands with user confirmation for dangerous commands
  - Timeout limited to 90 seconds

### Chat Commands

Exported via `chatCommands.ts` for agent chat (e.g., `/file ...`).

- **/file**: Manage chat files
  - `select`: Interactive tree selection
  - `add/remove [files...]`: Add/remove specific files (or interactive)
  - `list` / `ls`: Show current files
  - `clear`: Remove all
  - `default`: Reset to config defaults
  - Validates existence; updates agent state

- **/foreach <glob> <prompt ...>**: Runs AI prompt on each matching file (uses `runChat` with file retrieval/modify instructions). Restores checkpoint per file.

### Context Handlers

- **selectedFiles**: Provides contents of selected files as chat context
- **searchFiles**: Provides file search results for keywords as chat context with fuzzy matching and keyword extraction

### FileMatchResource

Utility for pattern-based file selection.

- Constructor: `{items: MatchItem[]}` where `MatchItem = {path: string, include?: RegExp, exclude?: RegExp}`
- `getMatchedFiles(agent)`: Async generator yields matching paths via directory tree
- `addFilesToSet(set: Set<string>, agent)`: Populates set with matches

### RPC Endpoints

JSON-RPC endpoints for remote filesystem access:

- `readFile`, `exists`, `stat`, `glob`, `listDirectory`, `writeFile`, `appendFile`, `deleteFile`, `rename`, `createDirectory`, `copy`, `addFileToChat`, `removeFileFromChat`, `getSelectedFiles`

## Usage Examples

### Basic File Operations

```typescript
const fs = new FileSystemService();
await fs.writeFile('example.txt', 'Hello, world!');
const content = await fs.getFile('example.txt'); // 'Hello, world!'
console.log(content);
```

### Directory Traversal and Glob

```typescript
for await (const path of fs.getDirectoryTree('./src', {recursive: true})) {
  console.log(path);
}
const tsFiles = await fs.glob('**/*.ts'); // ['src/index.ts', ...]
```

### Agent Integration – Add File to Chat and Get Memories

```typescript
await fs.addFileToChat('src/main.ts', agent);
for await (const memory of fs.getMemories(agent)) {
  console.log(memory.content); // '// src/main.ts\n<content>'
}
```

### Using Tools in Agent (e.g., via AI prompt)

```typescript
// AI can call file/write to write
const writeResult = await agent.useTool({
  name: 'file/write',
  params: {
    path: 'new.js',
    action: 'write',
    content: 'console.log("Hi");'
  }
});

// AI can call terminal/runShellCommand with safety validation
const shellResult = await agent.useTool({
  name: 'terminal/runShellCommand',
  params: {
    command: 'ls -la',
    workingDirectory: './src'
  }
});
```

### Chat Commands

```typescript
// Interactive file selection
await agent.handleCommand('/file select');

// Add specific files to chat
await agent.handleCommand('/file add src/main.ts');

// List current chat files
await agent.handleCommand('/file list');

// Clear all chat files
await agent.handleCommand('/file clear');
```

### Search Files Context Handler

```typescript
// The context handler automatically extracts keywords and searches files
// When the user asks about a specific file or functionality, it provides relevant files
```

## Configuration Options

- **Constructor**: `FileSystemService({defaultSelectedFiles?: string[], dangerousCommands?, safeCommands?})` – Initial chat files and command safety rules
- **Ignore Filters**: Auto-loads `.gitignore` (ignores `.git`, `node_modules`, etc.) and `.aiignore`. Custom via `ignoreFilter` in options
- **Providers**: Register multiple via `registerFileSystemProvider`; active one via `setActiveFileSystemProviderName(name)`
- **Permissions**: Octal strings (e.g., '644'); defaults to 0o644 for new files
- **Search**: Case-sensitive by default; limits (50) for content/matches to prevent overload
- **Shell**: `timeoutSeconds` (default 60, max 90); `env` and `workingDirectory` (relative to root)
- **Scripting Integration**: Automatically registers global functions when `@tokenring-ai/scripting` is available
- **Environment**: No specific vars; relies on agent config for root dir

## API Reference

- **FileSystemService Methods**: See [Core Components](#core-components) for signatures
- **Tool Schemas** (Zod-validated inputs):
  - `file/write`: `z.object({path: z.string(), action: z.enum(['write', 'append', 'delete', 'rename', 'adjust']), content: z.string().optional(), is_base64?: z.boolean().optional(), fail_if_exists?: z.boolean().optional(), permissions?: z.string().optional(), toPath?: z.string().optional(), check_exists?: z.boolean().optional()})`
  - `file/search`: `z.object({files?: z.array(z.string()), searches?: z.array(z.string()), returnType: z.enum(['names', 'content', 'matches']).default('content'), linesBefore: z.number().int().min(0).optional(), linesAfter: z.number().int().min(0).optional(), caseSensitive: z.boolean().default(true), matchType: z.enum(['substring', 'whole-word', 'regex']).default('substring')})`
  - `terminal/runShellCommand`: `z.object({command: z.string(), timeoutSeconds?: z.number().int().optional(), workingDirectory?: z.string().optional()})`
- **Interfaces**:
  - `StatLike`: `{path: string, absolutePath?: string, isFile: boolean, isDirectory: boolean, isSymbolicLink?: boolean, size?: number, created?: Date, modified?: Date, accessed?: Date}`
  - `GrepResult`: `{file: string, line: number, match: string, matchedString?: string, content: string | null}`
  - `ExecuteCommandResult`: `{ok: boolean, stdout: string, stderr: string, exitCode: number, error?: string}`
  - `FileSearchResult`: `{files: FileInfo[], matches: MatchInfo[], summary: SearchSummary}`
- **RPC Schema**: See [rpc/schema.ts](#rpc-endpoints) for detailed method definitions

Public exports: `FileSystemService`, `FileMatchResource`, tools/commands via index.

## Dependencies

- `@tokenring-ai/ai-client`: 0.2.0 (for `runChat` in commands)
- `@tokenring-ai/agent`: 0.2.0 (core agent integration)
- `@tokenring-ai/app`: 0.2.0 (TokenRingService and Agent management)
- `@tokenring-ai/scripting`: 0.2.0 (optional, for global scripting functions)
- `@tokenring-ai/chat`: 0.2.0 (chat and command types)
- `@tokenring-ai/web-host`: 0.2.0 (JSON-RPC endpoints)
- `@tokenring-ai/utility`: 0.2.0 (registry utilities)
- `zod`: catalog: (for validation schemas)
- `ignore`: ^7.0.5 (gitignore parsing)
- `path-browserify`: ^1.0.1 (path utils)
- Dev: `vitest` (^4.0.15), `@vitest/coverage-v8`

## Contributing/Notes

- **Testing**: Run `bun test` (unit), `bun run test:integration` (shell cmds), `bun run test:all` (full suite). Uses Vitest; covers core ops and tools.
- **Building**: TypeScript compiles to ESM; no build step needed beyond `tsc`.
- **Limitations**:
  - Shell commands (`terminal/runShellCommand`) are not sandboxed – potential security risk.
  - Searches skip binaries and ignored files; limits degrade to 'names' mode if >50 results.
  - Path handling assumes Unix-style `/`; relative to virtual root.
  - No multi-provider switching in tools yet (uses active provider).
- **Contributing**: Fork, add tests, PR to main. Focus on new providers, tools, or agent integrations.
- **License**: MIT (see LICENSE).

For issues or extensions, reference the Token Ring AI framework docs.