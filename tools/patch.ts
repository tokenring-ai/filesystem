import Agent from "@tokenring-ai/agent/Agent";
import { z } from "zod";
import FileSystemService from "../FileSystemService.ts";

// Exported name for the tool
export const name = "file/patch";

export async function execute(
	{
		file,
		fromLine,
		toLine,
		contents,
	}: { file?: string; fromLine?: string; toLine?: string; contents?: string },
	agent: Agent,
): Promise<string> {
	const fileSystem = agent.requireServiceByType(FileSystemService);

	if (!file || !fromLine || !toLine || !contents) {
		throw new Error(
			`[${name}] Missing required parameters: file, fromLine, toLine, contents`,
		);
	}

	// Read the original file content
	const originalContent = await fileSystem.getFile(file);
	if (!originalContent) {
		throw new Error(`[${name}] Failed to read file content: ${file}`);
	}
	const lines = originalContent.split("\n");

	// Normalize whitespace for comparison
	const normalizeWhitespace = (line: string) => line.trim();
	const normalizedFromLine = normalizeWhitespace(fromLine);
	const normalizedToLine = normalizeWhitespace(toLine);

	// Find all matches for fromLine
	const fromLineMatches: number[] = [];
	lines.forEach((line, index) => {
		if (normalizeWhitespace(line) === normalizedFromLine) {
			fromLineMatches.push(index);
		}
	});

	// Ensure exactly one fromLine match
	if (fromLineMatches.length === 0) {
		throw new Error(
			`[${name}] Could not find the fromLine "${fromLine}" in file ${file}`,
		);
	}
	if (fromLineMatches.length > 1) {
		throw new Error(
			`[${name}] Found ${fromLineMatches.length} matches for fromLine "${fromLine}" in file ${file}. Expected exactly one match.`,
		);
	}

	const fromLineIndex = fromLineMatches[0];

	// Find toLine matches after the fromLine
	let toLineIndex = -1;
	let toLineMatches = 0;
	for (let i = fromLineIndex + 1; i < lines.length; i++) {
		if (normalizeWhitespace(lines[i]) === normalizedToLine) {
			toLineIndex = i;
			toLineMatches++;
		}
	}

	// Ensure exactly one toLine match after fromLine
	if (toLineMatches === 0) {
		throw new Error(
			`[${name}] Could not find the toLine "${toLine}" after fromLine "${fromLine}" in file ${file}`,
		);
	}
	if (toLineMatches > 1) {
		throw new Error(
			`[${name}] Found ${toLineMatches} matches for toLine "${toLine}" after fromLine "${fromLine}" in file ${file}. Expected exactly one match.`,
		);
	}

	// Replace the content between fromLine and toLine (inclusive)
	const beforeLines = lines.slice(0, fromLineIndex);
	const afterLines = lines.slice(toLineIndex + 1);
	const contentsLines = contents.split("\n");
	const patchedLines = [...beforeLines, ...contentsLines, ...afterLines];
	const patchedContent = patchedLines.join("\n");

	// Write the patched content back to the file
	await fileSystem.writeFile(file, patchedContent);

	agent.infoLine(`[${name}] Patched file: ${file}`);
	fileSystem.setDirty(true);

	return `Successfully patched file ${file} replacing content from line "${fromLine}" to line "${toLine}"`;
}

export const description =
	"Patches a file by replacing content between two specific lines that match exactly (ignoring whitespace).";

export const inputSchema = z.object({
	file: z
		.string()
		.describe("Path to the file to patch, relative to the source directory."),
	fromLine: z
		.string()
		.describe(
			"A line of text that must match exactly to mark the beginning of the content to replace.",
		),
	toLine: z
		.string()
		.describe(
			"A line of text that must match exactly to mark the end of the content to replace.",
		),
	contents: z
		.string()
		.describe(
			"The content that will replace everything from fromLine to toLine (inclusive).",
		),
});
