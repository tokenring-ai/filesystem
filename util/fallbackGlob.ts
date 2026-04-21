import path from "node:path";
import type { FileSystemProvider, GlobOptions } from "../FileSystemProvider.js";

type GlobCapableProvider = Pick<FileSystemProvider, "getDirectoryTree" | "stat">;

type GlobCandidate = {
  path: string;
  isDirectory: boolean;
};

function normalizeGlobPath(inputPath: string, { stripTrailingSeparator = false }: { stripTrailingSeparator?: boolean | undefined } = {}): string {
  const normalized = inputPath.replaceAll("\\", "/").replace(/\/+/g, "/");
  if (!stripTrailingSeparator) return normalized;
  if (normalized === "/") return normalized;
  return normalized.replace(/\/+$/, "");
}

function hasGlobMagic(pattern: string): boolean {
  let escaped = false;
  let inCharacterClass = false;

  for (const char of pattern) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "[") {
      inCharacterClass = true;
      return true;
    }

    if (char === "]") {
      inCharacterClass = false;
      continue;
    }

    if (!inCharacterClass && (char === "*" || char === "?" || char === "{")) {
      return true;
    }
  }

  return false;
}

function findFirstMagicIndex(pattern: string): number {
  let escaped = false;
  let inCharacterClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "[") {
      return i;
    }

    if (char === "]") {
      inCharacterClass = false;
      continue;
    }

    if (inCharacterClass) continue;

    if (char === "*" || char === "?" || char === "{") {
      return i;
    }
  }

  return -1;
}

function splitBraceAlternatives(body: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let escaped = false;

  for (const char of body) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }

    if (char === "{") {
      depth++;
      current += char;
      continue;
    }

    if (char === "}") {
      depth--;
      current += char;
      continue;
    }

    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  parts.push(current);
  return parts;
}

function expandBraces(pattern: string): string[] {
  let escaped = false;
  let start = -1;
  let depth = 0;

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "{") {
      if (start === -1) start = i;
      depth++;
      continue;
    }

    if (char === "}" && start !== -1) {
      depth--;
      if (depth === 0) {
        const before = pattern.slice(0, start);
        const after = pattern.slice(i + 1);
        const body = pattern.slice(start + 1, i);
        return splitBraceAlternatives(body).flatMap(part => expandBraces(`${before}${part}${after}`));
      }
    }
  }

  return [pattern];
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function convertSegmentToRegex(segment: string): string {
  let result = "";

  for (let i = 0; i < segment.length; i++) {
    const char = segment[i];

    if (char === "\\") {
      if (i + 1 < segment.length) {
        result += escapeRegexLiteral(segment[i + 1]);
        i++;
      } else {
        result += "\\\\";
      }
      continue;
    }

    if (char === "*") {
      result += "[^/]*";
      continue;
    }

    if (char === "?") {
      result += "[^/]";
      continue;
    }

    if (char === "[") {
      let end = i + 1;
      if (segment[end] === "!" || segment[end] === "^") end++;
      if (segment[end] === "]") end++;

      while (end < segment.length && segment[end] !== "]") {
        end++;
      }

      if (end >= segment.length) {
        result += "\\[";
        continue;
      }

      let content = segment.slice(i + 1, end);
      if (content.startsWith("!")) {
        content = `^${content.slice(1)}`;
      } else if (content.startsWith("^")) {
        content = `\\${content}`;
      }

      result += `[${content}]`;
      i = end;
      continue;
    }

    result += escapeRegexLiteral(char);
  }

  return result;
}

function globPatternToRegExp(pattern: string): RegExp {
  const normalizedPattern = normalizeGlobPath(pattern, {
    stripTrailingSeparator: true,
  });
  const isAbsolute = normalizedPattern.startsWith("/");
  const segments = normalizedPattern.split("/").filter((segment, index) => !(segment === "" && index === 0));

  if (segments.length === 0) {
    return /^\/?$/;
  }

  const buildRegex = (index: number): string => {
    const segment = segments[index];
    if (!segment) return "";
    if (segment === "**") {
      if (index === segments.length - 1) {
        return ".*";
      }
      return `(?:[^/]+/)*${buildRegex(index + 1)}`;
    }

    if (index === segments.length - 1) {
      return convertSegmentToRegex(segment);
    }

    return `${convertSegmentToRegex(segment)}/${buildRegex(index + 1)}`;
  };

  return new RegExp(`^${isAbsolute ? "/" : ""}${buildRegex(0)}$`);
}

