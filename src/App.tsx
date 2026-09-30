import TitleBar from "./components/shell/TitleBar";
import Sidebar from "./components/shell/Sidebar";
import Dashboard from "./components/dashboard/Dashboard";
import ScanDialog from "./components/shell/ScanDialog";
import RepoView from "./components/repo/RepoView";
import { useReposStore } from "./store/repos";

function App() {
  const selectedPath = useReposStore((s) => s.selectedPath);

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
    </div>
  );
}

export default App;
