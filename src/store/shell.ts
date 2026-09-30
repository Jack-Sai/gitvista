import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ShellState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: "gitvista-shell" },
  ),
);
