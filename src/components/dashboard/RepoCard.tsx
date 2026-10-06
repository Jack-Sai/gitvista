import type { RepoSummary } from "../../types/repo";
import { repoStatusKind } from "../../types/repo";
import { absoluteTime, relativeTime } from "../../lib/time";

const DOT: Record<string, string> = {
  clean: "bg-success",
  dirty: "bg-warning",
  conflict: "bg-danger",
  unknown: "bg-fg-muted",
};

interface RepoCardProps {
  repo: RepoSummary;
  selected: boolean;
  onOpen: (repo: RepoSummary, e: React.MouseEvent) => void;
}

export default function RepoCard({ repo, selected, onOpen }: RepoCardProps) {
  const kind = repoStatusKind(repo);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => onOpen(repo, e)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(repo, e as never)}
      className={`cursor-pointer rounded-lg border bg-elevated p-3 transition-colors duration-120 ${
        selected
          ? "border-accent ring-1 ring-accent"
          : "border-border-default hover:border-accent/50"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[kind]}`} />
        <span className="truncate text-[13px] font-medium text-fg-primary">
          {repo.name}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
        <span className="truncate font-mono text-fg-secondary">
          {repo.head_branch ?? "detached"}
        </span>
        {(repo.ahead > 0 || repo.behind > 0) && (
          <span className="shrink-0 font-mono tabular-nums">
            {repo.ahead > 0 && (
              <span className="text-warning">↑{repo.ahead}</span>
            )}
            {repo.ahead > 0 && repo.behind > 0 && " "}
            {repo.behind > 0 && (
              <span className="text-danger">↓{repo.behind}</span>
            )}
          </span>
        )}
      </div>

      <div className="mt-2 text-[12px]">
        {kind === "conflict" ? (
          <span className="text-danger">冲突 {repo.changed_count} 个文件</span>
        ) : kind === "dirty" ? (
          <span className="text-warning">{repo.changed_count} 个未提交改动</span>
        ) : (
          <span className="text-fg-muted">clean</span>
        )}
      </div>

      <div
        className="mt-0.5 truncate text-[11px] text-fg-muted"
        title={absoluteTime(repo.last_commit_time)}
      >
        {relativeTime(repo.last_commit_time) || "无提交"}
      </div>
    </div>
  );
}
