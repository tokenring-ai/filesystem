# Filesystem Package Documentation

## Overview

The `@tokenring-ai/filesystem` package provides an abstract filesystem interface designed for integration with AI agents in the Token Ring framework. It enables virtual filesystem operations such as reading/writing files, directory traversal, globbing, searching, and executing shell commands. The package supports multiple filesystem providers (e.g., local FS) and integrates seamlessly with the `@tokenring-ai/agent` for agent-state management, including file selection for chat sessions and memory injection.

Key features:
- Unified API for file operations (create, read, update, delete, rename, permissions).
- Ignore filters based on `.gitignore` and `.aiignore`.
- Tools for AI-driven interactions: file modification, patching, searching, and shell execution.
- Chat commands for managing files in agent conversations (e.g., `/file add`, `/foreach`).
- Async generators for directory trees and memories from selected files.
- Dirty flag for tracking changes.

This package abstracts filesystem access, making it suitable for sandboxed or virtual environments in AI workflows, while warning about non-sandboxed shell commands.

## Installation/Setup

1. Install the package via npm:
   ```
   npm install @tokenring-ai/filesystem
   ```

2. Ensure dependencies are met (see [Dependencies](#dependencies) below). The package uses ES modules (`type: "module"`).

3. In your Token Ring agent setup, register the `FileSystemService`:
   ```typescript
   import { FileSystemService } from '@tokenring-ai/filesystem';
   import Agent from '@tokenring-ai/agent';

   const fsService = new FileSystemService({ defaultSelectedFiles: ['src/index.ts'] });
   agent.addService(fsService);
   await fsService.attach(agent);
   ```

4. Configure default files or providers as needed. For local FS, implement a `FileSystemProvider` subclass (see [Core Components](#core-components)).

5. Run tests:
   ```
   npm test
   ```

## Package Structure

The package is organized as follows:
- **Root files**:
  - `index.ts`: Main entry point, exports `FileSystemService` and `FileMatchResource`.
  - `FileSystemService.ts`: Core service class implementing `TokenRingService`.
  - `FileSystemProvider.ts`: Abstract base for filesystem implementations.
  - `package.json`: Package metadata, scripts (e.g., `npm test` for Vitest).
  - `tsconfig.json`: TypeScript configuration.
  - `vitest.config.js`: Test configuration.
  - `README.md`: This documentation.
  - `LICENSE`: MIT license.
- **tools/**: AI tool implementations (exported via `tools.ts`):
  - `modify.ts`: File write/append/delete/rename/adjust (permissions).
  - `search.ts`: File retrieval and full-text search (globs, substrings/regex).
  - `patch.ts`: Line-based patching.
  - `runShellCommand.ts`: Execute shell commands (with timeout).
- **commands/**: Chat commands (exported via `chatCommands.ts`):
  - `file.ts`: Manage chat files (`/file add/remove/list/clear`).
  - `foreach.ts`: Run prompts on glob-matched files.
- **test/**: Unit/integration tests (e.g., `runShellCommand.test.js`).
- Other: `FileMatchResource.ts` for pattern-based file matching.

## Core Components

### FileSystemService

The main service class, implementing `TokenRingService`. It manages filesystem providers, state (e.g., selected files for chat), and delegates operations.

- **Key Properties/Methods**:
  - `registerFileSystemProvider(provider: FileSystemProvider)`: Registers a provider (uses `KeyedRegistryWithSingleSelection`).
  - `getActiveFileSystemProviderName()`: Gets the current provider name.
  - `attach(agent: Agent)`: Initializes state with `FileSystemState` (tracks `selectedFiles: Set<string>`).
  - `getDirectoryTree(path: string, options?: DirectoryTreeOptions)`: Async generator for directory contents (ignores via filter).
    - Options: `{ ignoreFilter: (p: string) => boolean, recursive?: boolean }`.
  - `writeFile(path: string, content: string | Buffer)`: Writes/overwrites file (returns `boolean` success).
  - `appendFile(path: string, content: string | Buffer)`: Appends to file.
  - `deleteFile(path: string)`, `rename(oldPath: string, newPath: string)`, `copy(source: string, dest: string, {overwrite?: boolean})`: Standard ops (return `boolean`).
  - `getFile(path: string)`: Reads as UTF-8 string (or `null` if missing).
  - `readFile(path: string, encoding?: 'utf8' | 'buffer')`: Raw read.
  - `exists(path: string)`, `stat(path: string)`: Returns `boolean` or `StatLike` (e.g., `{ isFile: boolean, size?: number }`).
  - `createDirectory(path: string, {recursive?: boolean})`: Creates dir.
  - `chmod(path: string, mode: number)`: Sets permissions.
  - `glob(pattern: string, {ignoreFilter, absolute?: boolean})`: Returns `string[]` matches.
  - `grep(searchString: string | string[], {ignoreFilter, includeContent?: {linesBefore/After}})`: Returns `GrepResult[]` (e.g., `{file, line, match}`).
  - `executeCommand(command: string | string[], {timeoutSeconds, env, workingDirectory})`: Returns `ExecuteCommandResult` (e.g., `{ok: boolean, stdout, stderr, exitCode}`).
  - `watch(dir: string, {ignoreFilter, pollInterval})`: Watches for changes (returns watcher).
  - Chat-specific: `addFileToChat(file: string, agent)`, `getFilesInChat(agent)`, `setFilesInChat(files: Iterable<string>, agent)`, `getMemories(agent)`: Yields file contents as agent memories.
  - `askForFileSelection({initialSelection?}, agent)`: Interactive tree-based selection via agent UI.
  - `setDirty(dirty: boolean)` / `getDirty()`: Tracks modifications.

Interactions: Delegates to active `FileSystemProvider`. Auto-creates ignore filters from `.gitignore`/`.aiignore`. State persists across agent resets.

### FileSystemProvider

Abstract base class for concrete implementations (e.g., local FS, virtual FS).

- **Key Abstract Methods**: All ops mirror `FileSystemService` (e.g., `abstract writeFile(...)`).
- Subclasses must implement `getBaseDirectory()`, path conversions (`relativeOrAbsolutePathToAbsolutePath`), and all file ops.
- `getFile(path)`: Convenience wrapper for `readFile(path, 'utf8')`.

### Tools

Exported via `tools.ts` for AI agent use (e.g., in `@tokenring-ai/agent`).

- **file/modify**:
  - Actions: `write` (full content, optional base64), `append`, `delete`, `rename` (to `toPath`), `adjust` (permissions as octal string, e.g., '644').
  - Params: `{path, action, content?, is_base64?, fail_if_exists?, permissions?, toPath?, check_exists?}`.
  - Example: Write a file – returns success message.
  - Auto-creates dirs, sets default 0o644 perms for new files.

- **file/search**:
  - Retrieves files by paths/globs or searches text (substring/whole-word/regex).
  - Modes: `names` (paths), `content` (full text, limit 50), `matches` (lines with context).
  - Params: `{files?, searches?, returnType='content', linesBefore/After?, caseSensitive=true, matchType='substring'}`.
  - Returns: `{files: [{file, exists, content}], matches: [...], summary: {...}}`.
  - Skips binaries/.gitignore; OR-based searches.

- **file/patch**:
  - Replaces content between exact line matches (ignores whitespace).
  - Params: `{file, fromLine, toLine, contents}`.
  - Ensures single match; overwrites file.

- **terminal/runShellCommand**:
  - Executes shell cmd (string or array).
  - Params: `{command, timeoutSeconds=60, workingDirectory?}`.
  - Returns `ExecuteCommandResult`; not sandboxed – use cautiously.
  - Marks dirty on success.

### Chat Commands

Exported via `chatCommands.ts` for agent chat (e.g., `/file ...`).

- **/file**: Manage chat files.
  - `select`: Interactive tree selection.
  - `add/remove [files...]`: Add/remove specific files (or interactive).
  - `list`: Show current files.
  - `clear`: Remove all.
  - `default`: Reset to config defaults.
  - Validates existence; updates agent state.

- **/foreach <glob> <prompt ...>**: Runs AI prompt on each matching file (uses `runChat` with file retrieval/modify instructions). Restores checkpoint per file.

### Global Scripting Functions

When `@tokenring-ai/scripting` is available, the filesystem package registers native functions for use in scripts:

- **createFile(path, content)**: Creates a file with the specified content.
  ```bash
  /var $result = createFile("output.txt", "Hello World")
  /call createFile("data.json", '{"key": "value"}')
  ```

- **deleteFile(path)**: Deletes a file at the specified path.
  ```bash
  /var $result = deleteFile("temp.txt")
  /call deleteFile("old-file.log")
  ```

- **globFiles(pattern)**: Returns an array of files matching a glob pattern.
  ```bash
  /var $tsFiles = globFiles("src/**/*.ts")
  /var $allDocs = globFiles("docs/**/*.md")
  ```

- **searchFiles(searchString)**: Searches for text across files and returns matches in format `file:line: match`.
  ```bash
  /var $todos = searchFiles("TODO")
  /var $errors = searchFiles("ERROR")
  ```

These functions integrate seamlessly with the scripting system's variables, loops, and control flow:

```bash
# Find and process all TypeScript files
/var $files = globFiles("src/**/*.ts")
/list @tsFiles = $files
/for $file in @tsFiles {
  /echo Processing $file
}

# Search for TODOs and create a report
/var $todos = searchFiles("TODO")
/call createFile("todo-report.txt", $todos)
```

### FileMatchResource

Utility for pattern-based file selection.

- Constructor: `{items: MatchItem[]}` where `MatchItem = {path: string, include?: RegExp, exclude?: RegExp}`.
- `getMatchedFiles(agent)`: Async generator yields matching paths via directory tree.
- `addFilesToSet(set: Set<string>, agent)`: Populates set with matches.

## Usage Examples

1. **Basic File Operations**:
   ```typescript
   const fs = new FileSystemService();
   await fs.writeFile('example.txt', 'Hello, world!');
   const content = await fs.getFile('example.txt'); // 'Hello, world!'
   console.log(content);
   ```

2. **Directory Traversal and Glob**:
   ```typescript
   for await (const path of fs.getDirectoryTree('./src', {recursive: true})) {
     console.log(path);
   }
   const tsFiles = await fs.glob('**/*.ts'); // ['src/index.ts', ...]
   ```

3. **Agent Integration – Add File to Chat and Get Memories**:
   ```typescript
   await fs.addFileToChat('src/main.ts', agent);
   for await (const memory of fs.getMemories(agent)) {
     console.log(memory.content); // '// src/main.ts\n<content>'
   }
   ```

4. **Using Tools in Agent (e.g., via AI prompt)**:
   - AI can call `file/modify` to write: `{path: 'new.js', action: 'write', content: 'console.log("Hi");'}`.

5. **Shell Command**:
   ```typescript
   const result = await fs.executeCommand('ls -la', {workingDirectory: './src'});
   if (result.ok) console.log(result.stdout);
   ```

## Configuration Options

- **Constructor**: `FileSystemService({defaultSelectedFiles?: string[]})` – Initial chat files.
- **Ignore Filters**: Auto-loads `.gitignore` (ignores `.git`, `node_modules`, etc.) and `.aiignore`. Custom via `ignoreFilter` in options.
- **Providers**: Register multiple via `registerFileSystemProvider`; active one via `setActiveFileSystemProviderName(name)`.
- **Permissions**: Octal strings (e.g., '644'); defaults to 0o644 for new files.
- **Search**: Case-sensitive by default; limits (50) for content/matches to prevent overload.
- **Shell**: `timeoutSeconds` (default 60, max 600); `env` and `workingDirectory` (relative to root).
- **Scripting Integration**: Automatically registers global functions when `@tokenring-ai/scripting` is available.
- **Environment**: No specific vars; relies on agent config for root dir.

## API Reference

- **FileSystemService Methods**: See [Core Components](#core-components) for signatures.
- **Tool Schemas** (Zod-validated inputs):
  - `file/modify`: `z.object({path: z.string(), action: z.enum(['write', ...]), ...})`.
  - `file/search`: `z.object({files?: z.array(z.string()), searches?: z.array(z.string()), ...})`.
  - `file/patch`: `z.object({file: z.string(), fromLine: z.string(), toLine: z.string(), contents: z.string()})`.
  - `terminal/runShellCommand`: `z.object({command: z.string(), timeoutSeconds?: z.number(), workingDirectory?: z.string()})`.
- **Interfaces**:
  - `StatLike`: `{path: string, isFile: boolean, ...}`.
  - `GrepResult`: `{file: string, line: number, match: string, ...}`.
  - `ExecuteCommandResult`: `{ok: boolean, stdout: string, ...}`.

Public exports: `FileSystemService`, `FileMatchResource`, tools/commands via index.

## Dependencies

- `@tokenring-ai/ai-client`: 0.1.0 (for `runChat` in commands).
- `@tokenring-ai/agent`: 0.1.0 (core agent integration).
- `@tokenring-ai/iterables`: 0.1.0 (iterable providers for glob, files, lines).
- `@tokenring-ai/scripting`: 0.1.0 (optional, for global scripting functions).
- `ignore`: ^7.0.5 (gitignore parsing).
- `path-browserify`: ^1.0.1 (path utils).
- Dev: `vitest` (^3.2.4), `@vitest/coverage-v8`.

## Contributing/Notes

- **Testing**: Run `npm test` (unit), `npm run test:integration` (shell cmds), `npm run test:all` (full suite). Uses Vitest; covers core ops and tools.
- **Building**: TypeScript compiles to ESM; no build step needed beyond `tsc`.
- **Limitations**:
  - Shell commands (`terminal/runShellCommand`) are not sandboxed – potential security risk.
  - Searches skip binaries and ignored files; limits degrade to 'names' mode if >50 results.
  - Path handling assumes Unix-style `/`; relative to virtual root.
  - No multi-provider switching in tools yet (uses active provider).
- **Contributing**: Fork, add tests, PR to main. Focus on new providers, tools, or agent integrations.
- **License**: MIT (see LICENSE).

For issues or extensions, reference the Token Ring AI framework docs.