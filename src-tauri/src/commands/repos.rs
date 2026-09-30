use git2::{BranchType, Repository, StatusOptions};
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;

const DEFAULT_IGNORES: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    "vendor",
    ".cache",
    ".venv",
    "venv",
];

#[derive(Serialize)]
pub struct ScannedRepo {
    pub path: String,
    pub name: String,
}

#[derive(Serialize)]
pub struct RepoSummary {
    pub path: String,
    pub name: String,
    pub head_branch: Option<String>,
    pub is_clean: bool,
    pub has_conflict: bool,
    pub changed_count: u32,
    pub ahead: usize,
    pub behind: usize,
    pub last_commit_time: Option<i64>,
    pub last_commit_summary: Option<String>,
}

fn dir_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn is_ignored(name: &str, ignores: &[String]) -> bool {
    DEFAULT_IGNORES.contains(&name) || ignores.iter().any(|i| i == name)
}

fn git_key(dir: &Path) -> String {
    let git = dir.join(".git");
    if git.is_file() {
        if let Ok(content) = std::fs::read_to_string(&git) {
            return content
                .lines()
                .find(|l| l.starts_with("gitdir:"))
                .map(|l| l[7..].trim().to_string())
                .unwrap_or_else(|| dir.display().to_string());
        }
    }
    git.canonicalize()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| git.display().to_string())
}

fn scan_dir(
    dir: &Path,
    ignores: &[String],
    depth: u32,
    seen: &mut HashSet<String>,
    out: &mut Vec<ScannedRepo>,
) {
    if depth > 8 {
        return;
    }
    if dir.join(".git").exists() {
        let key = git_key(dir);
        if seen.insert(key) {
            out.push(ScannedRepo {
                path: dir.display().to_string(),
                name: dir_name(dir),
            });
        }
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() || file_type.is_symlink() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || is_ignored(&name, ignores) {
            continue;
        }
        scan_dir(&path, ignores, depth + 1, seen, out);
    }
}

#[tauri::command]
pub fn scan_repositories(
    root: String,
    ignore_dirs: Vec<String>,
) -> Result<Vec<ScannedRepo>, String> {
    let root = Path::new(&root);
    if !root.is_dir() {
        return Err("目录不存在".to_string());
    }
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    scan_dir(root, &ignore_dirs, 0, &mut seen, &mut out);
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

fn ahead_behind(repo: &Repository) -> (usize, usize) {
    let Ok(head) = repo.head() else {
        return (0, 0);
    };
    if !head.is_branch() {
        return (0, 0);
    }
    let Some(name) = head.shorthand().map(String::from) else {
        return (0, 0);
    };
    let Ok(branch) = repo.find_branch(&name, BranchType::Local) else {
        return (0, 0);
    };
    let Ok(upstream) = branch.upstream() else {
        return (0, 0);
    };
    let (Some(local_oid), Some(up_oid)) = (head.target(), upstream.get().target())
    else {
        return (0, 0);
    };
    repo.graph_ahead_behind(local_oid, up_oid)
        .unwrap_or((0, 0))
}

fn last_commit(repo: &Repository) -> (Option<i64>, Option<String>) {
    let Ok(head) = repo.head() else {
        return (None, None);
    };
    let Ok(commit) = head.peel_to_commit() else {
        return (None, None);
    };
    let time = commit.time().seconds();
    let summary = commit.summary().map(String::from);
    (Some(time), summary)
}

#[tauri::command]
pub fn open_repository(path: String) -> Result<RepoSummary, String> {
    let repo = Repository::discover(&path)
        .map_err(|e| format!("无法打开仓库: {}", e.message()))?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| "不支持裸仓库".to_string())?;
    let clean_path = workdir
        .to_string_lossy()
        .trim_end_matches(['/', '\\'])
        .to_string();

    let mut opts = StatusOptions::new();
    opts.include_untracked(true).include_unmodified(false);
    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| format!("读取状态失败: {}", e.message()))?;

    let mut has_conflict = false;
    let mut changed_count = 0u32;
    for entry in statuses.iter() {
        let status = entry.status();
        if status.contains(git2::Status::CONFLICTED) {
            has_conflict = true;
        }
        if status.is_empty() || status.contains(git2::Status::IGNORED) {
            continue;
        }
        changed_count += 1;
    }

    let head_branch = match repo.head() {
        Ok(head) if head.is_branch() => head.shorthand().map(String::from),
        _ => None,
    };
    let (ahead, behind) = ahead_behind(&repo);
    let (last_commit_time, last_commit_summary) = last_commit(&repo);

    Ok(RepoSummary {
        name: dir_name(Path::new(&clean_path)),
        path: clean_path,
        head_branch,
        is_clean: changed_count == 0,
        has_conflict,
        changed_count,
        ahead,
        behind,
        last_commit_time,
        last_commit_summary,
    })
}
