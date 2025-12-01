import Agent from "@tokenring-ai/agent/Agent";
import {ChatConfig, ContextItem} from "@tokenring-ai/chat/types";
import {z} from "zod";
import FileSystemService from "../FileSystemService.js";
import {GrepResult} from "../FileSystemProvider.js";

const FileSearchContextSchema = z.object({
  maxResults: z.number().default(25),
});

// Common stop words to filter out from search queries
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
  'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'not', 'only', 'same', 'so', 'than', 'too', 'very',
  'just', 'about', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'any', 'if', 'because', 'as', 'until', 'while',
  'find', 'show', 'get', 'make', 'want', 'look', 'file', 'files', 'code',
  'please', 'help', 'me', 'my', 'your', 'our', 'their'
]);

// Common file extensions to detect
const FILE_EXTENSION_PATTERN = /\.[a-zA-Z0-9]{1,10}$/;

interface FileMatch {
  filePath: string;
  score: number;
  matchType: 'filename' | 'content' | 'both';
  lineMatches: Array<{ line: number; content: string }>;
}

/**
 * Extract meaningful keywords from user input
 */
function extractKeywords(input: string): string[] {
  const keywords: string[] = [];

  // Extract quoted phrases first (exact matches)
  const quotedPhrases = input.match(/"([^"]+)"|'([^']+)'/g);
  if (quotedPhrases) {
    for (const phrase of quotedPhrases) {
      keywords.push(phrase.replace(/["']/g, ''));
    }
  }

  // Remove quoted phrases from input for further processing
  let remaining = input.replace(/"([^"]+)"|'([^']+)'/g, ' ');

  // Extract potential file paths (containing / or \)
  const pathMatches = remaining.match(/[\w./\\-]+[/\\][\w./\\-]+/g);
  if (pathMatches) {
    keywords.push(...pathMatches);
    for (const match of pathMatches) {
      remaining = remaining.replace(match, ' ');
    }
  }

  // Extract potential file names with extensions
  const fileNameMatches = remaining.match(/\b[\w-]+\.[a-zA-Z0-9]{1,10}\b/g);
  if (fileNameMatches) {
    keywords.push(...fileNameMatches);
    for (const match of fileNameMatches) {
      remaining = remaining.replace(match, ' ');
    }
  }

  // Split CamelCase and snake_case identifiers
  const splitIdentifier = (str: string): string[] => {
    const parts: string[] = [];
    // Split camelCase
    const camelParts = str.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
    for (const part of camelParts) {
      // Split snake_case
      parts.push(...part.split('_').filter(Boolean));
    }
    return parts;
  };

  // Tokenize remaining text
  const tokens = remaining
    .toLowerCase()
    .replace(/[^\w\s.-]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1);

  for (const token of tokens) {
    // Skip stop words
    if (STOP_WORDS.has(token)) continue;

    // Add the token itself
    keywords.push(token);

    // If it looks like an identifier, split it
    if (token.includes('_') || /[a-z][A-Z]/.test(token)) {
      keywords.push(...splitIdentifier(token));
    }
  }

  // Deduplicate while preserving order
  return [...new Set(keywords)].filter(k => k.length > 1);
}

/**
 * Extract potential file extensions mentioned in input
 */
function extractFileExtensions(input: string): string[] {
  const extensions: string[] = [];

  // Direct extension mentions like ".ts" or "ts files"
  const extMatches = input.match(/\.([a-zA-Z0-9]{1,10})\b/g);
  if (extMatches) {
    extensions.push(...extMatches);
  }

  // Pattern like "typescript files" or "json files"
  const langToExt: Record<string, string> = {
    'typescript': '.ts',
    'javascript': '.js',
    'python': '.py',
    'java': '.java',
    'rust': '.rs',
    'go': '.go',
    'ruby': '.rb',
    'css': '.css',
    'html': '.html',
    'json': '.json',
    'yaml': '.yaml',
    'yml': '.yml',
    'markdown': '.md',
    'react': '.tsx',
    'vue': '.vue',
    'svelte': '.svelte',
  };

  const lowerInput = input.toLowerCase();
  for (const [lang, ext] of Object.entries(langToExt)) {
    if (lowerInput.includes(lang)) {
      extensions.push(ext);
    }
  }

  return [...new Set(extensions)];
}

/**
 * Calculate fuzzy match score between two strings (0-1)
 */
function fuzzyScore(needle: string, haystack: string): number {
  const lowerNeedle = needle.toLowerCase();
  const lowerHaystack = haystack.toLowerCase();

  // Exact match
  if (lowerHaystack === lowerNeedle) return 1.0;

  // Contains match
  if (lowerHaystack.includes(lowerNeedle)) {
    // Score based on how much of the haystack the needle covers
    return 0.7 + (0.2 * (lowerNeedle.length / lowerHaystack.length));
  }

  // Check if all characters appear in order (subsequence match)
  let needleIdx = 0;
  let consecutiveMatches = 0;
  let maxConsecutive = 0;
  let lastMatchIdx = -2;

  for (let i = 0; i < lowerHaystack.length && needleIdx < lowerNeedle.length; i++) {
    if (lowerHaystack[i] === lowerNeedle[needleIdx]) {
      if (i === lastMatchIdx + 1) {
        consecutiveMatches++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveMatches);
      } else {
        consecutiveMatches = 1;
      }
      lastMatchIdx = i;
      needleIdx++;
    }
  }

  if (needleIdx === lowerNeedle.length) {
    // All characters found in order
    const coverage = lowerNeedle.length / lowerHaystack.length;
    const consecutiveBonus = maxConsecutive / lowerNeedle.length;
    return 0.3 + (0.2 * coverage) + (0.2 * consecutiveBonus);
  }

  return 0;
}

