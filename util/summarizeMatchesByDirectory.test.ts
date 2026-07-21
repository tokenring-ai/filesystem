import { describe, expect, it } from "bun:test";
import { buildDirectorySummaryResponse, formatDirectoryMatchSummary, summarizeMatchesByDirectory } from "./summarizeMatchesByDirectory.ts";

describe("summarizeMatchesByDirectory", () => {
  it("groups files by directory truncated to depth", () => {
    const counts = summarizeMatchesByDirectory(["pkg/filesystem/tools/grep.ts", "pkg/filesystem/tools/search.ts", "pkg/agent/index.ts", "README.md"], 2);

    expect(Object.fromEntries(counts)).toEqual({
      "pkg/filesystem": 2,
      "pkg/agent": 1,
      ".": 1,
    });
  });

  it("uses depth 1 as the minimum effective depth", () => {
    const counts = summarizeMatchesByDirectory(["a/b/c/d.ts", "a/b/e.ts"], 0);
    expect(Object.fromEntries(counts)).toEqual({
      a: 2,
    });
  });
});

describe("formatDirectoryMatchSummary", () => {
  it("formats sorted bullet lines with pluralization", () => {
    const text = formatDirectoryMatchSummary(["z/one.ts", "a/two.ts", "a/three.ts"], 1);
    expect(text).toBe("- a: 2 files\n- z: 1 file");
  });
});

describe("buildDirectorySummaryResponse", () => {
  it("includes operation label, limits, and directory summary block", () => {
    const response = buildDirectorySummaryResponse({
      operationLabel: "grep operation",
      matchCount: 3,
      maxMatchedFiles: 2,
      summaryDepth: 1,
      filePaths: ["src/a.ts", "src/b.ts", "lib/c.ts"],
    });

    expect(response).toContain("The grep operation matched 3 files");
    expect(response).toContain("configured limit of 2");
    expect(response).toContain("depth 1");
    expect(response).toContain("BEGIN DIRECTORY SUMMARY");
    expect(response).toContain("- lib: 1 file");
    expect(response).toContain("- src: 2 files");
    expect(response).toContain("END DIRECTORY SUMMARY");
  });
});
