import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronDown,
  ChevronRight,
  Check,
  GitBranch,
  Loader2,
  Plus,
  Tag,
} from "lucide-react";
import type { RefInfo } from "../../types/refs";
import { absoluteTime } from "../../lib/time";

interface RefSidebarProps {
  repoPath: string;
  currentBranch: string | null;
  onCheckout: (branchName: string, force?: boolean) => Promise<void>;
  onError: (msg: string) => void;
}

function RefRow({
  refInfo,
  onCheckout,
}: {
  refInfo: RefInfo;
  onCheckout: (name: string) => void;
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

  const { data, isLoading } = useQuery({
    queryKey: ["refs", repoPath],
    queryFn: () => invoke<import("../../types/refs").RefsList>("list_refs", { repoPath }),
  });

  const locals = useMemo(() => data?.locals ?? [], [data]);

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

  const group = (
    key: "local" | "remote" | "tag",
    label: string,
    count: number,
    icon: React.ReactNode,
    items: RefInfo[],
    onCheckoutRow: (name: string) => void,
  ) => (
    <div>
      <button
        type="button"
        onClick={() =>
          setCollapsed((c) => ({ ...c, [key]: !c[key] }))
        }
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
          {items.map((r) => (
            <RefRow key={`${key}:${r.name}`} refInfo={r} onCheckout={onCheckoutRow} />
          ))}
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
            )}
            {group(
              "remote",
              "远程分支",
              data?.remotes.length ?? 0,
              <GitBranch size={11} strokeWidth={1.5} className="opacity-60" />,
              data?.remotes ?? [],
              (name) => void checkoutRemote(name),
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
    </aside>
  );
}
