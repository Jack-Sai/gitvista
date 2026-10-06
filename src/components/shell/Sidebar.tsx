import { useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FolderSearch,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useShellStore } from "../../store/shell";
import { useReposStore } from "../../store/repos";
import { repoStatusKind, type RepoSummary } from "../../types/repo";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";

const STATUS_DOT: Record<string, string> = {
  clean: "bg-success",
  dirty: "bg-warning",
  conflict: "bg-danger",
  unknown: "bg-fg-muted",
};

function sortByOrder(repos: RepoSummary[], order: string[]): RepoSummary[] {
  const rank = new Map(order.map((p, i) => [p, i]));
  return [...repos].sort((a, b) => {
    const ra = rank.has(a.path) ? rank.get(a.path)! : order.length;
    const rb = rank.has(b.path) ? rank.get(b.path)! : order.length;
    if (ra !== rb) return ra - rb;
    return repos.indexOf(a) - repos.indexOf(b);
  });
}

interface RepoListItemProps {
  repo: RepoSummary;
  favorite: boolean;
  draggable: boolean;
  dropHint: "before" | "after" | null;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: () => void;
  onDragOver: (e: React.MouseEvent) => void;
  onDrop: () => void;
}

function RepoListItem({
  repo,
  favorite,
  draggable,
  dropHint,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
}: RepoListItemProps) {
  const selectedPath = useReposStore((s) => s.selectedPath);
  const selectRepo = useReposStore((s) => s.selectRepo);
  const selected = selectedPath === repo.path;
  const kind = repoStatusKind(repo);

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", repo.path);
        onDragStart();
      }}
      onDragOver={(e) => {
        if (!draggable) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver(e);
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (draggable) onDrop();
      }}
      onContextMenu={onContextMenu}
      onClick={() => selectRepo(repo.path)}
      className={`group flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-120 ${
        selected ? "bg-hover" : "hover:bg-hover"
      } ${dropHint === "before" ? "border-t-2 border-t-accent" : ""} ${
        dropHint === "after" ? "border-b-2 border-b-accent" : ""
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
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
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] text-fg-primary">
            {repo.name}
          </span>
          {favorite && (
            <Star
              size={10}
              strokeWidth={1.5}
              className="shrink-0 fill-warning text-warning"
            />
          )}
        </div>
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

function GroupHeader({
  label,
  count,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1 px-1 py-2 text-[11px] font-medium tracking-wide text-fg-muted uppercase transition-colors duration-120 hover:text-fg-secondary"
    >
      {collapsed ? (
        <ChevronRight size={11} strokeWidth={1.5} />
      ) : (
        <ChevronDown size={11} strokeWidth={1.5} />
      )}
      {label}（{count}）
    </button>
  );
}

export default function Sidebar() {
  const collapsed = useShellStore((s) => s.sidebarCollapsed);
  const openScan = useShellStore((s) => s.openScan);
  const openSettings = useShellStore((s) => s.openSettings);
  const groupsCollapsed = useShellStore((s) => s.groupsCollapsed);
  const toggleGroup = useShellStore((s) => s.toggleGroup);
  const repos = useReposStore((s) => s.repos);
  const order = useReposStore((s) => s.order);
  const favorites = useReposStore((s) => s.favorites);
  const recentPaths = useReposStore((s) => s.recentPaths);
  const addRepos = useReposStore((s) => s.addRepos);
  const removeRepo = useReposStore((s) => s.removeRepo);
  const toggleFavorite = useReposStore((s) => s.toggleFavorite);
  const setOrder = useReposStore((s) => s.setOrder);
  const selectedPath = useReposStore((s) => s.selectedPath);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<
    { x: number; y: number; repo: RepoSummary } | null
  >(null);
  const [dropTarget, setDropTarget] = useState<{
    path: string;
    position: "before" | "after";
  } | null>(null);
  const dragPathRef = useRef<string | null>(null);

  const ordered = useMemo(() => sortByOrder(repos, order), [repos, order]);

  const searching = query.trim().length > 0;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((r) => r.name.toLowerCase().includes(q));
  }, [ordered, query]);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const recentSet = useMemo(() => {
    const s = new Set(recentPaths);
    favorites.forEach((p) => s.delete(p));
    return s;
  }, [recentPaths, favorites]);

  const favoriteRepos = useMemo(
    () => ordered.filter((r) => favoriteSet.has(r.path)),
    [ordered, favoriteSet],
  );
  const recentRepos = useMemo(
    () =>
      recentPaths
        .filter((p) => recentSet.has(p))
        .map((p) => ordered.find((r) => r.path === p))
        .filter((r): r is RepoSummary => !!r),
    [recentPaths, recentSet, ordered],
  );
  const restRepos = useMemo(
    () =>
      ordered.filter(
        (r) => !favoriteSet.has(r.path) && !recentSet.has(r.path),
      ),
    [ordered, favoriteSet, recentSet],
  );

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

  const menuItems = (repo: RepoSummary): ContextMenuItem[] => [
    {
      label: "打开",
      disabled: selectedPath === repo.path,
      onClick: () => useReposStore.getState().selectRepo(repo.path),
    },
    {
      label: favoriteSet.has(repo.path) ? "取消收藏" : "收藏",
      icon: Star,
      onClick: () => toggleFavorite(repo.path),
    },
    {
      label: "在文件管理器中显示",
      separatorBefore: true,
      onClick: () => {
        void revealItemInDir(repo.path).catch(() => {});
      },
    },
    {
      label: "从列表移除",
      icon: Trash2,
      danger: true,
      onClick: () => removeRepo(repo.path),
    },
  ];

  const handleDragOver = (
    e: React.MouseEvent,
    targetPath: string,
    rect: DOMRect,
  ) => {
    if (!dragPathRef.current || dragPathRef.current === targetPath) return;
    const position =
      e.clientY - rect.top < rect.height / 2 ? "before" : "after";
    setDropTarget((prev) =>
      prev && prev.path === targetPath && prev.position === position
        ? prev
        : { path: targetPath, position },
    );
  };

  const handleDrop = (targetPath: string) => {
    const src = dragPathRef.current;
    dragPathRef.current = null;
    setDropTarget(null);
    if (!src || src === targetPath) return;
    const list = ordered.map((r) => r.path).filter((p) => p !== src);
    const idx = list.indexOf(targetPath);
    if (idx < 0) return;
    const position = dropTarget?.path === targetPath ? dropTarget.position : "after";
    list.splice(position === "before" ? idx : idx + 1, 0, src);
    setOrder(list);
  };

  const renderItem = (repo: RepoSummary, allowDrag: boolean) => (
    <RepoListItem
      key={repo.path}
      repo={repo}
      favorite={favoriteSet.has(repo.path)}
      draggable={allowDrag && !searching}
      dropHint={
        dropTarget?.path === repo.path && dragPathRef.current !== repo.path
          ? dropTarget.position
          : null
      }
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, repo });
      }}
      onDragStart={() => {
        dragPathRef.current = repo.path;
      }}
      onDragOver={(e) =>
        handleDragOver(e, repo.path, e.currentTarget.getBoundingClientRect())
      }
      onDrop={() => handleDrop(repo.path)}
    />
  );

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

      <div className="flex-1 overflow-y-auto px-2 pb-2"
        onDragEnd={() => {
          dragPathRef.current = null;
          setDropTarget(null);
        }}
      >
        {repos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md px-2 py-6 text-center text-[12px] text-fg-muted">
            <FolderOpen size={18} strokeWidth={1.5} className="text-fg-muted" />
            <span>还没有仓库</span>
            <div className="flex flex-col gap-1">
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
            </div>
          </div>
        ) : searching ? (
          <div className="flex flex-col gap-0.5 pt-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-4 text-center text-[12px] text-fg-muted">
                无匹配仓库
              </div>
            ) : (
              filtered.map((repo) => renderItem(repo, false))
            )}
          </div>
        ) : (
          <>
            {favoriteRepos.length > 0 && (
              <div>
                <GroupHeader
                  label="收藏"
                  count={favoriteRepos.length}
                  collapsed={groupsCollapsed.favorite}
                  onToggle={() => toggleGroup("favorite")}
                />
                {!groupsCollapsed.favorite && (
                  <div className="flex flex-col gap-0.5">
                    {favoriteRepos.map((repo) => renderItem(repo, false))}
                  </div>
                )}
              </div>
            )}

            {recentRepos.length > 0 && (
              <div>
                <GroupHeader
                  label="最近打开"
                  count={recentRepos.length}
                  collapsed={groupsCollapsed.recent}
                  onToggle={() => toggleGroup("recent")}
                />
                {!groupsCollapsed.recent && (
                  <div className="flex flex-col gap-0.5">
                    {recentRepos.map((repo) => renderItem(repo, false))}
                  </div>
                )}
              </div>
            )}

            <div>
              <GroupHeader
                label="全部"
                count={restRepos.length}
                collapsed={groupsCollapsed.all}
                onToggle={() => toggleGroup("all")}
              />
              {!groupsCollapsed.all && (
                <div className="flex flex-col gap-0.5">
                  {restRepos.map((repo) => renderItem(repo, true))}
                  {restRepos.length === 0 && (
                    <div className="px-2 py-3 text-center text-[12px] text-fg-muted">
                      无仓库
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end border-t border-border-subtle px-2 py-1.5">
        <button
          type="button"
          onClick={openSettings}
          title="设置（⌘/Ctrl + ,）"
          className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors duration-120 hover:bg-hover hover:text-fg-primary"
        >
          <Settings size={14} strokeWidth={1.5} />
        </button>
      </div>

      <AnimatePresence>
        {menu && (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={menuItems(menu.repo)}
            onClose={() => setMenu(null)}
          />
        )}
      </AnimatePresence>
    </aside>
  );
}
