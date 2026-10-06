import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface ConfirmDialogProps {
  options: ConfirmOptions | null;
  onClose: () => void;
}

export default function ConfirmDialog({ options, onClose }: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {options && (
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
            className="w-[420px] max-w-[90vw] rounded-lg border border-border-default bg-elevated shadow-lg"
          >
            <div className="flex items-center gap-2 px-4 pt-4 pb-1">
              {options.danger && (
                <AlertTriangle size={16} strokeWidth={1.5} className="text-danger" />
              )}
              <div className="text-[14px] font-semibold text-fg-primary">
                {options.title}
              </div>
            </div>
            <div className="px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-secondary">
              {options.message}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
              <button
                type="button"
                onClick={onClose}
                className="h-7 rounded-md border border-border-default px-3 text-[13px] text-fg-secondary transition-colors duration-120 hover:bg-hover hover:text-fg-primary"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  options.onConfirm();
                  onClose();
                }}
                className={`h-7 rounded-md px-3.5 text-[13px] font-medium text-white transition-colors duration-120 ${
                  options.danger
                    ? "bg-danger hover:opacity-90"
                    : "bg-accent hover:bg-accent-hover"
                }`}
              >
                {options.confirmLabel ?? "确认"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
