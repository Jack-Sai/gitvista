import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FolderSearch, Loader2, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useShellStore } from "../../store/shell";
import { useReposStore } from "../../store/repos";

interface ScannedRepo {
  path: string;
  name: string;
}

type Phase = "idle" | "scanning" | "results" | "adding" | "error";

export default function ScanDialog() {
  const scanOpen = useShellStore((s) => s.scanOpen);
  const closeScan = useShellStore((s) => s.closeScan);
  const repos = useReposStore((s) => s.repos);
  const addRepo = useReposStore((s) => s.addRepo);

  const [phase, setPhase] = useState<Phase>("idle");
  const [root, setRoot] = useState("");
  const [found, setFound] = useState<ScannedRepo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [addedCount, setAddedCount] = useState(0);
  const [totalToAdd, setTotalToAdd] = useState(0);

  useEffect(() => {
    if (scanOpen) {
      setPhase("idle");
      setRoot("");
      setFound([]);
      setSelected(new Set());
      setError("");
      setAddedCount(0);
      setTotalToAdd(0);
    }
  }, [scanOpen]);

  const existingPaths = useMemo(
    () => new Set(repos.map((r) => r.path)),
    [repos],
  );

  const newFound = useMemo(
    () => found.filter((f) => !existingPaths.has(f.path)),
    [found, existingPaths],
  );

  const runScan = async () => {
    const dir = await open({
      directory: true,
      multiple: false,
      title: "选择要扫描的根目录",
    });
    if (typeof dir !== "string") return;
    setRoot(dir);
    setPhase("scanning");
    setError("");
    try {
      const result = await invoke<ScannedRepo[]>("scan_repositories", {
        root: dir,
        ignoreDirs: [],
      });
      setFound(result);
      setSelected(new Set(result.map((r) => r.path)));
      setPhase("results");
    } catch (e) {
      setError(typeof e === "string" ? e : "扫描失败");
      setPhase("error");
    }
  };

  const toggleOne = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === found.length
        ? new Set()
        : new Set(found.map((r) => r.path)),
    );
  };

  const runAdd = async () => {
    const paths = found.filter((r) => selected.has(r.path)).map((r) => r.path);
    setPhase("adding");
    setTotalToAdd(paths.length);
    setAddedCount(0);
    let done = 0;
    let failed = 0;
    for (const path of paths) {
      try {
        await addRepo(path);
      } catch {
        failed += 1;
      }
      done += 1;
      setAddedCount(done);
    }
    if (failed > 0) setError(`${failed} 个仓库添加失败`);
    closeScan();
  };

  const selectedCount = found.filter((r) => selected.has(r.path)).length;

  return (
    <AnimatePresence>
      {scanOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={closeScan}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[560px] max-w-[90vw] rounded-lg border border-border-default bg-elevated shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-fg-primary">
                <FolderSearch size={16} strokeWidth={1.5} className="text-accent" />
                扫描仓库目录
              </div>
              <button
                type="button"
                onClick={closeScan}
                className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted transition-colors duration-120 hover:bg-hover hover:text-fg-primary"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>

            <div className="max-h-[400px] overflow-y-auto p-4">
              {phase === "idle" && (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <div className="text-[13px] text-fg-secondary">
                    选择一个根目录，递归扫描其下所有 Git 仓库并批量加入。
                  </div>
                  <button
                    type="button"
                    onClick={runScan}
                    className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-4 text-[13px] font-medium text-white transition-colors duration-120 hover:bg-accent-hover"
                  >
                    选择根目录
                  </button>
                </div>
              )}

              {phase === "scanning" && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 size={20} className="animate-spin text-accent" />
                  <div className="text-[13px] text-fg-secondary">
                    正在扫描...
                  </div>
                  <div className="max-w-full truncate font-mono text-[11px] text-fg-muted">
                    {root}
                  </div>
                </div>
              )}

              {phase === "error" && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
                    {error}
                  </div>
                  <button
                    type="button"
                    onClick={runScan}
                    className="text-[13px] text-accent hover:underline"
                  >
                    重试
                  </button>
                </div>
              )}

              {(phase === "results" || phase === "adding") && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-fg-secondary">
                      已发现 {found.length} 个仓库
                      {found.length - newFound.length > 0 && (
                        <span className="text-fg-muted">
                          （{found.length - newFound.length} 个已存在）
                        </span>
                      )}
                    </span>
                    <label className="flex cursor-pointer items-center gap-1.5 text-fg-secondary">
                      <input
                        type="checkbox"
                        checked={selectedCount === found.length && found.length > 0}
                        onChange={toggleAll}
                        disabled={phase === "adding"}
                      />
                      全选
                    </label>
                  </div>

                  <div className="flex flex-col gap-0.5 rounded-md border border-border-subtle bg-surface p-1">
                    {found.map((repo) => {
                      const exists = existingPaths.has(repo.path);
                      return (
                        <label
                          key={repo.path}
                          className={`flex items-center gap-2 rounded-sm px-2 py-1.5 transition-colors duration-120 ${
                            exists
                              ? "opacity-50"
                              : "cursor-pointer hover:bg-hover"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(repo.path)}
                            onChange={() => toggleOne(repo.path)}
                            disabled={exists || phase === "adding"}
                          />
                          <span className="text-[13px] text-fg-primary">
                            {repo.name}
                          </span>
                          <span className="ml-auto truncate font-mono text-[11px] text-fg-muted">
                            {repo.path}
                          </span>
                        </label>
                      );
                    })}
                    {found.length === 0 && (
                      <div className="px-2 py-4 text-center text-[13px] text-fg-muted">
                        未发现任何仓库
                      </div>
                    )}
                  </div>

                  {phase === "adding" && (
                    <div className="text-[12px] text-fg-secondary">
                      正在添加 {addedCount} / {totalToAdd}...
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
              <button
                type="button"
                onClick={closeScan}
                className="h-7 rounded-md border border-border-default px-3 text-[13px] text-fg-secondary transition-colors duration-120 hover:bg-hover hover:text-fg-primary"
              >
                {phase === "adding" ? "关闭" : "取消"}
              </button>
              {phase === "results" && (
                <button
                  type="button"
                  onClick={runAdd}
                  disabled={selectedCount === 0}
                  className="h-7 rounded-md bg-accent px-3.5 text-[13px] font-medium text-white transition-colors duration-120 hover:bg-accent-hover disabled:opacity-50"
                >
                  添加选中（{selectedCount}）
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