/**
 * Score a file path against search keywords
 */
function scoreFilePath(
  filePath: string,
  keywords: string[],
  extensions: string[]
): number {
  let score = 0;
  const fileName = filePath.split('/').pop() || '';
  const fileNameWithoutExt = fileName.replace(FILE_EXTENSION_PATTERN, '');
  const fileExt = fileName.match(FILE_EXTENSION_PATTERN)?.[0] || '';

  // Check extension match
  if (extensions.length > 0 && extensions.includes(fileExt)) {
    score += 0.5;
  }

  for (const keyword of keywords) {
    // Exact filename match (highest priority)
    if (fileName.toLowerCase() === keyword.toLowerCase()) {
      score += 10;
      continue;
    }

    // Filename without extension match
    if (fileNameWithoutExt.toLowerCase() === keyword.toLowerCase()) {
      score += 8;
      continue;
    }

    // Filename contains keyword
    const fileNameScore = fuzzyScore(keyword, fileName);
    if (fileNameScore > 0.5) {
      score += 5 * fileNameScore;
      continue;
    }

    // Path contains keyword
    const pathScore = fuzzyScore(keyword, filePath);
    if (pathScore > 0.3) {
      score += 2 * pathScore;
    }
  }

  // Penalize deeply nested files slightly
  const depth = filePath.split('/').length;
  score -= depth * 0.05;

  return score;
}

/**
 * Aggregate grep results by file
 */
function aggregateGrepResults(
  grepResults: GrepResult[]
): Map<string, Array<{ line: number; content: string }>> {
  const fileMatches = new Map<string, Array<{ line: number; content: string }>>();

  for (const result of grepResults) {
    const existing = fileMatches.get(result.file);
    const lineMatch = { line: result.line, content: result.match };

    if (existing) {
      // Avoid duplicate lines
      if (!existing.some(m => m.line === result.line)) {
        existing.push(lineMatch);
      }
    } else {
      fileMatches.set(result.file, [lineMatch]);
    }
  }

  // Sort line matches by line number within each file
  for (const matches of fileMatches.values()) {
    matches.sort((a, b) => a.line - b.line);
  }

  return fileMatches;
}

/**
 * Search for files matching the user's query
 */
async function searchFiles(
  fileSystemService: FileSystemService,
  keywords: string[],
  extensions: string[],
  maxResults: number
): Promise<FileMatch[]> {
  const results: Map<string, FileMatch> = new Map();

  // Strategy 1: Filename/path matching via glob
  const allFiles = await fileSystemService.glob('**/*');

  for (const filePath of allFiles) {
    const score = scoreFilePath(filePath, keywords, extensions);

    if (score > 0.5) {
      results.set(filePath, {
        filePath,
        score,
        matchType: 'filename',
        lineMatches: [],
      });
    }
  }

  // Strategy 2: Content search via grep for high-value keywords
  const grepKeywords = keywords.filter(k =>
    k.length > 3 &&
    !STOP_WORDS.has(k.toLowerCase()) &&
    /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)
  );

  if (grepKeywords.length > 0) {
    try {
      const grepResults = await fileSystemService.grep(grepKeywords);

      const fileMatches = aggregateGrepResults(grepResults);

      for (const [file, lineMatches] of fileMatches) {
        const existing = results.get(file);
        const contentScore = Math.min(lineMatches.length * 0.3, 3);

        if (existing) {
          existing.score += contentScore;
          existing.matchType = 'both';
          existing.lineMatches = lineMatches;
        } else {
          results.set(file, {
            filePath: file,
            score: contentScore,
            matchType: 'content',
            lineMatches,
          });
        }
      }
    } catch (error) {
      console.warn('Grep search failed:', error);
    }
  }

  return Array.from(results.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

/**
 * Format search results as human-readable text
 */
function formatResults(results: FileMatch[], keywords: string[]): string {
  if (results.length === 0) {
    return `No files found matching keywords: ${keywords.join(', ')}`;
  }

  const lines: string[] = [
    `Found ${results.length} file(s) matching keywords: ${keywords.join(', ')}`,
    '',
  ];

  for (const result of results) {
    const matchTypeLabel = result.matchType === 'both'
      ? '(filename + content)'
      : result.matchType === 'content'
        ? '(content)'
        : '(filename)';

    lines.push(`## ${result.filePath} ${matchTypeLabel}`);

    if (result.lineMatches.length > 0) {
      lines.push('');
      lines.push('Matching lines:');
      for (const match of result.lineMatches.slice(0, 5)) { // Limit to 5 lines per file
        const trimmedContent = match.content.trim();
        lines.push(`  Line ${match.line}: ${trimmedContent}`);
      }
      if (result.lineMatches.length > 5) {
        lines.push(`  ... and ${result.lineMatches.length - 5} more matches`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Main context provider function
 */
export default async function* getContextItems(
  chatInputMessage: string,
  chatConfig: ChatConfig,
  params: unknown,
  agent: Agent
): AsyncGenerator<ContextItem> {
  const { maxResults } = FileSearchContextSchema.parse(params);

  const fileSystemService = agent.requireServiceByType(FileSystemService);

  const keywords = extractKeywords(chatInputMessage);
  const extensions = extractFileExtensions(chatInputMessage);

  if (keywords.length === 0) {
    return;
  }

  const searchResults = await searchFiles(
    fileSystemService,
    keywords,
    extensions,
    maxResults
  );

  const formattedContent = formatResults(searchResults, keywords);

  yield {
    role: 'user',
    content: formattedContent,
  };
}

// Export utilities for testing
export {
  extractKeywords,
  extractFileExtensions,
  fuzzyScore,
  scoreFilePath,
  searchFiles,
  aggregateGrepResults,
  formatResults,
};