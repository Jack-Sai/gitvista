export type RefKind = "local_branch" | "remote_branch" | "tag" | "head";

export interface CommitRef {
  name: string;
  kind: RefKind;
}

export interface GraphCommit {
  id: string;
  short_id: string;
  summary: string;
  author_name: string;
  author_email: string;
  time: number;
  parents: string[];
  refs: CommitRef[];
}

export interface LaneLine {
  lane: number;
  color: number;
}

export interface LaneEdge {
  from: number;
  to: number;
  color: number;
  from_top: boolean;
}

export interface GraphRow {
  commit: GraphCommit;
  node: LaneLine;
  throughs: LaneLine[];
  edges: LaneEdge[];
  lane_count: number;
}

export interface GraphPage {
  rows: GraphRow[];
  total: number;
  start: number;
}

export const REF_STYLES: Record<RefKind, string> = {
  local_branch: "border-accent/50 bg-accent/10 text-accent",
  remote_branch: "border-border-default bg-hover text-fg-secondary",
  tag: "border-purple/50 bg-purple/10 text-purple",
  head: "border-success/50 bg-success/10 text-success",
};
