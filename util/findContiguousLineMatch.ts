export type FuzzyLineMatchOptions = {
  minimumCharacters: number;
  similarity: number;
};

export type ContiguousLineMatch = {
  startLineIndex: number;
  endLineIndex: number;
  similarity: number;
  matchType: "exact" | "fuzzy";
};

export type FindContiguousLineMatchOptions = {
  normalizeLine?: (line: string) => string;
  fuzzyMatch?: FuzzyLineMatchOptions;
};

export type FindContiguousLineMatchResult = {
  match: ContiguousLineMatch | null;
  exactMatches: ContiguousLineMatch[];
  fuzzyMatches: ContiguousLineMatch[];
};

export function normalizeLineForWhitespaceInsensitiveMatch(line: string): string {
  return line.replace(/\s+/g, "");
}

export function calculateLevenshteinSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (left.length === 0 || right.length === 0) return 0;

  const previousRow = Array.from({ length: right.length + 1 }, (_value, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let previousDiagonal = previousRow[0];
    previousRow[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const current = previousRow[rightIndex];
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;

      previousRow[rightIndex] = Math.min(previousRow[rightIndex] + 1, previousRow[rightIndex - 1] + 1, previousDiagonal + substitutionCost);

      previousDiagonal = current;
    }
  }

  const distance = previousRow[right.length];
  return 1 - distance / Math.max(left.length, right.length);
}

function createMatch(startLineIndex: number, lineCount: number, similarity: number, matchType: ContiguousLineMatch["matchType"]): ContiguousLineMatch {
  return {
    startLineIndex,
    endLineIndex: startLineIndex + lineCount - 1,
    similarity,
    matchType,
  };
}

export default function findContiguousLineMatch(
  sourceLines: string[],
  targetLines: string[],
  { normalizeLine = normalizeLineForWhitespaceInsensitiveMatch, fuzzyMatch }: FindContiguousLineMatchOptions = {},
): FindContiguousLineMatchResult {
  if (targetLines.length === 0 || sourceLines.length < targetLines.length) {
    return {
      match: null,
      exactMatches: [],
      fuzzyMatches: [],
    };
  }

  const normalizedSourceLines = sourceLines.map(normalizeLine);
  const normalizedTargetLines = targetLines.map(normalizeLine);
  const exactMatches: ContiguousLineMatch[] = [];

  for (let startLineIndex = 0; startLineIndex <= normalizedSourceLines.length - normalizedTargetLines.length; startLineIndex++) {
    const isExactMatch = normalizedTargetLines.every((targetLine, offset) => normalizedSourceLines[startLineIndex + offset] === targetLine);

    if (isExactMatch) {
      exactMatches.push(createMatch(startLineIndex, targetLines.length, 1, "exact"));
    }
  }

  if (exactMatches.length === 1) {
    return {
      match: exactMatches[0],
      exactMatches,
      fuzzyMatches: [],
    };
  }

  if (exactMatches.length > 1) {
    return {
      match: null,
      exactMatches,
      fuzzyMatches: [],
    };
  }

  if (!fuzzyMatch) {
    return {
      match: null,
      exactMatches,
      fuzzyMatches: [],
    };
  }

  const normalizedCharacterCount = normalizedTargetLines.reduce((count, line) => count + line.length, 0);

  if (normalizedCharacterCount < fuzzyMatch.minimumCharacters) {
    return {
      match: null,
      exactMatches,
      fuzzyMatches: [],
    };
  }

  const normalizedTargetText = normalizedTargetLines.join("\n");
  const fuzzyMatches: ContiguousLineMatch[] = [];

  for (let startLineIndex = 0; startLineIndex <= normalizedSourceLines.length - normalizedTargetLines.length; startLineIndex++) {
    const candidateLines = normalizedSourceLines.slice(startLineIndex, startLineIndex + normalizedTargetLines.length);
    const similarity = calculateLevenshteinSimilarity(normalizedTargetText, candidateLines.join("\n"));

    if (similarity >= fuzzyMatch.similarity) {
      fuzzyMatches.push(createMatch(startLineIndex, targetLines.length, similarity, "fuzzy"));
    }
  }

  fuzzyMatches.sort((left, right) => {
    if (right.similarity !== left.similarity) {
      return right.similarity - left.similarity;
    }

    return left.startLineIndex - right.startLineIndex;
  });

  const hasUniqueBestMatch = fuzzyMatches.length === 1 || (fuzzyMatches.length > 1 && fuzzyMatches[0].similarity > fuzzyMatches[1].similarity);

  return {
    match: hasUniqueBestMatch ? fuzzyMatches[0] : null,
    exactMatches,
    fuzzyMatches,
  };
}
