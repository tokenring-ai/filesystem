import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import formatError from "@tokenring-ai/utility/error/formatError";
import { FileSearch, FileText } from "lucide-react";
import { useMemo } from "react";
import { type ContentMatch, groupMatchesByFile, useContentSearch } from "../../../lib/contentSearch.ts";

/** Path shown for a match: relative to the searched directory when inside it. */
function displayPath(file: string, root: string): string {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
}

/**
 * "Search contents" results for the Files navigator: file:line matches under
 * the current directory, grouped by file. Choosing a match opens the file in
 * the editor at that line.
 */
export default function ContentSearchResults({
  provider,
  path,
  query,
  onOpenMatch,
}: {
  provider: string;
  path: string;
  query: string;
  onOpenMatch: (match: ContentMatch) => void;
}) {
  const search = useContentSearch(provider, path, query);
  const groups = useMemo(() => groupMatchesByFile(search.data?.matches ?? []), [search.data]);

  if (query.trim().length < 2) {
    return <EmptyState icon={FileSearch} title="Search file contents" hint={`Type at least two characters to search inside files under ${path}.`} />;
  }
  if (search.error && !search.data) {
    return <ErrorState title="Content search failed" error={formatError(search.error)} onRetry={() => void search.mutate()} />;
  }
  if (!search.data) {
    return <LoadingState message="Searching file contents…" size="sm" className="py-10" />;
  }
  if (groups.length === 0) {
    return <EmptyState icon={FileSearch} title="No matches" hint={`Nothing under ${path} contains “${query.trim()}”.`} />;
  }

  const total = search.data.matches.length;
  return (
    <div className="h-full overflow-y-auto" data-testid="content-search-results">
      <p className="px-3 py-1.5 text-xs text-muted border-b border-primary" role="status">
        {search.data.truncated ? `First ${total} matches` : `${total} ${total === 1 ? "match" : "matches"}`} in {groups.length}{" "}
        {groups.length === 1 ? "file" : "files"}
        {search.data.truncated ? " — refine the search to see more" : ""}
      </p>
      <ul className="py-1">
        {groups.map(group => (
          <li key={group.file}>
            <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-xs font-medium text-primary min-w-0" title={group.file}>
              <FileText className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden />
              <span className="truncate">{displayPath(group.file, path)}</span>
              <span className="text-muted shrink-0">{group.matches.length}</span>
            </div>
            <ul>
              {group.matches.map(match => (
                <li key={`${match.file}:${match.line}`}>
                  <button
                    type="button"
                    onClick={() => onOpenMatch(match)}
                    className="w-full flex items-baseline gap-2 pl-8 pr-3 py-1 text-left text-xs hover:bg-hover focus-ring rounded cursor-pointer min-w-0"
                    aria-label={`Open ${displayPath(match.file, path)} at line ${match.line}`}
                  >
                    <span className="text-muted font-mono shrink-0 tabular-nums">{match.line}</span>
                    <span className="font-mono text-secondary truncate">{match.match.trim()}</span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
