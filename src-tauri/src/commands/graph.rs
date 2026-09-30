use git2::{Oid, Repository, Sort};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RefKind {
    LocalBranch,
    RemoteBranch,
    Tag,
    Head,
}

#[derive(Serialize, Clone)]
pub struct CommitRef {
    pub name: String,
    pub kind: RefKind,
}

#[derive(Serialize, Clone)]
pub struct GraphCommit {
    pub id: String,
    pub short_id: String,
    pub summary: String,
    pub author_name: String,
    pub author_email: String,
    pub time: i64,
    pub parents: Vec<String>,
    pub refs: Vec<CommitRef>,
}

#[derive(Serialize, Clone)]
pub struct LaneLine {
    pub lane: u8,
    pub color: u8,
}

#[derive(Serialize, Clone)]
pub struct LaneEdge {
    pub from: u8,
    pub to: u8,
    pub color: u8,
    pub from_top: bool,
}

#[derive(Serialize, Clone)]
pub struct GraphRow {
    pub commit: GraphCommit,
    pub node: LaneLine,
    pub throughs: Vec<LaneLine>,
    pub edges: Vec<LaneEdge>,
    pub lane_count: u8,
}

#[derive(Serialize)]
pub struct GraphPage {
    pub rows: Vec<GraphRow>,
    pub total: usize,
    pub start: usize,
}

struct WalkItem {
    id: Oid,
    parents: Vec<Oid>,
    summary: String,
    author_name: String,
    author_email: String,
    time: i64,
}

fn short_name(full: &str) -> Option<(String, RefKind)> {
    if let Some(name) = full.strip_prefix("refs/heads/") {
        return Some((name.to_string(), RefKind::LocalBranch));
    }
    if let Some(name) = full.strip_prefix("refs/remotes/") {
        return Some((name.to_string(), RefKind::RemoteBranch));
    }
    if let Some(name) = full.strip_prefix("refs/tags/") {
        return Some((name.to_string(), RefKind::Tag));
    }
    if full == "HEAD" {
        return Some(("HEAD".to_string(), RefKind::Head));
    }
    None
}

fn collect_refs(repo: &Repository) -> HashMap<Oid, Vec<CommitRef>> {
    let mut map: HashMap<Oid, Vec<CommitRef>> = HashMap::new();
    if let Ok(references) = repo.references() {
        for reference in references.flatten() {
            let Some(full) = reference.name().map(String::from) else {
                continue;
            };
            let Some((name, kind)) = short_name(&full) else {
                continue;
            };
            let Ok(commit) = reference.peel_to_commit() else {
                continue;
            };
            map.entry(commit.id())
                .or_default()
                .push(CommitRef { name, kind });
        }
    }
    map
}

fn sort_refs(refs: &mut Vec<CommitRef>) {
    let rank = |k: &RefKind| match k {
        RefKind::Head => 0,
        RefKind::LocalBranch => 1,
        RefKind::RemoteBranch => 2,
        RefKind::Tag => 3,
    };
    refs.sort_by_key(|r| rank(&r.kind));
}

fn pick_color(used: &[u8], fallback: usize) -> u8 {
    (0u8..8)
        .find(|c| !used.contains(c))
        .unwrap_or((fallback % 8) as u8)
}

fn find_or_push(slots: &mut Vec<Option<(Oid, u8)>>) -> usize {
    if let Some(i) = slots.iter().position(|s| s.is_none()) {
        return i;
    }
    slots.push(None);
    slots.len() - 1
}

fn layout(
    items: &[WalkItem],
    refs_map: &HashMap<Oid, Vec<CommitRef>>,
) -> Vec<GraphRow> {
    let mut slots: Vec<Option<(Oid, u8)>> = Vec::new();
    let mut rows = Vec::with_capacity(items.len());

    for item in items {
        let existing = slots
            .iter()
            .position(|s| matches!(s, Some((o, _)) if *o == item.id));
        let (lane, color, created) = match existing {
            Some(p) => {
                let c = slots[p].unwrap().1;
                (p, c, false)
            }
            None => {
                let p = find_or_push(&mut slots);
                let used: Vec<u8> =
                    slots.iter().flatten().map(|(_, c)| *c).collect();
                let c = pick_color(&used, p);
                slots[p] = Some((item.id, c));
                (p, c, true)
            }
        };

        let throughs: Vec<LaneLine> = slots
            .iter()
            .enumerate()
            .filter(|(i, s)| *i != lane && s.is_some())
            .map(|(i, s)| LaneLine {
                lane: i as u8,
                color: s.unwrap().1,
            })
            .collect();

        slots[lane] = None;
        let from_top = !created;
        let mut edges = Vec::new();

        for (idx, parent) in item.parents.iter().enumerate() {
            let target = if let Some(q) = slots
                .iter()
                .position(|s| matches!(s, Some((o, _)) if o == parent))
            {
                q
            } else if idx == 0 {
                slots[lane] = Some((*parent, color));
                lane
            } else {
                let q = find_or_push(&mut slots);
                let used: Vec<u8> =
                    slots.iter().flatten().map(|(_, c)| *c).collect();
                let c = pick_color(&used, q);
                slots[q] = Some((*parent, c));
                q
            };
            edges.push(LaneEdge {
                from: lane as u8,
                to: target as u8,
                color,
                from_top,
            });
        }

        let mut refs = refs_map.get(&item.id).cloned().unwrap_or_default();
        sort_refs(&mut refs);

        let lane_count = slots
            .iter()
            .rposition(|s| s.is_some())
            .map(|i| i + 1)
            .unwrap_or(1);

        rows.push(GraphRow {
            commit: GraphCommit {
                id: item.id.to_string(),
                short_id: item.id.to_string()[..7].to_string(),
                summary: item.summary.clone(),
                author_name: item.author_name.clone(),
                author_email: item.author_email.clone(),
                time: item.time,
                parents: item.parents.iter().map(|p| p.to_string()).collect(),
                refs,
            },
            node: LaneLine {
                lane: lane as u8,
                color,
            },
            throughs,
            edges,
            lane_count: lane_count as u8,
        });
    }

    rows
}

