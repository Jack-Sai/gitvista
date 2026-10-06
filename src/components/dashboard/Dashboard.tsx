import { useEffect, useMemo, useState } from "react";
import {
  FolderGit2,
  FolderSearch,
  GitFork,
  LayoutGrid,
  List,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sun,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useThemeStore } from "../../store/theme";
import { useReposStore } from "../../store/repos";
import { useShellStore } from "../../store/shell";
import { useDashboardStore, type SortKey } from "../../store/dashboard";
import type { RepoSummary } from "../../types/repo";
import RepoCard from "./RepoCard";
import RepoTable from "./RepoTable";

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
  const view = useDashboardStore((s) => s.view);
  const setView = useDashboardStore((s) => s.setView);
  const sort = useDashboardStore((s) => s.sort);
  const setSort = useDashboardStore((s) => s.setSort);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

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

  if (repos.length === 0) return <Welcome />;

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
          <span className="text-[12px] text-fg-muted tabular-nums">
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

      <div className="flex-1 overflow-y-auto p-4">
        {visible.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-fg-muted">
            无匹配仓库
          </div>
        ) : view === "card" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {visible.map((repo) => (
              <RepoCard key={repo.path} repo={repo} />
            ))}
          </div>
        ) : (
          <RepoTable repos={visible} />
        )}
      </div>
    </div>
  );
}
