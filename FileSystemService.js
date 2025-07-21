import { Service } from "@token-ring/registry";
import ChatService from "@token-ring/chat/ChatService";
import ignore from "ignore";
/**
 * FileSystem is an abstract class that provides a unified interface
 * for file operations, allowing for different implementations of file systems.
 */
export default class FileSystemService extends Service {
	/**
	 * Changes the owner of a file.
	 * @abstract
	 * @param {string} path - Path to the file to change ownership for.
	 * @param {number} uid - User ID to set as owner.
	 * @param {number} gid - Group ID to set as owner.
	 * @returns {Promise<boolean>} A promise that resolves to true if the ownership was changed successfully.
	 * @throws Will throw an error if the ownership cannot be changed.
	 */
	async chown(path, uid, gid) {
		throw new Error("Method chown must be implemented by subclasses");
	}
	name = "FileSystem";
	description = "Abstract interface for virtual file system operations";

	/**
	 * Creates an instance of FileSystem
	 * @param {Object} options
	 * @param {string[]} [options.defaultSelectedFiles=[]] - Files manually selected by default.
	 * @throws Will throw an error if the base directory does not exist.
	 */
	constructor({ defaultSelectedFiles = [] }) {
		super();

		this.defaultSelectedFiles = defaultSelectedFiles;
		this.manuallySelectedFiles = new Set(defaultSelectedFiles);
	}
	dirty = false;

	/**
	 * Create an ignore filter for files
	 * @returns {(string) => boolean } A filter function that returns true for files to ignore
	 * @private
	 */
	async createIgnoreFilter() {
		// Create the base ignore filter
		const ig = ignore();
		ig.add(".git"); // always ignore .git dir at root
		ig.add("*.lock");
		ig.add("node_modules");
		ig.add(".*");

		const gitIgnorePath = ".gitignore";
		if (await this.exists(gitIgnorePath)) {
			const data = await this.getFile(gitIgnorePath);
			const lines = data.split(/\r?\n/).filter(Boolean);
			ig.add(lines);
		}

		const aiIgnorePath = ".aiignore";
		if (await this.exists(aiIgnorePath)) {
			const data = await this.getFile(aiIgnorePath);
			const lines = data.split(/\r?\n/).filter(Boolean);
			ig.add(lines);
		}

		return ig.ignores.bind(ig);
	}

	/**
	 * Starts the service by registering commands.
	 * @param {TokenRingRegistry} registry - The package registry
	 */
	async start(registry) {
		const chatContext = registry.requireFirstServiceByType(ChatService);
		chatContext.on("reset", this.clearFilesFromChat.bind(this));
	}

	/**
	 * Stops the service by unregistering commands.
	 * @param {TokenRingRegistry} registry - The package registry
	 */
	async stop(registry) {
		const chatContext = registry.requireFirstServiceByType(ChatService);
		chatContext.off("reset", this.clearFilesFromChat.bind(this));
	}

	/**
	 * Gets a directory tree, yielding files one by one.
	 * @abstract
	 * @async
	 * @generator
	 * @param {string} path - Relative path to get the directory tree for
	 * @param {object} params
	 * @param {(path: string) => boolean} [params.ig] - An ignore function to filter the tree on
	 * @param {boolean = false} [params.recursive]- Whether to recursively fetch the directory tree. Default: true
	 * @yields {string} Each file in the directory tree
	 * @throws Will throw an error if the directory cannot be read.
	 */
	// eslint-disable-next-line require-yield
	async *getDirectoryTree(path, params) {
		throw new Error(
			"Method 'getDirectoryTree' must be implemented by subclasses",
		);
	}

	/**
	 * Creates a new file with the specified content.
	 * @abstract
	 * @param {string} path - Path to the file to create.
	 * @param {string} content - Content to write to the file.
	 * @returns {Promise<boolean>} A promise that resolves to true if the file was created successfully.
	 * @throws Will throw an error if the file cannot be created.
	 */
	async writeFile(path, content) {
		throw new Error("Method 'writeFile' must be implemented by subclasses");
	}

	/**
	 * Deletes the specified file.
	 * @abstract
	 * @param {string} path - Path to the file to delete.
	 * @returns {Promise<boolean>} A promise that resolves to true if the file was deleted successfully.
	 * @throws Will throw an error if the file cannot be deleted.
	 */
	async deleteFile(path) {
		throw new Error("Method 'deleteFile' must be implemented by subclasses");
	}

