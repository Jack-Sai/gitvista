import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Download,
  GitBranch,
  GitPullRequestArrow,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import GraphView from "./GraphView";
import RefSidebar from "./RefSidebar";
import ChangesDrawer from "../workbench/ChangesDrawer";
import { useReposStore } from "../../store/repos";
import type { RefsList } from "../../types/refs";

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
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchFilter, setBranchFilter] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await invalidate();
    } finally {
      setRefreshing(false);
    }
  };

  const { data: refs } = useQuery({
    queryKey: ["refs", repoPath],
    queryFn: () => invoke<RefsList>("list_refs", { repoPath }),
  });

  const filteredBranches = useMemo(() => {
    const q = branchFilter.trim().toLowerCase();
    const list = refs?.locals ?? [];
    return q ? list.filter((b) => b.name.toLowerCase().includes(q)) : list;
  }, [refs, branchFilter]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["worktree", repoPath] });
    await queryClient.invalidateQueries({ queryKey: ["commits", repoPath] });
    await queryClient.invalidateQueries({ queryKey: ["refs", repoPath] });
    await queryClient.invalidateQueries({ queryKey: ["diff"] });
    await refreshRepo(repoPath);
  };

  const handleCheckout = async (name: string, force = false) => {
    try {
      const res = await invoke<GitOpResult>("checkout_branch", {
        repoPath,
        branchName: name,
        force,
      });
      if (!res.success) {
        setOpError(res.error);
        return;
      }
      await invalidate();
    } catch (e) {
      setOpError(typeof e === "string" ? e : "切换分支失败");
    }
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

  const runOpRef = useRef(runOp);
  runOpRef.current = runOp;
  const opRef = useRef<OpKind | null>(null);
  opRef.current = op;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (opRef.current !== null) return;
      const key = e.key.toLowerCase();
      if (key === "r" && !e.shiftKey) {
        e.preventDefault();
        runOpRef.current("fetch");
      } else if (key === "r" && e.shiftKey) {
        e.preventDefault();
        runOpRef.current("pull");
      } else if (key === "u" && e.shiftKey) {
        e.preventDefault();
        runOpRef.current("push");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!repo) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-fg-muted">
        仓库不存在
      </div>
    );
  }

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

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setBranchFilter("");
              setBranchOpen((v) => !v);
            }}
            title="切换分支"
            className="flex h-7 items-center gap-1.5 rounded-md border border-border-subtle bg-surface px-2 font-mono text-[12px] text-fg-secondary transition-colors duration-120 hover:bg-hover hover:text-fg-primary"
          >
            <GitBranch size={12} strokeWidth={1.5} />
            {repo.head_branch ?? "detached"}
            <ChevronDown size={12} strokeWidth={1.5} className="text-fg-muted" />
          </button>
          {branchOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setBranchOpen(false)}
              />
              <div className="absolute top-full left-0 z-50 mt-1 w-64 overflow-hidden rounded-md border border-border-default bg-elevated shadow-lg">
                <div className="border-b border-border-subtle p-2">
                  <input
                    autoFocus
                    type="text"
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setBranchOpen(false);
                      if (e.key === "Enter" && filteredBranches.length > 0) {
                        void handleCheckout(filteredBranches[0].name);
                        setBranchOpen(false);
                      }
                    }}
                    placeholder="筛选本地分支…"
                    className="h-7 w-full rounded-md border border-border-subtle bg-base px-2 text-[12px] text-fg-primary outline-none placeholder:text-fg-muted focus:border-accent"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {filteredBranches.map((b) => (
                    <button
                      key={b.name}
                      type="button"
                      onClick={() => {
                        if (!b.is_head) void handleCheckout(b.name);
                        setBranchOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors duration-120 hover:bg-hover ${
                        b.is_head
                          ? "text-accent"
                          : "text-fg-secondary hover:text-fg-primary"
                      }`}
                    >
                      {b.is_head ? (
                        <Check size={12} strokeWidth={2} className="shrink-0" />
                      ) : (
                        <span className="w-3 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-mono">
                        {b.name}
                      </span>
                      {(b.ahead > 0 || b.behind > 0) && (
                        <span className="shrink-0 font-mono text-[10px] tabular-nums">
                          {b.ahead > 0 && (
                            <span className="text-warning">↑{b.ahead}</span>
                          )}
                          {b.ahead > 0 && b.behind > 0 && " "}
                          {b.behind > 0 && (
                            <span className="text-danger">↓{b.behind}</span>
                          )}
                        </span>
                      )}
                    </button>
                  ))}
                  {filteredBranches.length === 0 && (
                    <div className="px-3 py-2 text-[12px] text-fg-muted">
                      无匹配分支
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

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
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing || op !== null}
            title="刷新仓库状态"
            className="flex h-7 items-center gap-1.5 rounded-md border border-border-default px-2.5 text-[12px] text-fg-secondary transition-colors duration-120 hover:bg-hover hover:text-fg-primary disabled:opacity-50"
          >
            <RefreshCw
              size={13}
              strokeWidth={1.5}
              className={refreshing ? "animate-spin" : undefined}
            />
            刷新
          </button>
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

      <div className="flex min-h-0 flex-1">
        <RefSidebar
          repoPath={repoPath}
          currentBranch={repo.head_branch}
          onCheckout={handleCheckout}
          onMutated={invalidate}
          onError={setOpError}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <GraphView repoPath={repoPath} />
        </div>
      </div>
      <ChangesDrawer repoPath={repoPath} />
    </div>
  );
}
