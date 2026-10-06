import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  FolderGit2,
  FolderSearch,
  GitFork,
  LayoutGrid,
  List,
  Loader2,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sun,
  X,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useThemeStore } from "../../store/theme";
import { useReposStore } from "../../store/repos";
import { useShellStore } from "../../store/shell";
import { useDashboardStore, type SortKey } from "../../store/dashboard";
import type { RepoSummary } from "../../types/repo";
import RepoCard from "./RepoCard";
import RepoTable from "./RepoTable";

interface GitOpResult {
  success: boolean;
  output: string;
  error: string;
}

interface BatchItem {
  path: string;
  name: string;
  ok: boolean;
  error: string;
}

interface BatchResult {
  kind: "fetch" | "pull";
  results: BatchItem[];
  cancelled: boolean;
}

const SORT_LABELS: Record<SortKey, string> = {
  name: "按名称",
  activity: "按最近活动",
  changes: "按改动数量",
  aheadbehind: "按领先/落后",
};

function sortRepos(repos: RepoSummary[], key: SortKey): RepoSummary[] {
  const copy = [...repos];
  switch (key) {
    case "name":
      copy.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
      break;
    case "activity":
      copy.sort(
        (a, b) => (b.last_commit_time ?? 0) - (a.last_commit_time ?? 0),
      );
      break;
    case "changes":
      copy.sort((a, b) => b.changed_count - a.changed_count);
      break;
    case "aheadbehind":
      copy.sort(
        (a, b) => b.ahead + b.behind - (a.ahead + a.behind),
      );
      break;
  }
  return copy;
}

