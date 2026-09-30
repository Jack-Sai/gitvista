import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import type { RepoSummary } from "../types/repo";

interface ReposState {
  repos: RepoSummary[];
  selectedPath: string | null;
  addRepo: (path: string) => Promise<void>;
  addRepos: (paths: string[]) => Promise<void>;
  removeRepo: (path: string) => void;
  selectRepo: (path: string | null) => void;
  refreshRepo: (path: string) => Promise<void>;
  refreshAll: () => Promise<void>;
}

export const useReposStore = create<ReposState>()(
  persist(
    (set, get) => ({
      repos: [],
      selectedPath: null,

      addRepo: async (path) => {
        try {
          const summary = await invoke<RepoSummary>("open_repository", {
            path,
          });
          set((s) => {
            const rest = s.repos.filter((r) => r.path !== summary.path);
            return { repos: [...rest, summary] };
          });
        } catch (e) {
          console.error("open_repository failed:", e);
          throw e;
        }
      },

      addRepos: async (paths) => {
        for (const path of paths) {
          await get().addRepo(path);
        }
      },

      removeRepo: (path) =>
        set((s) => ({
          repos: s.repos.filter((r) => r.path !== path),
          selectedPath: s.selectedPath === path ? null : s.selectedPath,
        })),

      selectRepo: (path) => set({ selectedPath: path }),

      refreshRepo: async (path) => {
        try {
          const summary = await invoke<RepoSummary>("open_repository", {
            path,
          });
          set((s) => ({
            repos: s.repos.map((r) => (r.path === summary.path ? summary : r)),
          }));
        } catch (e) {
          console.error("refresh_repo failed:", e);
        }
      },

      refreshAll: async () => {
        const paths = get().repos.map((r) => r.path);
        await Promise.all(paths.map((p) => get().refreshRepo(p)));
      },
    }),
    {
      name: "gitvista-repos",
      partialize: (s) => ({ repos: s.repos, selectedPath: s.selectedPath }),
    },
  ),
);
