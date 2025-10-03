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
	timeoutSeconds?: number;
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

/**
 * FileSystemProvider is an interface that provides a unified interface
 * for file operations, allowing for different implementations of file systems.
 */
export default interface FileSystemProvider {
	// Base directory getter for implementations that are rooted (e.g., local FS)
	getBaseDirectory(): string;

	// Path helpers for implementations that map relative/absolute paths
	relativeOrAbsolutePathToAbsolutePath(p: string): string;

	relativeOrAbsolutePathToRelativePath(p: string): string;

	// Directory walking
	getDirectoryTree(
		path: string,
		params?: DirectoryTreeOptions,
	): AsyncGenerator<string>;

	// file ops
	writeFile(path: string, content: string | Buffer): Promise<boolean>;

	appendFile(filePath: string, finalContent: string | Buffer): Promise<boolean>;

	deleteFile(path: string): Promise<boolean>;

	readFile(path: string, encoding?: BufferEncoding | "buffer"): Promise<any>;

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

	chmod(path: string, mode: number): Promise<boolean>;

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