	/**
	 * Gets the content of the specified file.
	 * @abstract
	 * @param {string} path - Path to the file to read.
	 * @returns {Promise<string>} A promise that resolves to the content of the file as a string.
	 * @throws Will throw an error if the file cannot be read.
	 */
	async getFile(path) {
		throw new Error("Method 'getFile' must be implemented by subclasses");
	}

	/**
	 * Renames a file or directory.
	 * @abstract
	 * @param {string} oldPath - Current path of the file or directory.
	 * @param {string} newPath - New path for the file or directory.
	 * @returns {Promise<boolean>} A promise that resolves to true if the file was renamed successfully.
	 * @throws Will throw an error if the file or directory cannot be renamed.
	 */
	async rename(oldPath, newPath) {
		throw new Error("Method 'rename' must be implemented by subclasses");
	}

	/**
	 * Checks if a file or directory exists.
	 * @abstract
	 * @param {string} path - Path to check.
	 * @returns {Promise<boolean>} A promise that resolves to true if the file or directory exists.
	 */
	async exists(path) {
		throw new Error("Method 'exists' must be implemented by subclasses");
	}

	/**
	 * Gets information about a file or directory.
	 * @abstract
	 * @param {string} path - Path to the file or directory.
	 * @returns {Promise<Object>} A promise that resolves to an object containing file or directory information.
	 * @throws Will throw an error if the file or directory information cannot be retrieved.
	 */
	async stat(path) {
		throw new Error("Method 'stat' must be implemented by subclasses");
	}

	/**
	 * Creates a directory at the specified path.
	 * @abstract
	 * @param {string} path - Path where the directory should be created.
	 * @param {Object} [options] - Options for creating the directory.
	 * @param {boolean} [options.recursive=false] - Whether to create parent directories if they don't exist.
	 * @returns {Promise<boolean>} A promise that resolves to true if the directory was created successfully.
	 * @throws Will throw an error if the directory cannot be created.
	 */
	async createDirectory(path, options = {}) {
		throw new Error(
			"Method 'createDirectory' must be implemented by subclasses",
		);
	}

	/**
	 * Copies a file or directory.
	 * @abstract
	 * @param {string} source - Source path.
	 * @param {string} destination - Destination path.
	 * @param {Object} [options] - Options for copying.
	 * @param {boolean} [options.overwrite=false] - Whether to overwrite the destination if it exists.
	 * @returns {Promise<boolean>} A promise that resolves to true if the copy was successful.
	 * @throws Will throw an error if the copy operation fails.
	 */
	async copy(source, destination, options = {}) {
		throw new Error("Method 'copy' must be implemented by subclasses");
	}

	/**
	 * Changes the permissions of a file.
	 * @abstract
	 * @param {string} path - Path to the file to change permissions for.
	 * @param {number} mode - The file mode (permissions) to set.
	 * @returns {Promise<boolean>} A promise that resolves to true if the permissions were changed successfully.
	 * @throws Will throw an error if the permissions cannot be changed.
	 */
	async chmod(path, mode) {
		throw new Error("Method 'chmod' must be implemented by subclasses");
	}

	/**
	 * Finds files matching a glob pattern.
	 * @abstract
	 * @param {string} pattern - The glob pattern to match.
	 * @param {Object} [options] - Options for glob matching.
	 * @param {(path: string) => boolean} [options.ig] - An ignore function to filter the tree on
	 * @returns {Promise<Array<string>>} A promise that resolves to an array of matched file paths.
	 * @throws Will throw an error if the glob operation fails.
	 */
	async glob(pattern, options = {}) {
		throw new Error("Method 'glob' must be implemented by subclasses");
	}

	/**
	 * Watches a directory for file changes
	 * @param {string} dir - The directory to watch.
	 * @param {Object} [options] - Watch options.
	 * @param {(path: string) => boolean} [options.ig] - An ignore function to filter the tree on
	 * @param {number} [options.pollInterval=1000] - Polling interval in milliseconds.
	 * @param {number} [options.stabilityThreshold=2000] - Stability threshold in milliseconds.
	 * @returns {Promise<import('chokidar').FSWatcher>} A promise that resolves to a chokidar FSWatcher instance
	 *   with methods like on('add', callback), on('change', callback), on('unlink', callback),
	 *   on('error', callback), on('ready', callback), and close().
	 * @throws Will throw an error if the directory cannot be watched.
	 */
	async watch(dir, options = {}) {
		throw new Error("Method 'watch' must be implemented by subclasses");
	}

