export type WordMatch = {
  start: number;
  end: number;
};

export default function findWordMatches(
  content: string,
  find: string,
): WordMatch[] {
  const trimmed = find.trim();
  if (trimmed.length === 0) return [];

  const words = trimmed.split(/\s+/);
  const firstWord = words[0];
  const matches: WordMatch[] = [];

  let searchFrom = 0;
  while (searchFrom <= content.length - firstWord.length) {
    const firstIndex = content.indexOf(firstWord, searchFrom);
    if (firstIndex === -1) break;

    let pos = firstIndex + firstWord.length;
    let end = pos;
    let matched = true;

    for (let i = 1; i < words.length; i++) {
      while (pos < content.length && /\s/.test(content[pos])) pos++;
      const word = words[i];
      if (content.slice(pos, pos + word.length) !== word) {
        matched = false;
        break;
      }
      pos += word.length;
      end = pos;
    }

    if (matched) {
      matches.push({start: firstIndex, end});
      searchFrom = end;
    } else {
      searchFrom = firstIndex + 1;
    }
  }

  return matches;
}
