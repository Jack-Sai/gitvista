import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FolderOpen, GitFork, Loader2, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useShellStore } from "../../store/shell";
import { useReposStore } from "../../store/repos";

interface GitOpResult {
  success: boolean;
  output: string;
  error: string;
}

export default function CloneDialog() {
  const cloneOpen = useShellStore((s) => s.cloneOpen);
  const closeClone = useShellStore((s) => s.closeClone);
  const addRepo = useReposStore((s) => s.addRepo);

  const [url, setUrl] = useState("");
  const [target, setTarget] = useState("");
  const [branch, setBranch] = useState("");
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (cloneOpen) {
      setUrl("");
      setTarget("");
      setBranch("");
      setError("");
      setCloning(false);
    }
  }, [cloneOpen]);

  const pickTarget = async () => {
    const dir = await open({
      directory: true,
      multiple: false,
      title: "选择克隆目标目录",
    });
    if (typeof dir === "string") setTarget(dir);
  };

  const repoName = (() => {
    const trimmed = url.trim().replace(/\/+$/, "");
    const base = trimmed.split("/").pop() ?? "";
    return base.replace(/\.git$/, "");
  })();

  const canClone =
    url.trim().length > 0 && target.trim().length > 0 && repoName.length > 0;

  const runClone = async () => {
    if (!canClone) return;
    setCloning(true);
    setError("");
    const dest = `${target.replace(/[\\/]+$/, "")}\\${repoName}`;
    try {
      const result = await invoke<GitOpResult>("git_clone", {
        url: url.trim(),
        target: dest,
        branch: branch.trim() || null,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      await addRepo(dest);
      closeClone();
    } catch (e) {
      setError(typeof e === "string" ? e : "clone 失败");
    } finally {
      setCloning(false);
    }
  };

  const inputClass =
    "h-8 w-full rounded-md border border-border-subtle bg-base px-2.5 text-[13px] text-fg-primary outline-none transition-colors duration-120 placeholder:text-fg-muted focus:border-accent";

  return (
    <AnimatePresence>
      {cloneOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={cloning ? undefined : closeClone}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[520px] max-w-[90vw] rounded-lg border border-border-default bg-elevated shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-fg-primary">
                <GitFork size={16} strokeWidth={1.5} className="text-accent" />
                克隆仓库
              </div>
              <button
                type="button"
                onClick={closeClone}
                disabled={cloning}
                className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted transition-colors duration-120 hover:bg-hover hover:text-fg-primary"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex flex-col gap-3 p-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-fg-secondary">
                  仓库 URL
                </span>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  className={inputClass}
                  disabled={cloning}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-fg-secondary">
                  目标目录（将创建仓库名子目录）
                </span>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="E:\projects"
                    className={`${inputClass} font-mono text-[12px]`}
                    disabled={cloning}
                  />
                  <button
                    type="button"
                    onClick={pickTarget}
                    disabled={cloning}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-subtle text-fg-secondary transition-colors duration-120 hover:bg-hover hover:text-fg-primary"
                  >
                    <FolderOpen size={14} strokeWidth={1.5} />
                  </button>
                </div>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-fg-secondary">
                  分支（可选）
                </span>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="留空使用默认分支"
                  className={inputClass}
                  disabled={cloning}
                />
              </label>

              {error && (
                <div className="whitespace-pre-wrap rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
              <button
                type="button"
                onClick={closeClone}
                disabled={cloning}
                className="h-7 rounded-md border border-border-default px-3 text-[13px] text-fg-secondary transition-colors duration-120 hover:bg-hover hover:text-fg-primary disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={runClone}
                disabled={!canClone || cloning}
                className="flex h-7 items-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-medium text-white transition-colors duration-120 hover:bg-accent-hover disabled:opacity-50"
              >
                {cloning && <Loader2 size={12} className="animate-spin" />}
                {cloning ? "克隆中..." : "克隆"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
