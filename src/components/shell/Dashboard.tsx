import { FolderGit2, Moon, Plus, Sun } from "lucide-react";
import { useThemeStore } from "../../store/theme";

export default function Dashboard() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const isDark =
    mode === "dark" ||
    (mode === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-base">
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
        <button
          type="button"
          className="mt-1 flex h-8 items-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-medium text-white transition-colors duration-120 hover:bg-accent-hover"
        >
          <Plus size={14} strokeWidth={2} />
          添加仓库
        </button>
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
