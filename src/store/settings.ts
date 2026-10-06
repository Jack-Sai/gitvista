import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  githubClientId: string;
  setGithubClientId: (v: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      githubClientId: "",
      setGithubClientId: (v) => set({ githubClientId: v }),
    }),
    { name: "gitvista-settings" },
  ),
);
