import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Download,
  GitPullRequestArrow,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import GraphView from "./GraphView";
import ChangesDrawer from "../workbench/ChangesDrawer";
import { useReposStore } from "../../store/repos";

interface GitOpResult {
  success: boolean;
  output: string;
  error: string;
}

type OpKind = "fetch" | "pull" | "push";

interface RepoViewProps {
  repoPath: string;
}

export default function RepoView({ repoPath }: RepoViewProps) {
  const repo = useReposStore((s) => s.repos.find((r) => r.path === repoPath));
  const selectRepo = useReposStore((s) => s.selectRepo);
  const refreshRepo = useReposStore((s) => s.refreshRepo);
  const queryClient = useQueryClient();
  const [op, setOp] = useState<OpKind | null>(null);
  const [opError, setOpError] = useState<string | null>(null);

  if (!repo) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-fg-muted">
        仓库不存在
      </div>
    );
  }

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["worktree", repoPath] });
    await queryClient.invalidateQueries({ queryKey: ["commits", repoPath] });
    await queryClient.invalidateQueries({ queryKey: ["diff"] });
    await refreshRepo(repoPath);
  };

  const runOp = async (kind: OpKind) => {
    setOp(kind);
    setOpError(null);
    try {
      let result: GitOpResult;
      if (kind === "fetch") {
        result = await invoke<GitOpResult>("git_fetch", { repoPath });
      } else if (kind === "pull") {
        result = await invoke<GitOpResult>("git_pull", {
          repoPath,
          rebase: false,
        });
      } else {
        result = await invoke<GitOpResult>("git_push", {
          repoPath,
          forceWithLease: false,
        });
      }
      if (!result.success) {
        setOpError(result.error);
      } else {
        await invalidate();
      }
    } catch (e) {
      setOpError(typeof e === "string" ? e : "网络操作失败");
    } finally {
      setOp(null);
    }
  };

  const opButton = (kind: OpKind, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => runOp(kind)}
      disabled={op !== null}
      title={label}
      className="flex h-7 items-center gap-1.5 rounded-md border border-border-default px-2.5 text-[12px] text-fg-secondary transition-colors duration-120 hover:bg-hover hover:text-fg-primary disabled:opacity-50"
    >
      {op === kind ? (
        <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
      ) : (
        icon
      )}
      {label}
    </button>
  );

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
          {opButton(
            "fetch",
            "Fetch",
            <Download size={13} strokeWidth={1.5} />,
          )}
          {opButton(
            "pull",
            "Pull",
            <GitPullRequestArrow size={13} strokeWidth={1.5} />,
          )}
          {opButton(
            "push",
            "Push",
            <Upload size={13} strokeWidth={1.5} />,
          )}
        </div>
      </div>

      {opError && (
        <div className="flex shrink-0 items-center gap-2 border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-[12px] text-danger">
          <span className="min-w-0 flex-1 whitespace-pre-wrap">
            {opError}
          </span>
          <button
            type="button"
            onClick={() => setOpError(null)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm hover:bg-danger/20"
          >
            <X size={12} strokeWidth={1.5} />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <GraphView repoPath={repoPath} />
        <ChangesDrawer repoPath={repoPath} />
      </div>
    </div>
  );
}