function Welcome() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const addRepos = useReposStore((s) => s.addRepos);
  const openScan = useShellStore((s) => s.openScan);
  const openClone = useShellStore((s) => s.openClone);
  const isDark =
    mode === "dark" ||
    (mode === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const handleAdd = async () => {
    const dir = await open({
      directory: true,
      multiple: false,
      title: "选择仓库目录",
    });
    if (typeof dir === "string") {
      await addRepos([dir]).catch(() => {});
    }
  };

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-6 bg-base">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-border-subtle bg-surface">
          <FolderGit2 size={26} strokeWidth={1.5} className="text-accent" />
        </div>
        <div className="text-[15px] font-semibold text-fg-primary">
          欢迎使用 GitVista
        </div>
        <div className="max-w-sm text-center text-[13px] text-fg-secondary">
          添加或扫描本地仓库，开始统一管理你的 Git 仓库。
        </div>
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-medium text-white transition-colors duration-120 hover:bg-accent-hover"
          >
            <Plus size={14} strokeWidth={2} />
            添加仓库
          </button>
          <button
            type="button"
            onClick={openScan}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border-default px-3.5 text-[13px] font-medium text-fg-secondary transition-colors duration-120 hover:bg-hover hover:text-fg-primary"
          >
            <FolderSearch size={14} strokeWidth={1.5} />
            扫描目录
          </button>
          <button
            type="button"
            onClick={openClone}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border-default px-3.5 text-[13px] font-medium text-fg-secondary transition-colors duration-120 hover:bg-hover hover:text-fg-primary"
          >
            <GitFork size={14} strokeWidth={1.5} />
            克隆仓库
          </button>
        </div>
      </div>

      <div className="absolute right-4 bottom-4 flex items-center gap-1 rounded-md border border-border-subtle bg-elevated p-1">
        <button
          type="button"
          onClick={() => setMode("light")}
          title="浅色"
          className={`flex h-6 w-6 items-center justify-center rounded-sm transition-colors duration-120 ${
            !isDark ? "bg-hover text-fg-primary" : "text-fg-muted"
          }`}
        >
          <Sun size={13} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => setMode("dark")}
          title="深色"
          className={`flex h-6 w-6 items-center justify-center rounded-sm transition-colors duration-120 ${
            isDark ? "bg-hover text-fg-primary" : "text-fg-muted"
          }`}
        >
          <Moon size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const repos = useReposStore((s) => s.repos);
  const refreshAll = useReposStore((s) => s.refreshAll);
  const refreshRepo = useReposStore((s) => s.refreshRepo);
  const selectRepo = useReposStore((s) => s.selectRepo);
  const view = useDashboardStore((s) => s.view);
  const setView = useDashboardStore((s) => s.setView);
  const sort = useDashboardStore((s) => s.sort);
  const setSort = useDashboardStore((s) => s.setSort);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [batch, setBatch] = useState<{
    kind: "fetch" | "pull";
    done: number;
    total: number;
  } | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const lastIndexRef = useRef<number | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (repos.length > 0) refreshAll();
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? repos.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            (r.head_branch ?? "").toLowerCase().includes(q),
        )
      : repos;
    return sortRepos(filtered, sort);
  }, [repos, query, sort]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const handleOpen = (repo: RepoSummary, e: React.MouseEvent, index: number) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.shiftKey && lastIndexRef.current !== null) {
      const start = Math.min(lastIndexRef.current, index);
      const end = Math.max(lastIndexRef.current, index);
      setSelection(visible.slice(start, end + 1).map((r) => r.path));
    } else if (mod) {
      setSelection((prev) =>
        prev.includes(repo.path)
          ? prev.filter((p) => p !== repo.path)
          : [...prev, repo.path],
      );
      lastIndexRef.current = index;
    } else {
      lastIndexRef.current = index;
      selectRepo(repo.path);
    }
  };

  const runBatch = async (kind: "fetch" | "pull") => {
    const paths = [...selection];
    if (paths.length === 0) return;
    cancelRef.current = false;
    setBatchResult(null);
    setBatch({ kind, done: 0, total: paths.length });
    const results: BatchItem[] = [];
    let done = 0;
    const queue = [...paths];
    const nameOf = (p: string) =>
      repos.find((r) => r.path === p)?.name ?? p;

    const worker = async () => {
      while (queue.length > 0) {
        if (cancelRef.current) return;
        const path = queue.shift();
        if (!path) return;
        try {
          const res =
            kind === "fetch"
              ? await invoke<GitOpResult>("git_fetch", { repoPath: path })
              : await invoke<GitOpResult>("git_pull", {
                  repoPath: path,
                  rebase: false,
                });
          results.push({
            path,
            name: nameOf(path),
            ok: res.success,
            error: res.error,
          });
        } catch (e) {
          results.push({
            path,
            name: nameOf(path),
            ok: false,
            error: typeof e === "string" ? e : "操作失败",
          });
        }
        done += 1;
        setBatch((b) => (b ? { ...b, done } : null));
      }
    };

    const workers = Array.from(
      { length: Math.min(4, queue.length) },
      () => worker(),
    );
    await Promise.all(workers);

    setBatch(null);
    results.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    setBatchResult({ kind, results, cancelled: cancelRef.current });
    await Promise.all(paths.map((p) => refreshRepo(p)));
    await queryClient.invalidateQueries({ queryKey: ["worktree"] });
    await queryClient.invalidateQueries({ queryKey: ["commits"] });
  };

  if (repos.length === 0) return <Welcome />;

  const failed = batchResult?.results.filter((r) => !r.ok) ?? [];
  const succeeded = (batchResult?.results.length ?? 0) - failed.length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-base">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-2.5">
        <div className="relative w-56">
          <Search
            size={13}
            strokeWidth={1.5}
            className="absolute top-1/2 left-2 -translate-y-1/2 text-fg-muted"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索仓库或分支"
            className="h-7 w-full rounded-md border border-border-subtle bg-surface pr-2 pl-7 text-fg-primary transition-colors duration-120 outline-none placeholder:text-fg-muted focus:border-accent"
          />
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-7 rounded-md border border-border-subtle bg-surface px-2 text-fg-secondary outline-none transition-colors duration-120 hover:border-border-default focus:border-accent"
        >
          {(
            Object.entries(SORT_LABELS) as [SortKey, string][]
          ).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-1.5">
          {selection.length > 0 && !batch && (
            <>
              <span className="text-[12px] text-accent tabular-nums">
                已选 {selection.length}
              </span>
              <button
                type="button"
                onClick={() => runBatch("fetch")}
                className="flex h-7 items-center gap-1 rounded-md border border-accent/50 bg-accent/10 px-2.5 text-[12px] font-medium text-accent transition-colors duration-120 hover:bg-accent/20"
              >
                批量 Fetch
              </button>
              <button
                type="button"
                onClick={() => runBatch("pull")}
                className="flex h-7 items-center gap-1 rounded-md border border-accent/50 bg-accent/10 px-2.5 text-[12px] font-medium text-accent transition-colors duration-120 hover:bg-accent/20"
              >
                批量 Pull
              </button>
              <button
                type="button"
                onClick={() => setSelection([])}
                className="h-7 rounded-md border border-border-default px-2.5 text-[12px] text-fg-secondary transition-colors duration-120 hover:bg-hover"
              >
                取消选择
              </button>
              <span className="mx-1 h-4 w-px bg-border-subtle" />
            </>
          )}
          <span
            className="text-[12px] text-fg-muted tabular-nums"
            title="Ctrl/Cmd+点击多选，Shift 范围选"
          >
            {visible.length} 个仓库
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            title="刷新状态"
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-secondary transition-colors duration-120 hover:bg-hover hover:text-fg-primary"
          >
            <RefreshCw
              size={14}
              strokeWidth={1.5}
              className={refreshing ? "animate-spin" : ""}
            />
          </button>
          <div className="flex items-center rounded-md border border-border-subtle bg-surface p-0.5">
            <button
              type="button"
              onClick={() => setView("card")}
              title="卡片视图"
              className={`flex h-6 w-6 items-center justify-center rounded-sm transition-colors duration-120 ${
                view === "card"
                  ? "bg-hover text-fg-primary"
                  : "text-fg-muted"
              }`}
            >
              <LayoutGrid size={13} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              title="列表视图"
              className={`flex h-6 w-6 items-center justify-center rounded-sm transition-colors duration-120 ${
                view === "list"
                  ? "bg-hover text-fg-primary"
                  : "text-fg-muted"
              }`}
            >
              <List size={13} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {batch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 overflow-hidden border-b border-border-subtle bg-surface"
          >
            <div className="flex items-center gap-3 px-4 py-2 text-[12px]">
              <Loader2 size={13} className="animate-spin text-accent" />
              <span className="text-fg-secondary">
                批量 {batch.kind === "fetch" ? "Fetch" : "Pull"} 中{" "}
                <span className="tabular-nums">
                  {batch.done}/{batch.total}
                </span>
              </span>
              <div className="h-1 w-40 overflow-hidden rounded-full bg-border-subtle">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{
                    width: `${(batch.done / Math.max(batch.total, 1)) * 100}%`,
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  cancelRef.current = true;
                }}
                className="ml-auto text-fg-muted transition-colors duration-120 hover:text-danger"
              >
                取消
              </button>
            </div>
          </motion.div>
        )}

        {!batch && batchResult && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 overflow-hidden border-b border-border-subtle bg-surface"
          >
            <div className="flex flex-col gap-1 px-4 py-2 text-[12px]">
              <div className="flex items-center gap-3">
                <span className="text-fg-secondary">
                  批量 {batchResult.kind === "fetch" ? "Fetch" : "Pull"} 完成
                  {batchResult.cancelled && "（已取消）"}：
                  <span className="text-success">{succeeded} 成功</span>{" "}
                  <span className={failed.length > 0 ? "text-danger" : ""}>
                    / {failed.length} 失败
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setBatchResult(null)}
                  className="ml-auto flex h-5 w-5 items-center justify-center rounded-sm text-fg-muted hover:bg-hover hover:text-fg-primary"
                >
                  <X size={12} strokeWidth={1.5} />
                </button>
              </div>
              {failed.length > 0 && (
                <div className="max-h-28 overflow-y-auto rounded-md border border-danger/30 bg-danger/5 p-1.5">
                  {failed.map((r) => (
                    <div key={r.path} className="flex gap-2 py-0.5">
                      <span className="shrink-0 font-medium text-fg-primary">
                        {r.name}
                      </span>
                      <span className="truncate text-danger" title={r.error}>
                        {r.error}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto p-4">
        {visible.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-fg-muted">
            无匹配仓库
          </div>
        ) : view === "card" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {visible.map((repo, index) => (
              <RepoCard
                key={repo.path}
                repo={repo}
                selected={selection.includes(repo.path)}
                onOpen={(r, e) => handleOpen(r, e, index)}
              />
            ))}
          </div>
        ) : (
          <RepoTable
            repos={visible}
            selection={selection}
            onOpen={(r, e) =>
              handleOpen(r, e, visible.findIndex((v) => v.path === r.path))
            }
          />
        )}
      </div>
    </div>
  );
}
