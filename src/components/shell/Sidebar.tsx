import { useMemo, useState } from "react";
import { FolderOpen, FolderSearch, Plus, Search } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useShellStore } from "../../store/shell";
import { useReposStore } from "../../store/repos";
import { repoStatusKind, type RepoSummary } from "../../types/repo";

const STATUS_DOT: Record<string, string> = {
  clean: "bg-success",
  dirty: "bg-warning",
  conflict: "bg-danger",
  unknown: "bg-fg-muted",
};

function RepoListItem({ repo }: { repo: RepoSummary }) {
  const selectedPath = useReposStore((s) => s.selectedPath);
  const selectRepo = useReposStore((s) => s.selectRepo);
  const selected = selectedPath === repo.path;
  const kind = repoStatusKind(repo);

  return (
    <button
      type="button"
      onClick={() => selectRepo(repo.path)}
      className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-120 ${
        selected ? "bg-hover" : "hover:bg-hover"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[kind]}`}
        title={
          kind === "clean"
            ? "无未提交改动"
            : kind === "dirty"
              ? "有未提交改动"
              : kind === "conflict"
                ? "存在冲突"
                : "状态未知"
        }
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-fg-primary">{repo.name}</div>
        <div className="flex items-center gap-1.5 truncate text-[11px] text-fg-muted">
          <span className="truncate font-mono">
            {repo.head_branch ?? "detached"}
          </span>
          {(repo.ahead > 0 || repo.behind > 0) && (
            <span className="shrink-0 tabular-nums">
              {repo.ahead > 0 && <span className="text-warning">↑{repo.ahead}</span>}
              {repo.ahead > 0 && repo.behind > 0 && " "}
              {repo.behind > 0 && <span className="text-danger">↓{repo.behind}</span>}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function Sidebar() {
  const collapsed = useShellStore((s) => s.sidebarCollapsed);
  const openScan = useShellStore((s) => s.openScan);
  const openClone = useShellStore((s) => s.openClone);
  const repos = useReposStore((s) => s.repos);
  const addRepos = useReposStore((s) => s.addRepos);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) => r.name.toLowerCase().includes(q));
  }, [repos, query]);

  const handleAdd = async () => {
    setError(null);
    const dir = await open({
      directory: true,
      multiple: false,
      title: "选择仓库目录",
    });
    if (typeof dir !== "string") return;
    try {
      await addRepos([dir]);
    } catch (e) {
      setError(typeof e === "string" ? e : "添加仓库失败");
    }
  };

  if (collapsed) return null;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border-subtle bg-surface">
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
        <div className="relative flex-1">
          <Search
            size={13}
            strokeWidth={1.5}
            className="absolute top-1/2 left-2 -translate-y-1/2 text-fg-muted"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索仓库"
            className="h-7 w-full rounded-md border border-border-subtle bg-base pr-2 pl-7 text-fg-primary transition-colors duration-120 outline-none placeholder:text-fg-muted focus:border-accent"
          />
        </div>
        <button
          type="button"
          onClick={openScan}
          title="扫描根目录"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-base text-fg-secondary transition-colors duration-120 hover:border-border-default hover:text-fg-primary"
        >
          <FolderSearch size={14} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={handleAdd}
          title="添加仓库"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-base text-fg-secondary transition-colors duration-120 hover:border-border-default hover:text-fg-primary"
        >
          <Plus size={14} strokeWidth={1.5} />
        </button>
      </div>

      {error && (
        <div className="mx-3 mb-1 rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-[11px] text-danger">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2">
        <div className="px-1 py-2 text-[11px] font-medium tracking-wide text-fg-muted uppercase">
          仓库（{filtered.length}）
        </div>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md px-2 py-6 text-center text-[12px] text-fg-muted">
            <FolderOpen size={18} strokeWidth={1.5} className="text-fg-muted" />
            <span>{repos.length === 0 ? "还没有仓库" : "无匹配仓库"}</span>
            {repos.length === 0 && (
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={handleAdd}
                  className="text-[12px] text-accent hover:underline"
                >
                  点击 + 添加本地仓库
                </button>
                <button
                  type="button"
                  onClick={openScan}
                  className="text-[12px] text-accent hover:underline"
                >
                  扫描根目录
                </button>
                <button
                  type="button"
                  onClick={openClone}
                  className="text-[12px] text-accent hover:underline"
                >
                  从 GitHub 克隆
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 pb-2">
            {filtered.map((repo) => (
              <RepoListItem key={repo.path} repo={repo} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
