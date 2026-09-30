import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SortKey = "name" | "activity" | "changes" | "aheadbehind";
export type ViewMode = "card" | "list";

interface DashboardState {
  view: ViewMode;
  sort: SortKey;
  setView: (view: ViewMode) => void;
  setSort: (sort: SortKey) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      view: "card",
      sort: "activity",
      setView: (view) => set({ view }),
      setSort: (sort) => set({ sort }),
    }),
    { name: "gitvista-dashboard" },
  ),
);
