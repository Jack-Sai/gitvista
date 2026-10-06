import type { RepoSummary } from "../../types/repo";
import { repoStatusKind } from "../../types/repo";
import { absoluteTime, relativeTime } from "../../lib/time";

const DOT: Record<string, string> = {
  clean: "bg-success",
  dirty: "bg-warning",
  conflict: "bg-danger",
  unknown: "bg-fg-muted",
};

interface RepoTableProps {
  repos: RepoSummary[];
  selection: string[];
  onOpen: (repo: RepoSummary, e: React.MouseEvent) => void;
}

export default function RepoTable({ repos, selection, onOpen }: RepoTableProps) {
  const selectionSet = new Set(selection);

  return (
    <div className="overflow-hidden rounded-lg border border-border-default bg-elevated">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border-subtle text-left text-[11px] tracking-wide text-fg-muted uppercase">
            <th className="w-8 px-3 py-2 font-medium"></th>
            <th className="px-3 py-2 font-medium">仓库</th>
            <th className="px-3 py-2 font-medium">分支</th>
            <th className="px-3 py-2 text-right font-medium">领先/落后</th>
            <th className="px-3 py-2 text-right font-medium">改动</th>
            <th className="px-3 py-2 text-right font-medium">最后提交</th>
          </tr>
        </thead>
        <tbody>
          {repos.map((repo) => {
            const kind = repoStatusKind(repo);
            const selected = selectionSet.has(repo.path);
            return (
              <tr
                key={repo.path}
                onClick={(e) => onOpen(repo, e)}
                className={`cursor-pointer border-b border-border-subtle text-[13px] transition-colors duration-120 last:border-b-0 ${
                  selected ? "bg-accent/10" : "hover:bg-hover"
                }`}
              >
                <td className="px-3 py-2">
                  <span
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
                      selected
                        ? "border-accent bg-accent"
                        : "border-border-default"
                    }`}
                  >
                    {selected && (
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <path
                          d="M1.5 5.5L4 8L8.5 2.5"
                          stroke="white"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                </td>
                <td className="max-w-0 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[kind]}`}
                    />
                    <span className="truncate text-fg-primary">
                      {repo.name}
                    </span>
                  </div>
                </td>
                <td className="truncate px-3 py-2 font-mono text-[12px] text-fg-secondary">
                  {repo.head_branch ?? "detached"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-[12px] tabular-nums">
                  <span className="text-warning">↑{repo.ahead}</span>{" "}
                  <span className="text-danger">↓{repo.behind}</span>
                </td>
                <td className="px-3 py-2 text-right text-[12px]">
                  {kind === "conflict" ? (
                    <span className="text-danger">{repo.changed_count}</span>
                  ) : kind === "dirty" ? (
                    <span className="text-warning">{repo.changed_count}</span>
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                </td>
                <td
                  className="px-3 py-2 text-right text-[12px] text-fg-muted"
                  title={absoluteTime(repo.last_commit_time)}
                >
                  {relativeTime(repo.last_commit_time) || "无提交"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