	/**
	 * Executes a shell command in the file system.
	 * @abstract
	 * @param {string|string[]} command - The shell command to execute. Can be a string or array of [command, ...args].
	 * @param {Object} [options] - Options for executing the command.
	 * @param {number} [options.timeoutSeconds=60] - Timeout for the command in seconds.
	 * @param {Object} [options.env={}] - Environment variables for the command.
	 * @param {string} [options.workingDirectory] - Working directory for the command.
	 * @returns {Promise<{
	 *   ok: boolean,
	 *   stdout: string,
	 *   stderr: string,
	 *   exitCode: number
	 * }>} A promise that resolves to an object containing command execution results.
	 * @throws Will throw an error if the command cannot be executed.
	 */
	async executeCommand(command, options = {}) {
		throw new Error(
			"Method 'executeCommand' must be implemented by subclasses",
		);
	}

	/**
	 * Searches for a string pattern in files within the filesystem.
	 * @abstract
	 * @param {string} searchString - The string pattern to search for.
	 * @param {Object} [options] - Options for the grep operation.
	 * @param {Function} [options.ignoreFilter] - Function to filter ignored files.
	 * @param {Object} [options.includeContent] - Options for including content context.
	 * @param {number} [options.includeContent.linesBefore=0] - Number of lines to include before each match.
	 * @param {number} [options.includeContent.linesAfter=0] - Number of lines to include after each match.
	 * @returns {Promise<Array<{
	 *   file: string,
	 *   line: number,
	 *   match: string,
	 *   content: string | null
	 * }>>} A promise that resolves to an array of match objects.
	 * @throws Will throw an error if the search operation fails.
	 */
	async grep(searchString, options = {}) {
		throw new Error("Method 'grep' must be implemented by subclasses");
	}

	/**
	 * Sets the dirty flag.
	 * @param {boolean} dirty - The dirty state.
	 */
	setDirty(dirty) {
		this.dirty = dirty;
	}

	getDirty() {
		return this.dirty;
	}

	/**
	 * Adds a file to the chat selection.
	 * @param {string} file - The file to add.
	 * @throws Will throw an error if the file does not exist.
	 */
	async addFileToChat(file) {
		if (!(await this.exists(file))) {
			throw new Error(`Could not find file to add to chat: ${file}`);
		}
		this.manuallySelectedFiles.add(file);
	}

	/**
	 * Removes a file from the chat selection.
	 * @param {string} file - The file to remove.
	 * @throws Will throw an error if the file was never added.
	 */
	removeFileFromChat(file) {
		if (this.manuallySelectedFiles.has(file)) {
			this.manuallySelectedFiles.delete(file);
		} else {
			// Or console.warn or a less severe error if appropriate
			throw new Error(
				`File ${file} was not found in the chat context and could not be removed.`,
			);
		}
	}

	/**
	 * Clears file references from the chat when the chat is reset.
	 * This is a callback for the 'reset' event on ChatService.
	 * @private
	 */
	clearFilesFromChat() {
		this.manuallySelectedFiles.clear();
		// Implementation can be overridden by subclasses if needed
		console.log("Chat reset: clearing file references");
	}

	getFilesInChat() {
		return this.manuallySelectedFiles;
	}

	setFilesInChat(files) {
		this.manuallySelectedFiles.clear();
		for (const file of files) {
			this.manuallySelectedFiles.add(file);
		}
	}

	getDefaultFiles() {
		return this.defaultSelectedFiles;
	}

	/**
	 * Asynchronously yields memories from manually selected files.
	 * @async
	 * @generator
	 * @yields {MemoryItem} Memory object with role and content.
	 */
	async *getMemories(registry) {
		for (const file of this.manuallySelectedFiles) {
			const content = await this.getFile(file);
			yield {
				role: "user",
				content: `// ${file}\n${content}`,
			};
		}
	}
}
