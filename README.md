# @tokenring-ai/filesystem

This package, `@tokenring-ai/filesystem`, provides an abstract service definition for file system interactions and a
collection of tools and chat commands to operate on this abstraction. It forms a core part of the file system
capabilities within the Token Ring ecosystem.

**Important:** This package defines the *abstract* `FileSystemService`. Concrete implementations that provide actual
file system access (e.g., for local disk operations or remote SSH connections) are expected to be provided by **other
packages**, such as `@[tokenring-ai]/local-filesystem` or `@[tokenring-ai]/ssh-filesystem` (please replace these
placeholders with the actual package names if known, or refer to the project's overall architecture documentation).

## Core Components

### 1. `FileSystemService` (Abstract Base Class)

- **Location:** `core/filesystem/FileSystemService.js`
- **Description:** The heart of the package. It's an abstract class defining a standardized interface for file
  operations. Concrete implementations (from other packages) will extend this class.
- **Key Responsibilities (Interface Definition):**
- File operations: `readFile`, `writeFile`, `deleteFile`, `rename`, `exists`, `stat`, `createDirectory`, `copy`,
  `chmod`, `chown`.
- Directory operations: `glob`, `getDirectoryTree`.
- Execution: `executeCommand`, `grep`.
- Watching: `watch`.
- **Chat Context Management:** `FileSystemService` also includes built-in logic for managing a set of files relevant to
  the current chat session (see "Files in Chat Context" below).

### 2. Tools

Tools are specific, reusable functions designed to be called by AI agents or other services, operating on a registered
`FileSystemService` instance. They are exported via `core/filesystem/tools.js`.

**Available Tools:**

- **`file`** (from `tools/file.js`): Provides sub-operations for creating, reading, updating, deleting, and renaming
  files.
- Typically invoked as `file.create`, `file.read`, `file.update`, `file.delete`, `file.rename`.
- **`retrieveFiles`** (from `tools/search.js`): For fetching files by name/glob pattern or searching for content within
  files (using the underlying `FileSystemService.grep` or `glob` methods).
- **`filePatch`** (from `tools/filePatch.js`): Applies changes to files based on a provided patch format (e.g., diffs).
- **`runShellCommand`** (from `tools/runShellCommand.js`): Executes arbitrary shell commands using the
  `FileSystemService.executeCommand` method.

*(Note: Other tool files like `patchFilesNaturalLanguage.js` and `regexPatch.js` exist in the `tools/` directory but are
not currently exported by `tools.js` and thus not considered part of the direct public API of this package.)*

**Structure (Typical):**
Each tool module generally exports:

- `execute`: An `async` function performing the action.
- `description`: A brief explanation.
- `spec` or `parameters`: An object (often a Zod schema) defining expected arguments.

### 3. Files in Chat Context

The `FileSystemService` maintains a concept of files being "in context" for the current chat session. This allows for
easy reference and operation by users, tools, and AI agents.

- **Management:** Managed by a `Set` called `manuallySelectedFiles` within `FileSystemService`.
- **Key Methods on `FileSystemService`:**
- `addFileToChat(filePath)`
- `removeFileFromChat(filePath)`
- `getFilesInChat()`
- `clearFilesFromChat()` (also triggered by `ChatService` 'reset' event)
- `setFilesInChat(filesArray)`
- `getDefaultFiles()`
- `async* getMemories(registry)`: Yields content of files in context, formatted for LLM prompts.

### 4. Chat Commands

Chat commands provide a user-facing interface to interact with the `FileSystemService` via a chat client. They are
exported via `core/filesystem/chatCommands.js`.

**Available Commands:**

- **`file`** (from `commands/file.js`): Manages files in the chat session.
- **Sub-commands:**
- `/file select`: Interactive file selection to set the chat context.
- `/file add [files...]`: Adds specified file(s) to the chat context.
- `/file remove <files...>` (or `/file rm <files...>`): Removes specified file(s) from the chat context.
- `/file list` (or `/file ls`): Lists files currently in the chat context.
- `/file clear`: Clears all files from the chat context.
- `/file default`: Resets the chat context to a default set of files (if configured).
- **`foreach`** (from `commands/foreach.js`):
- `/foreach <glob_pattern> -- <prompt_or_command>`: Executes a given prompt or another command for each file matching
  the glob pattern, using the `FileSystemService.glob` method.

*(Note: The `/guidelines` command mentioned in a previous version of a README is not part of this package.)*

## Key `FileSystemService` Abstract Methods for Tool/Implementation Developers

When developing tools that use `FileSystemService` or when creating concrete implementations of it, these are some of
the core abstract methods you will interact with or implement:

- `async getFile(path)`
- `async writeFile(path, content)`
- `async exists(path)`
- `async deleteFile(path)`
- `async createDirectory(path, options)`
- `async rename(oldPath, newPath)`
- `async glob(pattern, options)`
- `async executeCommand(command, options)`
- `async grep(searchString, options)`
- `async stat(path)`
- `async chmod(path, mode)`
- `async chown(path, uid, gid)`
- `async* getDirectoryTree(path, params)`
- `async watch(dir, options)`
- `async copy(source, destination, options)`

Refer to the source code of `core/filesystem/FileSystemService.js` for the full signatures and JSDoc comments for these
methods. The `borrowFile` method is not part of the abstract `FileSystemService` interface.