fn build_revwalk<'a>(
    repo: &'a Repository,
) -> Result<git2::Revwalk<'a>, String> {
    let mut revwalk = repo.revwalk().map_err(|e| e.message().to_string())?;
    revwalk
        .set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(|e| e.message().to_string())?;
    revwalk.push_head().ok();
    revwalk.push_glob("refs/heads/*").ok();
    revwalk.push_glob("refs/remotes/*").ok();
    revwalk.push_glob("refs/tags/*").ok();
    Ok(revwalk)
}

#[tauri::command]
pub fn get_commit_graph(
    repo_path: String,
    start: usize,
    count: usize,
) -> Result<GraphPage, String> {
    let repo = Repository::discover(&repo_path)
        .map_err(|e| format!("无法打开仓库: {}", e.message()))?;
    let count = count.min(1000);

    let total = build_revwalk(&repo)?.count();

    let limit = start.saturating_add(count);
    let mut items: Vec<WalkItem> = Vec::new();
    for (i, oid) in build_revwalk(&repo)?.enumerate() {
        if i >= limit {
            break;
        }
        let oid = oid.map_err(|e| e.message().to_string())?;
        let commit =
            repo.find_commit(oid).map_err(|e| e.message().to_string())?;
        items.push(WalkItem {
            id: oid,
            parents: commit.parent_ids().collect(),
            summary: commit.summary().unwrap_or("").to_string(),
            author_name: commit.author().name().unwrap_or("").to_string(),
            author_email: commit.author().email().unwrap_or("").to_string(),
            time: commit.time().seconds(),
        });
    }

    let refs_map = collect_refs(&repo);
    let all_rows = layout(&items, &refs_map);
    let rows: Vec<GraphRow> = all_rows.into_iter().skip(start).collect();

    Ok(GraphPage {
        rows,
        total,
        start,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn oid(n: u8) -> Oid {
        Oid::from_str(&format!("{:040x}", n)).unwrap()
    }

    fn item(n: u8, parents: &[u8]) -> WalkItem {
        WalkItem {
            id: oid(n),
            parents: parents.iter().map(|p| oid(*p)).collect(),
            summary: format!("commit {}", n),
            author_name: "tester".to_string(),
            author_email: "t@example.com".to_string(),
            time: 1_700_000_000 + n as i64,
        }
    }

    fn refs_map() -> HashMap<Oid, Vec<CommitRef>> {
        HashMap::new()
    }

    #[test]
    fn linear_history_single_lane() {
        let items = vec![item(3, &[2]), item(2, &[1]), item(1, &[])];
        let rows = layout(&items, &refs_map());
        assert_eq!(rows.len(), 3);
        for row in &rows {
            assert_eq!(row.node.lane, 0);
            assert_eq!(row.lane_count, 1);
        }
        for row in &rows[..2] {
            assert_eq!(row.edges.len(), 1);
            assert_eq!(row.edges[0].from, 0);
            assert_eq!(row.edges[0].to, 0);
        }
        assert!(rows[2].edges.is_empty());
    }

    #[test]
    fn branch_and_merge() {
        let items = vec![
            item(4, &[2, 3]),
            item(2, &[1]),
            item(3, &[1]),
            item(1, &[]),
        ];
        let rows = layout(&items, &refs_map());

        let merge = &rows[0];
        assert_eq!(merge.node.lane, 0);
        assert_eq!(merge.lane_count, 2);
        assert_eq!(merge.edges.len(), 2);
        assert_eq!((merge.edges[0].from, merge.edges[0].to), (0, 0));
        assert_eq!((merge.edges[1].from, merge.edges[1].to), (0, 1));
        assert!(!merge.edges[0].from_top);
        assert_eq!(merge.edges[0].color, 0);

        let b = &rows[1];
        assert_eq!(b.node.lane, 0);
        assert_eq!(b.throughs.len(), 1);
        assert_eq!(b.throughs[0].lane, 1);
        assert_eq!(b.throughs[0].color, 1);

        let c = &rows[2];
        assert_eq!(c.node.lane, 1);
        assert_eq!(c.node.color, 1);
        assert_eq!(c.throughs.len(), 1);
        assert_eq!(c.throughs[0].lane, 0);
        assert_eq!(c.edges.len(), 1);
        assert_eq!((c.edges[0].from, c.edges[0].to), (1, 0));
        assert!(c.edges[0].from_top);

        let root = &rows[3];
        assert_eq!(root.node.lane, 0);
        assert!(root.edges.is_empty());
        assert!(root.throughs.is_empty());
        assert_eq!(root.lane_count, 1);
    }

    #[test]
    fn three_way_branch() {
        let items = vec![
            item(5, &[4]),
            item(4, &[3]),
            item(3, &[1]),
            item(2, &[1]),
            item(1, &[]),
        ];
        let rows = layout(&items, &refs_map());
        assert_eq!(rows.len(), 5);
        for row in &rows {
            assert!(row.lane_count >= 1);
        }
        assert_eq!(rows[4].node.lane, 0);
        assert!(rows[4].edges.is_empty());
    }
}
