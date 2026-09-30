import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";

interface DiffResult {
  patch: string;
  additions: number;
  deletions: number;
}

interface DiffViewProps {
  repoPath: string;
  filePath: string | null;
  staged: boolean;
}

function renderLine(line: string, key: number) {
  if (line.startsWith("+++") || line.startsWith("---")) {
    return (
      <div key={key} className="text-fg-secondary">
        {line || "\u00a0"}
      </div>
    );
  }
  if (line.startsWith("@@")) {
    return (
      <div key={key} className="bg-accent/10 text-accent">
        {line || "\u00a0"}
      </div>
    );
  }
  if (line.startsWith("+")) {
    return (
      <div key={key} className="bg-success/10 text-success">
        {line || "\u00a0"}
      </div>
    );
  }
  if (line.startsWith("-")) {
    return (
      <div key={key} className="bg-danger/10 text-danger">
        {line || "\u00a0"}
      </div>
    );
  }
  if (line.startsWith("\\")) {
    return (
      <div key={key} className="text-fg-muted">
        {line || "\u00a0"}
      </div>
    );
  }
  return <div key={key}>{line || "\u00a0"}</div>;
}

export default function DiffView({ repoPath, filePath, staged }: DiffViewProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["diff", repoPath, filePath, staged],
    queryFn: () =>
      invoke<DiffResult>("get_diff", {
        repoPath,
        path: filePath,
        staged,
      }),
    enabled: filePath !== null,
  });

  if (!filePath) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-fg-muted">
        选择文件查看改动
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 size={16} className="animate-spin text-accent" />
      </div>
    );
  }

  const lines = (data?.patch ?? "").split("\n");

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-8 shrink-0 items-center gap-3 border-b border-border-subtle px-3 text-[12px]">
        <span className="truncate font-mono text-fg-primary">{filePath}</span>
        <span className="ml-auto shrink-0 font-mono tabular-nums">
          <span className="text-success">+{data?.additions ?? 0}</span>{" "}
          <span className="text-danger">-{data?.deletions ?? 0}</span>
        </span>
      </div>
      <div className="flex-1 overflow-auto bg-surface py-1 font-mono text-[12px] leading-[1.6] whitespace-pre">
        {lines.length === 1 && lines[0] === "" ? (
          <div className="px-3 py-2 text-fg-muted">无差异</div>
        ) : (
          lines.map((line, i) => renderLine(line, i))
        )}
      </div>
    </div>
  );
}
