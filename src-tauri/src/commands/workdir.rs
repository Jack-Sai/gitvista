use git2::{Commit, Delta, DiffFormat, DiffOptions, Repository, StatusOptions};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Clone)]
pub struct FileEntry {
    pub path: String,
    pub status: String,
}

#[derive(Serialize)]
pub struct WorktreeStatus {
    pub staged: Vec<FileEntry>,
    pub unstaged: Vec<FileEntry>,
    pub conflicts: Vec<FileEntry>,
}

#[derive(Serialize)]
pub struct DiffResult {
    pub patch: String,
    pub additions: u32,
    pub deletions: u32,
}

fn status_letter(delta: Delta) -> &'static str {
    match delta {
        Delta::Added => "A",
        Delta::Modified => "M",
        Delta::Deleted => "D",
        Delta::Renamed => "R",
        Delta::Copied => "C",
        Delta::Typechange => "T",
        Delta::Untracked => "A",
        Delta::Ignored => "",
        _ => "M",
    }
}

#[tauri::command]
pub fn get_worktree_status(repo_path: String) -> Result<WorktreeStatus, String> {
    let repo = Repository::discover(&repo_path)
        .map_err(|e| format!("无法打开仓库: {}", e.message()))?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .include_unmodified(false)
        .recurse_untracked_dirs(true);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| format!("读取状态失败: {}", e.message()))?;

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut conflicts = Vec::new();

    for entry in statuses.iter() {
        let status = entry.status();

        if status.contains(git2::Status::CONFLICTED) {
            if let Some(path) = entry.path() {
                conflicts.push(FileEntry {
                    path: path.to_string(),
                    status: "U".to_string(),
                });
            }
            continue;
        }

        if let Some(delta) = entry.head_to_index() {
            let letter = status_letter(delta.status());
            if !letter.is_empty() {
                if let Some(path) =
                    delta.new_file().path().or_else(|| entry.path().map(Path::new))
                {
                    staged.push(FileEntry {
                        path: path.to_string_lossy().into_owned(),
                        status: letter.to_string(),
                    });
                }
            }
        }

        if let Some(delta) = entry.index_to_workdir() {
            let letter = status_letter(delta.status());
            if !letter.is_empty() {
                if let Some(path) =
                    delta.new_file().path().or_else(|| entry.path().map(Path::new))
                {
                    unstaged.push(FileEntry {
                        path: path.to_string_lossy().into_owned(),
                        status: letter.to_string(),
                    });
                }
            }
        }
    }

    staged.sort_by(|a, b| a.path.cmp(&b.path));
    unstaged.sort_by(|a, b| a.path.cmp(&b.path));
    conflicts.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(WorktreeStatus {
        staged,
        unstaged,
        conflicts,
    })
}

#[tauri::command]
pub fn stage_files(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    let repo = Repository::discover(&repo_path)
        .map_err(|e| format!("无法打开仓库: {}", e.message()))?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    for path in &paths {
        index
            .add_path(Path::new(path))
            .map_err(|e| format!("暂存 {} 失败: {}", path, e.message()))?;
    }
    index.write().map_err(|e| e.message().to_string())?;
    Ok(())
}

#[tauri::command]
pub fn unstage_files(
    repo_path: String,
    paths: Vec<String>,
) -> Result<(), String> {
    let repo = Repository::discover(&repo_path)
        .map_err(|e| format!("无法打开仓库: {}", e.message()))?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    let head_tree = match repo.head() {
        Ok(head) => head.peel_to_tree().ok(),
        Err(_) => None,
    };

    for path in &paths {
        let p = Path::new(path);
        let head_entry = head_tree
            .as_ref()
            .and_then(|tree| tree.get_path(p).ok());
        match head_entry {
            Some(tree_entry) => {
                if let Some(mut entry) = index.get_path(p, 0) {
                    entry.id = tree_entry.id();
                    index
                        .add(&entry)
                        .map_err(|e| e.message().to_string())?;
                }
            }
            None => {
                index.remove_path(p).ok();
            }
        }
    }
    index.write().map_err(|e| e.message().to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_diff(
    repo_path: String,
    path: Option<String>,
    staged: bool,
) -> Result<DiffResult, String> {
    let repo = Repository::discover(&repo_path)
        .map_err(|e| format!("无法打开仓库: {}", e.message()))?;

    let mut opts = DiffOptions::new();
    opts.context_lines(3);
    if let Some(p) = &path {
        opts.pathspec(p);
    }

    let diff = if staged {
        let head_tree = match repo.head() {
            Ok(head) => Some(
                head.peel_to_tree()
                    .map_err(|e| format!("读取 HEAD 失败: {}", e.message()))?,
            ),
            Err(_) => None,
        };
        repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))
            .map_err(|e| format!("生成 diff 失败: {}", e.message()))?
    } else {
        repo.diff_index_to_workdir(None, Some(&mut opts))
            .map_err(|e| format!("生成 diff 失败: {}", e.message()))?
    };

    let mut patch = String::new();
    let mut additions = 0u32;
    let mut deletions = 0u32;

    diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = line.origin();
        if origin == '+' {
            additions += 1;
        } else if origin == '-' {
            deletions += 1;
        }
        patch.push_str(String::from_utf8_lossy(line.content()).as_ref());
        true
    })
    .map_err(|e| e.message().to_string())?;

    Ok(DiffResult {
        patch,
        additions,
        deletions,
    })
}

#[tauri::command]
pub fn commit_changes(
    repo_path: String,
    message: String,
    amend: bool,
) -> Result<String, String> {
    let message = message.trim();
    if message.is_empty() {
        return Err("提交信息不能为空".to_string());
    }

    let repo = Repository::discover(&repo_path)
        .map_err(|e| format!("无法打开仓库: {}", e.message()))?;
    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    let tree_id = index
        .write_tree()
        .map_err(|e| format!("生成 tree 失败: {}", e.message()))?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.message().to_string())?;

    let config = repo.config().map_err(|e| e.message().to_string())?;
    let name = config
        .get_string("user.name")
        .map_err(|_| "未配置 git user.name，请先设置".to_string())?;
    let email = config
        .get_string("user.email")
        .map_err(|_| "未配置 git user.email，请先设置".to_string())?;
    let sig =
        git2::Signature::now(&name, &email).map_err(|e| e.message().to_string())?;

    let head_commit: Option<Commit> = repo
        .head()
        .ok()
        .and_then(|head| head.peel_to_commit().ok());

    let parent_commits: Vec<Commit> = match (&head_commit, amend) {
        (Some(c), false) => vec![c.clone()],
        (Some(c), true) => c.parents().collect(),
        (None, _) => Vec::new(),
    };
    let parent_refs: Vec<&Commit> = parent_commits.iter().collect();

    let oid = repo
        .commit(
            Some("HEAD"),
            &sig,
            &sig,
            message,
            &tree,
            &parent_refs,
        )
        .map_err(|e| format!("提交失败: {}", e.message()))?;

    Ok(oid.to_string())
}
