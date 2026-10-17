import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, ArrowRight, Loader2, X, FileDiff } from "lucide-react";
import type { CompareResult } from "../../types/refs";
import { absoluteTime, relativeTime } from "../../lib/time";

interface CompareDialogProps {
  repoPath: string;
  base: string;
  target: string;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  Added: "新增",
  Modified: "修改",
  Deleted: "删除",
  Renamed: "重命名",
  Copied: "复制",
  Typechange: "类型变更",
  Untracked: "未跟踪",
};

export default function CompareDialog({ repoPath, base, target, onClose }: CompareDialogProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CompareResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    invoke<CompareResult>("compare_branches", { repoPath, base, target })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) setError(typeof e === "string" ? e : "比较失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath, base, target]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.12 }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[80vh] w-[720px] max-w-[92vw] flex-col overflow-hidden rounded-lg border border-border-default bg-elevated shadow-lg"
        >
          <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
            <span className="font-mono text-[13px] text-fg-secondary">{base}</span>
            <ArrowRight size={13} strokeWidth={1.5} className="text-fg-muted" />
            <span className="font-mono text-[13px] text-fg-primary">{target}</span>
            <span className="ml-auto text-[12px] text-fg-muted">比较分支</span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted transition-colors duration-120 hover:bg-hover hover:text-fg-primary"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-fg-muted">
              <Loader2 size={14} className="animate-spin" />
              正在比较…
            </div>
          ) : error ? (
            <div className="px-4 py-6 text-[13px] text-danger">{error}</div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 divide-x divide-border-subtle">
                <div className="p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-fg-muted uppercase">
                    <ArrowLeft size={11} strokeWidth={1.5} />
                    {base} 独有（{data?.behind.length ?? 0}）
                  </div>
                  <div className="flex flex-col gap-1">
                    {(data?.behind ?? []).map((c) => (
                      <div key={c.id} className="rounded-md px-2 py-1.5 hover:bg-hover">
                        <div className="truncate text-[12px] text-fg-primary">{c.summary}</div>
                        <div className="mt-0.5 flex gap-2 text-[11px] text-fg-muted">
                          <span className="font-mono">{c.short_id}</span>
                          <span>{c.author_name}</span>
                          <span title={absoluteTime(c.time)}>{relativeTime(c.time)}</span>
                        </div>
                      </div>
                    ))}
                    {(data?.behind.length ?? 0) === 0 && (
                      <div className="px-2 py-1 text-[12px] text-fg-muted">无</div>
                    )}
                  </div>
                </div>
                <div className="p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-fg-muted uppercase">
                    <ArrowRight size={11} strokeWidth={1.5} />
                    {target} 独有（{data?.ahead.length ?? 0}）
                  </div>
                  <div className="flex flex-col gap-1">
                    {(data?.ahead ?? []).map((c) => (
                      <div key={c.id} className="rounded-md px-2 py-1.5 hover:bg-hover">
                        <div className="truncate text-[12px] text-fg-primary">{c.summary}</div>
                        <div className="mt-0.5 flex gap-2 text-[11px] text-fg-muted">
                          <span className="font-mono">{c.short_id}</span>
                          <span>{c.author_name}</span>
                          <span title={absoluteTime(c.time)}>{relativeTime(c.time)}</span>
                        </div>
                      </div>
                    ))}
                    {(data?.ahead.length ?? 0) === 0 && (
                      <div className="px-2 py-1 text-[12px] text-fg-muted">无</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-border-subtle p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-fg-muted uppercase">
                  <FileDiff size={11} strokeWidth={1.5} />
                  变更文件（{data?.files.length ?? 0}）
                </div>
                <div className="flex flex-col">
                  {(data?.files ?? []).map((f) => (
                    <div
                      key={f.path}
                      className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-hover"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg-secondary">
                        {f.path}
                      </span>
                      <span className="shrink-0 text-[11px] text-fg-muted">
                        {STATUS_LABEL[f.status] ?? f.status}
                      </span>
                    </div>
                  ))}
                  {(data?.files.length ?? 0) === 0 && (
                    <div className="px-2 py-1 text-[12px] text-fg-muted">无文件差异</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
