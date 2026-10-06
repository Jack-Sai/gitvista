import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Minus,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { useShellStore } from "../../store/shell";
import { useThemeStore } from "../../store/theme";
import { useReposStore } from "../../store/repos";
import DiffView from "./DiffView";

const CodeMirror = lazy(() => import("@uiw/react-codemirror"));

interface FileEntry {
  path: string;
  status: string;
}

interface WorktreeStatus {
  staged: FileEntry[];
  unstaged: FileEntry[];
  conflicts: FileEntry[];
}

const STATUS_STYLE: Record<string, string> = {
  M: "text-warning",
  A: "text-success",
  D: "text-danger",
  R: "text-purple",
  C: "text-purple",
  T: "text-info",
  U: "text-danger",
};

interface ChangesDrawerProps {
  repoPath: string;
}

export default function ChangesDrawer({ repoPath }: ChangesDrawerProps) {
  const drawerOpen = useShellStore((s) => s.drawerOpen);
  const toggleDrawer = useShellStore((s) => s.toggleDrawer);
  const themeMode = useThemeStore((s) => s.mode);
  const refreshRepo = useReposStore((s) => s.refreshRepo);
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<{
    path: string;
    staged: boolean;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ["worktree", repoPath],
    queryFn: () =>
      invoke<WorktreeStatus>("get_worktree_status", { repoPath }),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["worktree", repoPath] });
    await queryClient.invalidateQueries({ queryKey: ["diff"] });
    await queryClient.invalidateQueries({ queryKey: ["commits", repoPath] });
    refreshRepo(repoPath);
  };

  const runAction = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      await invalidate();
    } catch (e) {
      setActionError(typeof e === "string" ? e : "操作失败");
    }
  };

  const stage = (paths: string[]) =>
    runAction(() => invoke("stage_files", { repoPath, paths }));

  const unstage = (paths: string[]) =>
    runAction(() => invoke("unstage_files", { repoPath, paths }));

  const handleCommit = async () => {
    setActionError(null);
    setCommitting(true);
    try {
      await invoke("commit_changes", { repoPath, message, amend });
      setMessage("");
      setAmend(false);
      setSelected(null);
      await invalidate();
    } catch (e) {
      setActionError(typeof e === "string" ? e : "提交失败");
    } finally {
      setCommitting(false);
    }
  };

  const totalChanged = status
    ? status.unstaged.length + status.staged.length
    : 0;
  const isDark =
    themeMode === "dark" ||
    (themeMode === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const commitRef = useRef(handleCommit);
  commitRef.current = handleCommit;
  const canCommitRef = useRef(false);
  canCommitRef.current =
    !committing && message.trim() !== "" && (status?.staged.length ?? 0) > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canCommitRef.current) {
        e.preventDefault();
        commitRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const renderEntry = (entry: FileEntry, stagedSide: boolean) => (
    <button
      key={`${stagedSide ? "s" : "u"}:${entry.path}`}
      type="button"
      onClick={() => setSelected({ path: entry.path, staged: stagedSide })}
      className={`group flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left transition-colors duration-120 ${
        selected?.path === entry.path && selected.staged === stagedSide
          ? "bg-hover"
          : "hover:bg-hover"
      }`}
    >
      <span
        className={`w-3 shrink-0 text-center font-mono text-[11px] font-bold ${STATUS_STYLE[entry.status] ?? "text-fg-secondary"}`}
      >
        {entry.status}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-fg-primary">
        {entry.path}
      </span>
      <span
        role="button"
        tabIndex={0}
        title={stagedSide ? "取消暂存" : "暂存"}
        onClick={(e) => {
          e.stopPropagation();
          stagedSide ? unstage([entry.path]) : stage([entry.path]);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.stopPropagation()}
        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-sm text-fg-muted hover:bg-border-subtle hover:text-fg-primary group-hover:flex"
      >
        {stagedSide ? (
          <Minus size={12} strokeWidth={1.5} />
        ) : (
          <Plus size={12} strokeWidth={1.5} />
        )}
      </span>
    </button>
  );

  return (
    <div
      className={`flex shrink-0 flex-col border-t border-border-subtle bg-surface ${
        drawerOpen ? "h-[42vh]" : "h-9"
      } transition-[height] duration-200 ease-out`}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 px-3">
        <button
          type="button"
          onClick={toggleDrawer}
          className="flex items-center gap-1.5 text-[12px] font-medium text-fg-secondary transition-colors duration-120 hover:text-fg-primary"
        >
          {drawerOpen ? (
            <ChevronDown size={13} strokeWidth={1.5} />
          ) : (
            <ChevronUp size={13} strokeWidth={1.5} />
          )}
          改动
          {totalChanged > 0 && (
            <span className="ml-0.5 rounded-full bg-hover px-1.5 text-[11px] text-fg-secondary tabular-nums">
              {totalChanged}
            </span>
          )}
        </button>

        {status && status.conflicts.length > 0 && (
          <span className="flex items-center gap-1 text-[12px] text-danger">
            <AlertTriangle size={12} strokeWidth={1.5} />
            {status.conflicts.length} 个冲突
          </span>
        )}

        {actionError && (
          <span className="truncate text-[12px] text-danger">
            {actionError}
          </span>
        )}

        {drawerOpen && (
          <div className="ml-auto flex items-center gap-2 text-[12px]">
            {status && status.unstaged.length > 0 && (
              <button
                type="button"
                onClick={() => stage(status.unstaged.map((f) => f.path))}
                className="text-accent transition-colors duration-120 hover:underline"
              >
                全部暂存
              </button>
            )}
            {status && status.staged.length > 0 && (
              <button
                type="button"
                onClick={() => unstage(status.staged.map((f) => f.path))}
                className="text-accent transition-colors duration-120 hover:underline"
              >
                全部取消暂存
              </button>
            )}
          </div>
        )}
      </div>

      {drawerOpen && (
        <div className="flex min-h-0 flex-1 gap-px border-t border-border-subtle">
          <div className="flex w-64 shrink-0 flex-col overflow-hidden bg-surface">
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="px-2 pt-1 pb-0.5 text-[11px] font-medium tracking-wide text-fg-muted uppercase">
                未暂存（{status?.unstaged.length ?? 0}）
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-1">
                {status?.unstaged.map((f) => renderEntry(f, false))}
                {(status?.unstaged.length ?? 0) === 0 && (
                  <div className="px-2 py-1 text-[11px] text-fg-muted">
                    无改动
                  </div>
                )}
              </div>

              <div className="border-t border-border-subtle px-2 pt-1.5 pb-0.5 text-[11px] font-medium tracking-wide text-fg-muted uppercase">
                已暂存（{status?.staged.length ?? 0}）
              </div>
              <div className="max-h-[35%] min-h-0 overflow-y-auto px-1 pb-1">
                {status?.staged.map((f) => renderEntry(f, true))}
                {(status?.staged.length ?? 0) === 0 && (
                  <div className="px-2 py-1 text-[11px] text-fg-muted">
                    无暂存改动
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-border-subtle p-2">
              <Suspense
                fallback={
                  <div className="flex h-16 items-center justify-center rounded-md border border-border-subtle bg-base">
                    <Loader2 size={14} className="animate-spin text-fg-muted" />
                  </div>
                }
              >
                <CodeMirror
                  value={message}
                  onChange={setMessage}
                  height="64px"
                  theme={isDark ? "dark" : "light"}
                  placeholder="提交信息（首行标题）"
                  basicSetup={{
                    lineNumbers: false,
                    foldGutter: false,
                    highlightActiveLine: false,
                  }}
                  className="overflow-hidden rounded-md border border-border-subtle text-[12px]"
                />
              </Suspense>
              <div className="mt-1.5 flex items-center gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-fg-secondary">
                  <input
                    type="checkbox"
                    checked={amend}
                    onChange={(e) => setAmend(e.target.checked)}
                  />
                  Amend
                </label>
                <button
                  type="button"
                  onClick={handleCommit}
                  disabled={
                    committing || message.trim() === "" || (status?.staged.length ?? 0) === 0
                  }
                  className="ml-auto flex h-7 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-white transition-colors duration-120 hover:bg-accent-hover disabled:opacity-50"
                >
                  {committing && (
                    <Loader2 size={12} className="animate-spin" />
                  )}
                  提交
                </button>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col bg-base">
            <DiffView
              repoPath={repoPath}
              filePath={selected?.path ?? null}
              staged={selected?.staged ?? false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
