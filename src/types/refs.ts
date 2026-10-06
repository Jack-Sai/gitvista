export interface RefInfo {
  name: string;
  is_head: boolean;
  is_merged: boolean;
  ahead: number;
  behind: number;
  upstream: string | null;
  last_commit_time: number;
}

export interface RefsList {
  locals: RefInfo[];
  remotes: RefInfo[];
  tags: RefInfo[];
  head: string;
}

export interface CompareCommit {
  id: string;
  short_id: string;
  summary: string;
  author_name: string;
  time: number;
}

export interface CompareFile {
  path: string;
  status: string;
}

export interface CompareResult {
  ahead: CompareCommit[];
  behind: CompareCommit[];
  files: CompareFile[];
}
