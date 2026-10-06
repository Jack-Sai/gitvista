import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ShellState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  scanOpen: boolean;
  openScan: () => void;
  closeScan: () => void;
  drawerOpen: boolean;
  toggleDrawer: () => void;
  cloneOpen: boolean;
  openClone: () => void;
  closeClone: () => void;
}

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      scanOpen: false,
      openScan: () => set({ scanOpen: true }),
      closeScan: () => set({ scanOpen: false }),
      drawerOpen: true,
      toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
      cloneOpen: false,
      openClone: () => set({ cloneOpen: true }),
      closeClone: () => set({ cloneOpen: false }),
    }),
    {
      name: "gitvista-shell",
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        drawerOpen: s.drawerOpen,
      }),
    },
  ),
);
