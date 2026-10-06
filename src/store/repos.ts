import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import type { RepoSummary } from "../types/repo";

interface ReposState {
  repos: RepoSummary[];
  selectedPath: string | null;
  favorites: string[];
  recentPaths: string[];
  order: string[];
  addRepo: (path: string) => Promise<void>;
  addRepos: (paths: string[]) => Promise<void>;
  removeRepo: (path: string) => void;
  selectRepo: (path: string | null) => void;
  refreshRepo: (path: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  toggleFavorite: (path: string) => void;
  setOrder: (paths: string[]) => void;
}

function applyOrder(repos: RepoSummary[], order: string[]): RepoSummary[] {
  const rank = new Map(order.map((p, i) => [p, i]));
  return [...repos].sort((a, b) => {
    const ra = rank.has(a.path) ? rank.get(a.path)! : order.length;
    const rb = rank.has(b.path) ? rank.get(b.path)! : order.length;
    if (ra !== rb) return ra - rb;
    return repos.indexOf(a) - repos.indexOf(b);
  });
}

export const useReposStore = create<ReposState>()(
  persist(
    (set, get) => ({
      repos: [],
      selectedPath: null,
      favorites: [],
      recentPaths: [],
      order: [],

      addRepo: async (path) => {
        try {
          const summary = await invoke<RepoSummary>("open_repository", {
            path,
          });
          set((s) => {
            const rest = s.repos.filter((r) => r.path !== summary.path);
            const known = s.repos.some((r) => r.path === summary.path);
            return {
              repos: [...rest, summary],
              order: known ? s.order : [...s.order, summary.path],
            };
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
          favorites: s.favorites.filter((p) => p !== path),
          recentPaths: s.recentPaths.filter((p) => p !== path),
          order: s.order.filter((p) => p !== path),
        })),

      selectRepo: (path) =>
        set((s) => ({
          selectedPath: path,
          recentPaths: path
            ? [path, ...s.recentPaths.filter((p) => p !== path)].slice(0, 10)
            : s.recentPaths,
        })),

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

      toggleFavorite: (path) =>
        set((s) => ({
          favorites: s.favorites.includes(path)
            ? s.favorites.filter((p) => p !== path)
            : [...s.favorites, path],
        })),

      setOrder: (paths) => set({ order: paths }),
    }),
    {
      name: "gitvista-repos",
      partialize: (s) => ({
        repos: s.repos,
        selectedPath: s.selectedPath,
        favorites: s.favorites,
        recentPaths: s.recentPaths,
        order: s.order,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<ReposState> | undefined;
        return {
          ...current,
          ...p,
          repos: applyOrder(p?.repos ?? current.repos, p?.order ?? []),
        };
      },
    },
  ),
);