function getTraversalRoot(pattern: string): string {
  const normalizedPattern = normalizeGlobPath(pattern);
  const firstMagicIndex = findFirstMagicIndex(normalizedPattern);

  if (firstMagicIndex === -1) {
    return (
      normalizeGlobPath(path.posix.dirname(normalizedPattern), {
        stripTrailingSeparator: true,
      }) || "."
    );
  }

  const prefix = normalizedPattern.slice(0, firstMagicIndex);
  if (prefix.endsWith("/")) {
    const directRoot = normalizeGlobPath(prefix.slice(0, -1), {
      stripTrailingSeparator: true,
    });
    return directRoot || (normalizedPattern.startsWith("/") ? "/" : ".");
  }

  const traversalRoot = normalizeGlobPath(path.posix.dirname(prefix), {
    stripTrailingSeparator: true,
  });

  if (traversalRoot === "") {
    return normalizedPattern.startsWith("/") ? "/" : ".";
  }

  return traversalRoot;
}

function addCandidate(candidates: Map<string, GlobCandidate>, candidatePath: string, isDirectory: boolean): void {
  const normalizedPath = normalizeGlobPath(candidatePath, {
    stripTrailingSeparator: true,
  });
  const existing = candidates.get(normalizedPath);
  candidates.set(normalizedPath, {
    path: normalizedPath,
    isDirectory: (existing?.isDirectory ?? false) || isDirectory,
  });
}

function addAncestorDirectories(candidates: Map<string, GlobCandidate>, candidatePath: string, traversalRoot: string): void {
  const normalizedRoot = normalizeGlobPath(traversalRoot, {
    stripTrailingSeparator: true,
  });
  let currentPath = normalizeGlobPath(path.posix.dirname(candidatePath), {
    stripTrailingSeparator: true,
  });

  while (currentPath && currentPath !== "." && currentPath !== normalizedRoot && currentPath !== "/") {
    addCandidate(candidates, currentPath, true);
    currentPath = normalizeGlobPath(path.posix.dirname(currentPath), {
      stripTrailingSeparator: true,
    });
  }
}

async function resolveExactPattern(
  provider: GlobCapableProvider,
  pattern: string,
  { ignoreFilter, includeDirectories = false }: GlobOptions,
): Promise<string[]> {
  const normalizedPattern = normalizeGlobPath(pattern, {
    stripTrailingSeparator: true,
  });
  const stat = await provider.stat(normalizedPattern);
  if (!stat.exists) return [];
  if (stat.isDirectory && !includeDirectories) return [];
  if (ignoreFilter(normalizedPattern)) return [];
  return [
    normalizeGlobPath(stat.absolutePath ?? stat.path, {
      stripTrailingSeparator: true,
    }),
  ];
}

export default async function fallbackGlob(provider: GlobCapableProvider, pattern: string, options: GlobOptions): Promise<string[]> {
  const normalizedPattern = normalizeGlobPath(pattern);
  const expandedPatterns = expandBraces(normalizedPattern).map(value => normalizeGlobPath(value, { stripTrailingSeparator: true }));
  const hasMagic = expandedPatterns.some(hasGlobMagic);

  if (!hasMagic) {
    const exactMatches = await Promise.all(expandedPatterns.map(expandedPattern => resolveExactPattern(provider, expandedPattern, options)));
    return exactMatches.flat().sort();
  }

  const matchers = expandedPatterns.map(globPatternToRegExp);
  const traversalRoots = [...new Set(expandedPatterns.map(getTraversalRoot))];
  const candidates = new Map<string, GlobCandidate>();

  for (const traversalRoot of traversalRoots) {
    const rootStat = await provider.stat(traversalRoot);
    if (!rootStat.exists) continue;

    for await (const entry of provider.getDirectoryTree(traversalRoot, {
      recursive: true,
      ignoreFilter: () => false,
    })) {
      const isDirectory = entry.endsWith("/") || entry.endsWith(path.sep);
      const normalizedEntry = normalizeGlobPath(entry, {
        stripTrailingSeparator: true,
      });
      addCandidate(candidates, normalizedEntry, isDirectory);

      if (options.includeDirectories) {
        addAncestorDirectories(candidates, normalizedEntry, traversalRoot);
      }
    }
  }

  return [...candidates.values()]
    .filter(candidate => options.includeDirectories || !candidate.isDirectory)
    .filter(candidate => !options.ignoreFilter(candidate.path))
    .filter(candidate => matchers.some(matcher => matcher.test(candidate.path)))
    .map(candidate => candidate.path)
    .sort();
}
