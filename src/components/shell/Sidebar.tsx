import { Plus, Search } from "lucide-react";
import { useShellStore } from "../../store/shell";

export default function Sidebar() {
  const collapsed = useShellStore((s) => s.sidebarCollapsed);

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
            placeholder="搜索仓库"
            className="h-7 w-full rounded-md border border-border-subtle bg-base pr-2 pl-7 text-fg-primary transition-colors duration-120 outline-none placeholder:text-fg-muted focus:border-accent"
          />
        </div>
        <button
          type="button"
          title="添加仓库"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-base text-fg-secondary transition-colors duration-120 hover:border-border-default hover:text-fg-primary"
        >
          <Plus size={14} strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        <div className="px-1 py-2 text-[11px] font-medium tracking-wide text-fg-muted uppercase">
          仓库
        </div>
        <div className="rounded-md px-2 py-6 text-center text-[12px] text-fg-muted">
          还没有仓库
          <div className="mt-1 text-[11px] text-fg-muted/70">
            点击 + 添加本地仓库
          </div>
        </div>
      </div>
    </aside>
  );
}
