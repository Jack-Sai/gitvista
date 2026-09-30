import { Command, GitBranch, Moon, PanelLeft, Settings, Sun } from "lucide-react";
import { useThemeStore } from "../../store/theme";
import { useShellStore } from "../../store/shell";

export default function TitleBar() {
  const mode = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const toggleSidebar = useShellStore((s) => s.toggleSidebar);
  const isDark =
    mode === "dark" ||
    (mode === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <header
      data-tauri-drag-region
      className="flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface px-3"
    >
      <button
        type="button"
        onClick={toggleSidebar}
        title="切换侧边栏 (⌘B)"
        className="flex h-7 w-7 items-center justify-center rounded-md text-fg-secondary transition-colors duration-120 hover:bg-hover hover:text-fg-primary"
      >
        <PanelLeft size={16} strokeWidth={1.5} />
      </button>

      <div className="flex items-center gap-2 pl-1">
        <GitBranch size={16} strokeWidth={1.5} className="text-accent" />
        <span className="text-[15px] font-semibold tracking-tight text-fg-primary">
          GitVista
        </span>
      </div>

      <div className="flex flex-1 justify-center">
        <button
          type="button"
          className="flex h-7 w-64 items-center gap-2 rounded-md border border-border-subtle bg-base px-2.5 text-fg-muted transition-colors duration-120 hover:border-border-default hover:text-fg-secondary"
        >
          <Command size={13} strokeWidth={1.5} />
          <span className="text-[12px]">输入命令...</span>
          <kbd className="ml-auto rounded-sm border border-border-subtle px-1 font-mono text-[10px] text-fg-muted">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggleTheme}
          title="切换主题 (⌘⇧T)"
          className="flex h-7 w-7 items-center justify-center rounded-md text-fg-secondary transition-colors duration-120 hover:bg-hover hover:text-fg-primary"
        >
          {isDark ? (
            <Sun size={16} strokeWidth={1.5} />
          ) : (
            <Moon size={16} strokeWidth={1.5} />
          )}
        </button>
        <button
          type="button"
          title="设置 (⌘,)"
          className="flex h-7 w-7 items-center justify-center rounded-md text-fg-secondary transition-colors duration-120 hover:bg-hover hover:text-fg-primary"
        >
          <Settings size={16} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
