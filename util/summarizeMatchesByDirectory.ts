/**
 * Groups matched file paths by directory, truncated to `depth` path segments.
 * e.g. depth 2: "pkg/filesystem/tools/grep.ts" → "pkg/filesystem"
 */
export function summarizeMatchesByDirectory(filePaths: string[], depth: number): Map<string, number> {
  const counts = new Map<string, number>();
  const effectiveDepth = Math.max(1, depth);

  for (const filePath of filePaths) {
    const parts = filePath.split("/").filter(Boolean);
    const dirParts = parts.slice(0, -1); // drop filename
    const key = dirParts.length === 0 ? "." : dirParts.slice(0, effectiveDepth).join("/");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

/**
 * Formats directory match counts as a sorted bullet list.
 * e.g. "- pkg/filesystem: 12 files"
 */
export function formatDirectoryMatchSummary(filePaths: string[], depth: number): string {
  const directoryCounts = summarizeMatchesByDirectory(filePaths, depth);
  return Array.from(directoryCounts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, count]) => `- ${dir}: ${count} file${count === 1 ? "" : "s"}`)
    .join("\n");
}

/**
 * Builds the full tool response used when a search/grep exceeds maxMatchedFiles.
 */
export function buildDirectorySummaryResponse(params: {
  operationLabel: string;
  matchCount: number;
  maxMatchedFiles: number;
  summaryDepth: number;
  filePaths: string[];
}): string {
  const summaryLines = formatDirectoryMatchSummary(params.filePaths, params.summaryDepth);

  return `
The ${params.operationLabel} matched ${params.matchCount} files, which is higher than the configured limit of ${params.maxMatchedFiles}.
Matches are summarized by directory (depth ${params.summaryDepth}) with the number of matched files per directory.

BEGIN DIRECTORY SUMMARY
${summaryLines}
END DIRECTORY SUMMARY
`.trim();
}
