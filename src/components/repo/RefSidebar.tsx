import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronDown,
  ChevronRight,
  Check,
  GitBranch,
  GitMerge,
  Loader2,
  Plus,
  Tag,
  Trash2,
  Pencil,
  Upload,
} from "lucide-react";
import type { RefInfo, RefsList } from "../../types/refs";
import { absoluteTime } from "../../lib/time";
import ContextMenu, { type ContextMenuItem } from "../shell/ContextMenu";
import ConfirmDialog, { type ConfirmOptions } from "../shell/ConfirmDialog";

interface GitOpResult {
  success: boolean;
  output: string;
  error: string;
}

interface RefSidebarProps {
  repoPath: string;
  currentBranch: string | null;
  onCheckout: (branchName: string, force?: boolean) => Promise<void>;
  onMutated: () => Promise<void>;
  onError: (msg: string) => void;
}

interface MenuState {
  x: number;
  y: number;
  kind: "local" | "remote";
  ref: RefInfo;
}

function RefRow({
  refInfo,
  onCheckout,
  onContextMenu,
}: {
  refInfo: RefInfo;
  onCheckout: (name: string) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const aheadBehind =
    refInfo.ahead > 0 || refInfo.behind > 0 ? (
      <span className="shrink-0 font-mono text-[10px] tabular-nums">
        {refInfo.ahead > 0 && (
          <span className="text-warning">↑{refInfo.ahead}</span>
        )}
        {refInfo.ahead > 0 && refInfo.behind > 0 && " "}
        {refInfo.behind > 0 && (
          <span className="text-danger">↓{refInfo.behind}</span>
        )}
      </span>
    ) : null;

  return (
    <button
      type="button"
      onClick={() => !refInfo.is_head && onCheckout(refInfo.name)}
      onContextMenu={onContextMenu}
      title={`${refInfo.name}\n最后提交: ${absoluteTime(refInfo.last_commit_time)}`}
      className={`group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors duration-120 ${
        refInfo.is_head
          ? "bg-accent/10 text-accent"
          : "text-fg-secondary hover:bg-hover hover:text-fg-primary"
      }`}
    >
      {refInfo.is_head && (
        <Check size={11} strokeWidth={2} className="shrink-0 text-accent" />
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
        {refInfo.name}
      </span>
      {aheadBehind}
    </button>
  );
}

export default function RefSidebar({
  repoPath,
  currentBranch,
  onCheckout,
  onMutated,
  onError,
}: RefSidebarProps) {
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState({
    local: false,
    remote: false,
    tag: false,
  });
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<{ name: string; value: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["refs", repoPath],
    queryFn: () => invoke<RefsList>("list_refs", { repoPath }),
  });

  const locals = useMemo(() => data?.locals ?? [], [data]);

  const invokeOp = async (cmd: string, args: Record<string, unknown>, failMsg: string) => {
    try {
      const res = await invoke<GitOpResult>(cmd, args);
      if (!res.success) {
        onError(res.error || failMsg);
        return;
      }
      await onMutated();
    } catch (e) {
      onError(typeof e === "string" ? e : failMsg);
    }
  };

  const createBranch = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await invoke("create_branch", { repoPath, branchName: name });
      setNewName("");
      setCreating(false);
      await queryClient.invalidateQueries({ queryKey: ["refs", repoPath] });
      await onCheckout(name);
    } catch (e) {
      onError(typeof e === "string" ? e : "创建分支失败");
    } finally {
      setBusy(false);
    }
  };

  const checkoutRemote = async (remoteName: string) => {
    const short = remoteName.includes("/")
      ? remoteName.slice(remoteName.indexOf("/") + 1)
      : remoteName;
    if (!locals.some((l) => l.name === short)) {
      try {
        await invoke("create_branch", {
          repoPath,
          branchName: short,
          fromRef: remoteName,
        });
      } catch (e) {
        onError(typeof e === "string" ? e : "创建本地分支失败");
        return;
      }
    }
    await onCheckout(short);
  };

  const deleteBranch = (name: string) => {
    setConfirm({
      title: "删除分支",
      message: `确定删除本地分支「${name}」？\n未合并的提交将无法通过该分支找回。`,
      confirmLabel: "删除",
      danger: true,
      onConfirm: () => {
        void (async () => {
          try {
            const res = await invoke<GitOpResult>("delete_branch", {
              repoPath,
              branchName: name,
              force: false,
            });
            if (res.success) {
              await onMutated();
              return;
            }
            setConfirm({
              title: "强制删除分支",
              message: `${res.error}\n\n继续将强制删除该分支。`,
              confirmLabel: "强制删除",
              danger: true,
              onConfirm: () =>
                void invokeOp(
                  "delete_branch",
                  { repoPath, branchName: name, force: true },
                  "删除分支失败",
                ),
            });
          } catch (e) {
            onError(typeof e === "string" ? e : "删除分支失败");
          }
        })();
      },
    });
  };

  const deleteRemoteBranch = (remoteName: string) => {
    const short = remoteName.includes("/")
      ? remoteName.slice(remoteName.indexOf("/") + 1)
      : remoteName;
    setConfirm({
      title: "删除远程分支",
      message: `确定从 origin 删除远程分支「${short}」？`,
      confirmLabel: "删除",
      danger: true,
      onConfirm: () =>
        void invokeOp(
          "git_push_refspec",
          { repoPath, refspec: `:refs/heads/${short}`, force: false },
          "删除远程分支失败",
        ),
    });
  };

  const submitRename = async () => {
    if (!renaming) return;
    const value = renaming.value.trim();
    if (!value || value === renaming.name) {
      setRenaming(null);
      return;
    }
    try {
      const res = await invoke<GitOpResult>("rename_branch", {
        repoPath,
        oldName: renaming.name,
        newName: value,
      });
      if (!res.success) {
        onError(res.error || "重命名失败");
        return;
      }
      setRenaming(null);
      await onMutated();
    } catch (e) {
      onError(typeof e === "string" ? e : "重命名失败");
    }
  };

  const menuItems = (): ContextMenuItem[] => {
    if (!menu) return [];
    const { kind, ref } = menu;
    if (kind === "remote") {
      return [
        {
          label: "切换到此分支",
          icon: GitBranch,
          onClick: () => void checkoutRemote(ref.name),
        },
        {
          label: "删除远程分支",
          icon: Trash2,
          danger: true,
          separatorBefore: true,
          onClick: () => deleteRemoteBranch(ref.name),
        },
      ];
    }
    const isHead = ref.is_head;
    return [
      {
        label: "切换到此分支",
        icon: GitBranch,
        disabled: isHead,
        onClick: () => void onCheckout(ref.name),
      },
      {
        label: "合并到当前分支",
        icon: GitMerge,
        disabled: isHead,
        separatorBefore: true,
        onClick: () =>
          void invokeOp(
            "merge_branch",
            { repoPath, branchName: ref.name },
            "合并失败",
          ),
      },
      {
        label: "变基当前分支到此分支",
        icon: GitMerge,
        disabled: isHead,
        onClick: () =>
          setConfirm({
            title: "变基",
            message: `将当前分支变基到「${ref.name}」。\n变基会改写当前分支的提交历史。`,
            confirmLabel: "开始变基",
            danger: true,
            onConfirm: () =>
              void invokeOp(
                "rebase_branch",
                { repoPath, target: ref.name },
                "变基失败",
              ),
          }),
      },
      {
        label: "推送到 origin",
        icon: Upload,
        separatorBefore: true,
        onClick: () =>
          void invokeOp(
            "git_push_refspec",
            {
              repoPath,
              refspec: `refs/heads/${ref.name}:refs/heads/${ref.name}`,
              force: false,
            },
            "推送失败",
          ),
      },
      {
        label: "重命名…",
        icon: Pencil,
        separatorBefore: true,
        onClick: () => setRenaming({ name: ref.name, value: ref.name }),
      },
      {
        label: "删除…",
        icon: Trash2,
        danger: true,
        disabled: isHead,
        onClick: () => deleteBranch(ref.name),
      },
    ];
  };

  const group = (
    key: "local" | "remote" | "tag",
    label: string,
    count: number,
    icon: React.ReactNode,
    items: RefInfo[],
    onCheckoutRow: (name: string) => void,
    menuKind?: "local" | "remote",
  ) => (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium tracking-wide text-fg-muted uppercase transition-colors duration-120 hover:text-fg-secondary"
      >
        {collapsed[key] ? (
          <ChevronRight size={11} strokeWidth={1.5} />
        ) : (
          <ChevronDown size={11} strokeWidth={1.5} />
        )}
        {icon}
        <span className="flex-1 text-left">{label}</span>
        <span className="tabular-nums">{count}</span>
      </button>
      {!collapsed[key] && (
        <div className="flex flex-col gap-0.5 px-1 pb-1">
          {items.map((r) =>
            key === "local" && renaming?.name === r.name ? (
              <div key={`${key}:${r.name}`} className="px-0.5">
                <input
                  autoFocus
                  type="text"
                  value={renaming.value}
                  onChange={(e) =>
                    setRenaming({ name: r.name, value: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitRename();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  onBlur={() => void submitRename()}
                  className="h-6 w-full rounded-md border border-accent bg-base px-1.5 font-mono text-[12px] text-fg-primary outline-none"
                />
              </div>
            ) : (
              <RefRow
                key={`${key}:${r.name}`}
                refInfo={r}
                onCheckout={onCheckoutRow}
                onContextMenu={
                  menuKind
                    ? (e) => {
                        e.preventDefault();
                        setMenu({ x: e.clientX, y: e.clientY, kind: menuKind, ref: r });
                      }
                    : undefined
                }
              />
            ),
          )}
          {items.length === 0 && (
            <div className="px-2 py-1 text-[11px] text-fg-muted">无</div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-border-subtle bg-surface">
      <div className="flex items-center gap-1 px-2 pt-2.5 pb-1">
        <GitBranch size={13} strokeWidth={1.5} className="text-fg-secondary" />
        <span className="flex-1 text-[12px] font-medium text-fg-primary">
          {currentBranch ?? "detached"}
        </span>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          title="新建分支"
          className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted transition-colors duration-120 hover:bg-hover hover:text-fg-primary"
        >
          <Plus size={13} strokeWidth={1.5} />
        </button>
      </div>

      {creating && (
        <div className="mx-2 mb-1 flex gap-1">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createBranch();
              if (e.key === "Escape") {
                setCreating(false);
                setNewName("");
              }
            }}
            placeholder="分支名，回车创建"
            className="h-7 min-w-0 flex-1 rounded-md border border-border-subtle bg-base px-2 font-mono text-[12px] text-fg-primary outline-none placeholder:font-sans placeholder:text-fg-muted focus:border-accent"
          />
          <button
            type="button"
            onClick={() => void createBranch()}
            disabled={busy || !newName.trim()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-white transition-colors duration-120 hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Plus size={13} strokeWidth={2} />
            )}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={14} className="animate-spin text-fg-muted" />
          </div>
        ) : (
          <>
            {group(
              "local",
              "本地分支",
              data?.locals.length ?? 0,
              <GitBranch size={11} strokeWidth={1.5} />,
              data?.locals ?? [],
              (name) => void onCheckout(name),
              "local",
            )}
            {group(
              "remote",
              "远程分支",
              data?.remotes.length ?? 0,
              <GitBranch size={11} strokeWidth={1.5} className="opacity-60" />,
              data?.remotes ?? [],
              (name) => void checkoutRemote(name),
              "remote",
            )}
            {group(
              "tag",
              "标签",
              data?.tags.length ?? 0,
              <Tag size={11} strokeWidth={1.5} />,
              data?.tags ?? [],
              () => {},
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {menu && (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={menuItems()}
            onClose={() => setMenu(null)}
          />
        )}
      </AnimatePresence>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </aside>
  );
}
