export interface RepoSummary {
  path: string;
  name: string;
  head_branch: string | null;
  is_clean: boolean;
  has_conflict: boolean;
  changed_count: number;
  ahead: number;
  behind: number;
  last_commit_time: number | null;
  last_commit_summary: string | null;
}

export type RepoStatusKind = "clean" | "dirty" | "conflict" | "unknown";

export function repoStatusKind(repo?: RepoSummary): RepoStatusKind {
  if (!repo) return "unknown";
  if (repo.has_conflict) return "conflict";
  if (!repo.is_clean) return "dirty";
  return "clean";
}
