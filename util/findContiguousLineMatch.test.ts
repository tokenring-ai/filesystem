import {describe, expect, it} from "vitest";
import findContiguousLineMatch from "./findContiguousLineMatch.ts";

describe("findContiguousLineMatch", () => {
  it("finds an exact contiguous line match while ignoring whitespace", () => {
    const result = findContiguousLineMatch(
      [
        "function example() {",
        "  const answer = 42;",
        "}",
      ],
      [
        "function   example(){",
        "const answer=42;",
        "}",
      ],
    );

    expect(result.match).toEqual({
      startLineIndex: 0,
      endLineIndex: 2,
      similarity: 1,
      matchType: "exact",
    });
  });

  it("falls back to fuzzy matching when the exact block is not present", () => {
    const result = findContiguousLineMatch(
      [
        'const message = "The quick brown fox jumps over the lazy dog";',
      ],
      [
        'const message = "The quick brown fox jumps over the lazy dox";',
      ],
      {
        fuzzyMatch: {
          minimumCharacters: 15,
          similarity: 0.98,
        },
      },
    );

    expect(result.match?.matchType).toBe("fuzzy");
    expect(result.match?.startLineIndex).toBe(0);
    expect(result.match?.similarity).toBeGreaterThanOrEqual(0.98);
  });

  it("skips fuzzy matching when the requested content is shorter than the minimum threshold", () => {
    const result = findContiguousLineMatch(
      ["const x = 1;"],
      ["const x = 2;"],
      {
        fuzzyMatch: {
          minimumCharacters: 15,
          similarity: 0.98,
        },
      },
    );

    expect(result.match).toBeNull();
    expect(result.fuzzyMatches).toHaveLength(0);
  });

  it("returns all exact matches without choosing one when the match is ambiguous", () => {
    const result = findContiguousLineMatch(
      ["alpha", "beta", "alpha", "beta"],
      ["alpha", "beta"],
    );

    expect(result.match).toBeNull();
    expect(result.exactMatches).toHaveLength(2);
    expect(result.exactMatches.map((match) => match.startLineIndex)).toEqual([0, 2]);
  });
});
