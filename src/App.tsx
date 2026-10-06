import { useEffect } from "react";
import TitleBar from "./components/shell/TitleBar";
import Sidebar from "./components/shell/Sidebar";
import Dashboard from "./components/dashboard/Dashboard";
import ScanDialog from "./components/shell/ScanDialog";
import CloneDialog from "./components/shell/CloneDialog";
import RepoView from "./components/repo/RepoView";
import { useReposStore } from "./store/repos";
import { useShellStore } from "./store/shell";
import { useThemeStore } from "./store/theme";

function App() {
  const selectedPath = useReposStore((s) => s.selectedPath);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const shell = useShellStore.getState();
      if (e.key === "Escape") {
        if (shell.scanOpen) shell.closeScan();
        else if (shell.cloneOpen) shell.closeClone();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "b" && !e.shiftKey) {
        e.preventDefault();
        shell.toggleSidebar();
      } else if (key === "j" && !e.shiftKey) {
        e.preventDefault();
        shell.toggleDrawer();
      } else if (key === "t" && e.shiftKey) {
        e.preventDefault();
        useThemeStore.getState().toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-base text-fg-primary">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedPath ? (
            <RepoView repoPath={selectedPath} />
          ) : (
            <Dashboard />
          )}
        </main>
      </div>
      <ScanDialog />
      <CloneDialog />
    </div>
  );
}

export default App;
