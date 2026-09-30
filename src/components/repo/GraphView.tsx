import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { ClipboardCheck, Loader2 } from "lucide-react";
import type { GraphPage } from "../../types/graph";
import { REF_STYLES } from "../../types/graph";
import { absoluteTime, relativeTime } from "../../lib/time";
import { useThemeStore } from "../../store/theme";

const ROW_H = 32;
const PAGE_SIZE = 300;
const LANE_MIN = 80;
const LANE_MAX = 200;
const LANE_PAD = 14;

const AVATAR_COLORS = [
  "#2563EB",
  "#8250DF",
  "#1A7F37",
  "#9A6700",
  "#CF222E",
  "#0969DA",
  "#BF3989",
  "#1B7C83",
];

function avatarColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function lanePalette(): string[] {
  const styles = getComputedStyle(document.documentElement);
  return Array.from({ length: 8 }, (_, i) =>
    styles.getPropertyValue(`--lane-0${i + 1}`).trim(),
  );
}

function RefBadge({ name, kind }: { name: string; kind: keyof typeof REF_STYLES }) {
  return (
    <span
      className={`inline-flex h-[18px] max-w-32 shrink-0 items-center truncate rounded-sm border px-1.5 font-mono text-[11px] ${REF_STYLES[kind]}`}
    >
      {name}
    </span>
  );
}

interface GraphViewProps {
  repoPath: string;
}

export default function GraphView({ repoPath }: GraphViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const themeMode = useThemeStore((s) => s.mode);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useInfiniteQuery({
      queryKey: ["commits", repoPath],
      queryFn: ({ pageParam }) =>
        invoke<GraphPage>("get_commit_graph", {
          repoPath,
          start: pageParam,
          count: PAGE_SIZE,
        }),
      initialPageParam: 0,
      getNextPageParam: (last) =>
        last.start + last.rows.length < last.total
          ? last.start + last.rows.length
          : undefined,
    });

  const rows = useMemo(
    () => data?.pages.flatMap((p) => p.rows) ?? [],
    [data],
  );

  const maxLane = useMemo(
    () => Math.min(Math.max(...rows.map((r) => r.lane_count), 1), 16),
    [rows],
  );

  const laneWidth = useMemo(() => {
    const ideal = LANE_PAD * 2 + maxLane * 14;
    return Math.min(Math.max(ideal, LANE_MIN), LANE_MAX);
  }, [maxLane]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const scroll = scrollRef.current;
    if (!canvas || !scroll || rows.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = scroll.clientWidth;
    const h = scroll.clientHeight;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const palette = lanePalette();
    const cellW = Math.max((laneWidth - 8) / Math.max(maxLane, 1), 8);
    const x = (lane: number) => 6 + lane * cellW + cellW / 2;
    const scrollTop = scroll.scrollTop;
    const items = virtualizer.getVirtualItems();

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const item of items) {
      const row = rows[item.index];
      if (!row) continue;

      const top = item.start - scrollTop;
      const center = top + ROW_H / 2;
      const bottom = top + ROW_H;
      const isHovered = hoveredIndex === item.index;

      ctx.lineWidth = isHovered ? 2.5 : 1.5;

      for (const t of row.throughs) {
        ctx.strokeStyle = palette[t.color % palette.length];
        ctx.beginPath();
        ctx.moveTo(x(t.lane), top);
        ctx.lineTo(x(t.lane), bottom);
        ctx.stroke();
      }

      for (const e of row.edges) {
        ctx.strokeStyle = palette[e.color % palette.length];
        const xFrom = x(e.from);
        const xTo = x(e.to);
        const y0 = e.from_top ? top : center;
        ctx.beginPath();
        ctx.moveTo(xFrom, y0);
        if (e.from === e.to) {
          ctx.lineTo(xFrom, bottom);
        } else {
          ctx.lineTo(xFrom, center);
          ctx.lineTo(xTo, center);
          ctx.lineTo(xTo, bottom);
        }
        ctx.stroke();
      }

      const selected = selectedId === row.commit.id;
      ctx.beginPath();
      ctx.arc(x(row.node.lane), center, selected ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = palette[row.node.color % palette.length];
      ctx.fill();
      if (selected) {
        const base = getComputedStyle(document.documentElement)
          .getPropertyValue("--bg-base")
          .trim();
        ctx.lineWidth = 2;
        ctx.strokeStyle = base;
        ctx.stroke();
      }
    }
  }, [rows, hoveredIndex, selectedId, laneWidth, maxLane, virtualizer]);

  useEffect(() => {
    draw();
  }, [draw, themeMode]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    scroll.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroll.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [draw]);

  useEffect(() => {
    const items = virtualizer.getVirtualItems();
    const last = items[items.length - 1];
    if (
      last &&
      last.index >= rows.length - 60 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  });

  const copyHash = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 size={20} className="animate-spin text-accent" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-danger">
        加载提交历史失败
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-fg-muted">
        没有提交记录
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="relative flex-1 overflow-y-auto">
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute top-0 left-0 z-0"
        style={{ willChange: "transform" }}
      />
      <div
        style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        className="z-10"
      >
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          if (!row) return null;
          const selected = selectedId === row.commit.id;
          return (
            <div
              key={item.key}
              ref={virtualizer.measureElement}
              data-index={item.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${item.start}px)`,
              }}
              className={`flex cursor-pointer items-center border-b border-border-subtle/50 text-[13px] transition-colors duration-120 ${
                selected ? "bg-accent/10" : "hover:bg-hover/60"
              }`}
              onClick={() =>
                setSelectedId((prev) =>
                  prev === row.commit.id ? null : row.commit.id,
                )
              }
              onMouseEnter={() => setHoveredIndex(item.index)}
              onMouseLeave={() => setHoveredIndex((i) =>
                i === item.index ? null : i,
              )}
            >
              <div style={{ width: laneWidth }} className="shrink-0" />

              <div className="flex min-w-0 flex-[3] items-center gap-2 pr-2">
                <span className="truncate text-fg-primary" title={row.commit.summary}>
                  {row.commit.summary || "(无提交信息)"}
                </span>
              </div>

              <div className="flex w-28 shrink-0 items-center gap-1.5 pr-2">
                <span
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                  style={{
                    backgroundColor: avatarColor(row.commit.author_email),
                  }}
                  title={`${row.commit.author_name} <${row.commit.author_email}>`}
                >
                  {(row.commit.author_name[0] || "?").toUpperCase()}
                </span>
                <span className="truncate text-[12px] text-fg-secondary">
                  {row.commit.author_name}
                </span>
              </div>

              <button
                type="button"
                onClick={(e) => copyHash(e, row.commit.id)}
                title={`${row.commit.id}（点击复制）`}
                className="flex w-20 shrink-0 items-center justify-start gap-1 font-mono text-[12px] text-fg-muted transition-colors duration-120 hover:text-accent"
              >
                {copiedId === row.commit.id ? (
                  <ClipboardCheck size={12} className="text-success" />
                ) : null}
                {row.commit.short_id}
              </button>

              <span
                className="w-24 shrink-0 pr-2 text-right text-[12px] text-fg-muted"
                title={absoluteTime(row.commit.time)}
              >
                {relativeTime(row.commit.time)}
              </span>

              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden pr-3">
                {row.commit.refs.map((ref) => (
                  <RefBadge key={`${ref.kind}:${ref.name}`} name={ref.name} kind={ref.kind} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {isFetchingNextPage && (
        <div className="flex items-center justify-center gap-2 py-3 text-[12px] text-fg-muted">
          <Loader2 size={13} className="animate-spin" />
          加载更多提交...
        </div>
      )}
    </div>
  );
}
