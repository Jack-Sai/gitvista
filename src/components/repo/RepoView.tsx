import { ChevronLeft, Download, GitPullRequestArrow, Upload } from "lucide-react";
import GraphView from "./GraphView";
import { useReposStore } from "../../store/repos";

interface RepoViewProps {
  repoPath: string;
}

export default function RepoView({ repoPath }: RepoViewProps) {
  const repo = useReposStore((s) =>
    s.repos.find((r) => r.path === repoPath),
  );
  const selectRepo = useReposStore((s) => s.selectRepo);

  if (!repo) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-fg-muted">
        仓库不存在
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-base">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border-subtle px-3">
        <button
          type="button"
          onClick={() => selectRepo(null)}
          title="返回仪表盘"
          className="flex h-7 w-7 items-center justify-center rounded-md text-fg-secondary transition-colors duration-120 hover:bg-hover hover:text-fg-primary"
        >
          <ChevronLeft size={16} strokeWidth={1.5} />
        </button>

        <span className="text-[15px] font-semibold text-fg-primary">
          {repo.name}
        </span>

        <span className="rounded-md border border-border-subtle bg-surface px-2 py-0.5 font-mono text-[12px] text-fg-secondary">
          {repo.head_branch ?? "detached"}
        </span>

        {(repo.ahead > 0 || repo.behind > 0) && (
          <span className="font-mono text-[12px] tabular-nums">
            <span className="text-warning">↑{repo.ahead}</span>{" "}
            <span className="text-danger">↓{repo.behind}</span>
          </span>
        )}

        {!repo.is_clean && (
          <span className="text-[12px] text-fg-muted">
            {repo.changed_count} 个改动
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            disabled
            title="Fetch（开发中）"
            className="flex h-7 items-center gap-1.5 rounded-md border border-border-default px-2.5 text-[12px] text-fg-secondary transition-colors duration-120 hover:bg-hover disabled:opacity-50"
          >
            <Download size={13} strokeWidth={1.5} />
            Fetch
          </button>
          <button
            type="button"
            disabled
            title="Pull（开发中）"
            className="flex h-7 items-center gap-1.5 rounded-md border border-border-default px-2.5 text-[12px] text-fg-secondary transition-colors duration-120 hover:bg-hover disabled:opacity-50"
          >
            <GitPullRequestArrow size={13} strokeWidth={1.5} />
            Pull
          </button>
          <button
            type="button"
            disabled
            title="Push（开发中）"
            className="flex h-7 items-center gap-1.5 rounded-md border border-border-default px-2.5 text-[12px] text-fg-secondary transition-colors duration-120 hover:bg-hover disabled:opacity-50"
          >
            <Upload size={13} strokeWidth={1.5} />
            Push
          </button>
        </div>
      </div>

      <GraphView repoPath={repoPath} />
    </div>
  );
}
