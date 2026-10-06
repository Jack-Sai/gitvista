import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

export interface ContextMenuItem {
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  separatorBefore?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = x + rect.width > window.innerWidth - 8 ? x - rect.width : x;
    const ny =
      y + rect.height > window.innerHeight - 8 ? y - rect.height : y;
    setPos({ x: Math.max(4, nx), y: Math.max(4, ny) });
  }, [x, y]);

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.1 }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[60] min-w-44 rounded-md border border-border-default bg-elevated py-1 shadow-lg"
    >
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`}>
          {item.separatorBefore && (
            <div className="my-1 h-px bg-border-subtle" />
          )}
          <button
            type="button"
            disabled={item.disabled}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors duration-120 hover:bg-hover disabled:opacity-40 ${
              item.danger ? "text-danger" : "text-fg-secondary hover:text-fg-primary"
            }`}
          >
            {item.icon && <item.icon size={13} strokeWidth={1.5} />}
            {item.label}
          </button>
        </div>
      ))}
    </motion.div>
  );
}
