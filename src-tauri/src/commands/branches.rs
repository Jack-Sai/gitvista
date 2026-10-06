use git2::build::CheckoutBuilder;
use git2::{BranchType, Repository, Sort};
use serde::Serialize;

use super::remote::GitOpResult;

#[derive(Serialize)]
pub struct RefInfo {
    pub name: String,
    pub is_head: bool,
    pub is_merged: bool,
    pub ahead: usize,
    pub behind: usize,
    pub upstream: Option<String>,
    pub last_commit_time: i64,
}

#[derive(Serialize)]
pub struct RefsList {
    pub locals: Vec<RefInfo>,
    pub remotes: Vec<RefInfo>,
    pub tags: Vec<RefInfo>,
    pub head: String,
}

#[derive(Serialize)]
pub struct CompareCommit {
    pub id: String,
    pub short_id: String,
    pub summary: String,
    pub author_name: String,
    pub time: i64,
}

#[derive(Serialize)]
pub struct CompareFile {
    pub path: String,
    pub status: String,
}

#[derive(Serialize)]
pub struct CompareResult {
    pub ahead: Vec<CompareCommit>,
    pub behind: Vec<CompareCommit>,
    pub files: Vec<CompareFile>,
}

fn open(repo_path: &str) -> Result<Repository, String> {
    Repository::open(repo_path).map_err(|e| e.message().to_string())
}

fn commit_info(
    repo: &Repository,
    oid: git2::Oid,
) -> Result<CompareCommit, String> {
    let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;
    let author_name = commit.author().name().unwrap_or("").to_string();
    let summary = commit.summary().unwrap_or("").to_string();
    let time = commit.time().seconds();
    let short = &oid.to_string()[..7.min(oid.to_string().len())];
    Ok(CompareCommit {
        id: oid.to_string(),
        short_id: short.to_string(),
        summary,
        author_name,
        time,
    })
}

fn ref_info(
    repo: &Repository,
    name: &str,
    oid: Option<git2::Oid>,
    is_head: bool,
    head_oid: Option<git2::Oid>,
    upstream: Option<String>,
) -> RefInfo {
    let mut ahead = 0;
    let mut behind = 0;
    let mut is_merged = false;
    let mut last_commit_time = 0;

    if let (Some(b), Some(h)) = (oid, head_oid) {
        if b == h {
            is_merged = true;
        } else if let Ok((a, d)) = repo.graph_ahead_behind(b, h) {
            ahead = a;
            behind = d;
        }
        if let Ok(flag) = repo.graph_descendant_of(h, b) {
            is_merged = flag;
        }
    }
    if let Some(b) = oid {
        if let Ok(commit) = repo.find_commit(b) {
            last_commit_time = commit.time().seconds();
        }
    }

    RefInfo {
        name: name.to_string(),
        is_head,
        is_merged,
        ahead,
        behind,
        upstream,
        last_commit_time,
    }
}

#[tauri::command]
pub fn list_refs(repo_path: String) -> Result<RefsList, String> {
    let repo = open(&repo_path)?;
    let head = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(String::from))
        .unwrap_or_else(|| "detached".to_string());
    let head_oid = repo.head().ok().and_then(|h| h.target());

    let mut locals = Vec::new();
    for branch in repo
        .branches(Some(BranchType::Local))
        .map_err(|e| e.message().to_string())?
        .flatten()
    {
        let (branch, _) = branch;
        let name = match branch.name().map_err(|e| e.message().to_string())? {
            Some(n) if !n.is_empty() => n.to_string(),
            _ => continue,
        };
        let oid = branch.get().target();
        let upstream = branch
            .upstream()
            .ok()
            .and_then(|u| u.name().ok().flatten().map(String::from));
        let info = ref_info(
            &repo,
            &name,
            oid,
            branch.is_head(),
            head_oid,
            upstream,
        );
        locals.push(info);
    }
    locals.sort_by(|a, b| a.name.cmp(&b.name));

    let mut remotes = Vec::new();
    for branch in repo
        .branches(Some(BranchType::Remote))
        .map_err(|e| e.message().to_string())?
        .flatten()
    {
        let (branch, _) = branch;
        let name = match branch.name().map_err(|e| e.message().to_string())? {
            Some(n) if !n.is_empty() && !n.ends_with("/HEAD") => n.to_string(),
            _ => continue,
        };
        let oid = branch.get().target();
        let info = ref_info(&repo, &name, oid, false, head_oid, None);
        remotes.push(info);
    }
    remotes.sort_by(|a, b| a.name.cmp(&b.name));

    let mut tags = Vec::new();
    let names = repo.tag_names(None).map_err(|e| e.message().to_string())?;
    for tag_name in names.iter().flatten() {
        let full = format!("refs/tags/{}", tag_name);
        if let Ok(obj) = repo.revparse_single(&full) {
            if let Ok(commit) = obj.peel_to_commit() {
                tags.push(RefInfo {
                    name: tag_name.to_string(),
                    is_head: false,
                    is_merged: repo
                        .graph_descendant_of(head_oid.unwrap_or(commit.id()), commit.id())
                        .unwrap_or(false),
                    ahead: 0,
                    behind: 0,
                    upstream: None,
                    last_commit_time: commit.time().seconds(),
                });
            }
        }
    }
    tags.sort_by(|a, b| b.last_commit_time.cmp(&a.last_commit_time));

    Ok(RefsList {
        locals,
        remotes,
        tags,
        head,
    })
}

fn workdir_dirty(repo: &Repository) -> Result<bool, String> {
    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true).include_ignored(false);
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.message().to_string())?;
    Ok(!statuses.is_empty())
}

#[tauri::command]
pub fn checkout_branch(
    repo_path: String,
    branch_name: String,
    force: bool,
) -> Result<GitOpResult, String> {
    let repo = open(&repo_path)?;
    if !force && workdir_dirty(&repo)? {
        return Err("工作区有未提交改动，无法切换分支（可先提交、暂存，或强制切换丢弃改动）".to_string());
    }
    let refname = format!("refs/heads/{}", branch_name);
    let obj = repo
        .revparse_single(&refname)
        .map_err(|_| format!("分支不存在: {}", branch_name))?;
    let mut co = CheckoutBuilder::new();
    if force {
        co.force();
    } else {
        co.safe();
    }
    repo.checkout_tree(&obj, Some(&mut co))
        .map_err(|e| e.message().to_string())?;
    repo.set_head(&refname).map_err(|e| e.message().to_string())?;
    Ok(GitOpResult {
        success: true,
        output: format!("已切换到 {}", branch_name),
        error: String::new(),
    })
}

#[tauri::command]
pub fn create_branch(
    repo_path: String,
    branch_name: String,
    from_ref: Option<String>,
) -> Result<GitOpResult, String> {
    let repo = open(&repo_path)?;
    let name = branch_name.trim();
    if name.is_empty() {
        return Err("分支名不能为空".to_string());
    }
    let target_oid = match &from_ref {
        Some(r) if !r.trim().is_empty() => repo
            .revparse_single(r.trim())
            .map_err(|_| format!("无法解析: {}", r))?
            .peel_to_commit()
            .map_err(|e| e.message().to_string())?
            .id(),
        _ => repo
            .head()
            .map_err(|e| e.message().to_string())?
            .peel_to_commit()
            .map_err(|e| e.message().to_string())?
            .id(),
    };
    let commit = repo
        .find_commit(target_oid)
        .map_err(|e| e.message().to_string())?;
    repo.branch(name, &commit, false)
        .map_err(|e| {
            if e.code() == git2::ErrorCode::Exists {
                format!("分支已存在: {}", name)
            } else {
                e.message().to_string()
            }
        })?;
    Ok(GitOpResult {
        success: true,
        output: format!("已创建分支 {}", name),
        error: String::new(),
    })
}

#[tauri::command]
pub fn rename_branch(
    repo_path: String,
    old_name: String,
    new_name: String,
) -> Result<GitOpResult, String> {
    let repo = open(&repo_path)?;
    let new = new_name.trim();
    if new.is_empty() {
        return Err("新分支名不能为空".to_string());
    }
    let mut branch = repo
        .find_branch(&old_name, BranchType::Local)
        .map_err(|_| format!("分支不存在: {}", old_name))?;
    branch
        .rename(new, false)
        .map_err(|e| e.message().to_string())?;
    Ok(GitOpResult {
        success: true,
        output: format!("已重命名 {} → {}", old_name, new),
        error: String::new(),
    })
}

#[tauri::command]
pub fn delete_branch(
    repo_path: String,
    branch_name: String,
    force: bool,
) -> Result<GitOpResult, String> {
    let repo = open(&repo_path)?;
    let head_oid = repo.head().ok().and_then(|h| h.target());
    let branch = repo
        .find_branch(&branch_name, BranchType::Local)
        .map_err(|_| format!("分支不存在: {}", branch_name))?;
    let oid = branch.get().target();
    let merged = match (oid, head_oid) {
        (Some(b), Some(h)) if b == h => false,
        (Some(b), Some(h)) => repo
            .graph_descendant_of(h, b)
            .unwrap_or(false),
        _ => false,
    };
    if oid == head_oid {
        return Err("不能删除当前所在分支".to_string());
    }
    if !merged && !force {
        return Err(format!(
            "分支 {} 尚未合并到当前分支，确认删除将丢失其独有提交",
            branch_name
        ));
    }
    if force {
        let mut reference = branch.into_reference();
        reference.delete().map_err(|e| e.message().to_string())?;
    } else {
        let mut branch = repo
            .find_branch(&branch_name, BranchType::Local)
            .map_err(|_| format!("分支不存在: {}", branch_name))?;
        branch.delete().map_err(|e| e.message().to_string())?;
    }
    Ok(GitOpResult {
        success: true,
        output: format!("已删除分支 {}", branch_name),
        error: String::new(),
    })
}

#[tauri::command]
pub fn merge_branch(
    repo_path: String,
    branch_name: String,
) -> Result<GitOpResult, String> {
    let repo = open(&repo_path)?;
    if workdir_dirty(&repo)? {
        return Err("工作区有未提交改动，无法执行合并".to_string());
    }
    let head_commit = repo
        .head()
        .map_err(|e| e.message().to_string())?
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?;
    let target = repo
        .revparse_single(&format!("refs/heads/{}", branch_name))
        .map_err(|_| format!("分支不存在: {}", branch_name))?;
    let target_commit = target.peel_to_commit().map_err(|e| e.message().to_string())?;

    if target_commit.id() == head_commit.id() {
        return Err("已在该分支上".to_string());
    }

    let annotated = repo
        .find_annotated_commit(target_commit.id())
        .map_err(|e| e.message().to_string())?;
    let analysis = repo
        .merge_analysis(&[&annotated])
        .map_err(|e| e.message().to_string())?;

    if analysis.0.is_up_to_date() {
        return Ok(GitOpResult {
            success: true,
            output: "已是最新".to_string(),
            error: String::new(),
        });
    }

    if analysis.0.is_fast_forward() {
        let current_ref = repo
            .head()
            .map_err(|e| e.message().to_string())?
            .name()
            .map(String::from);
        if let Some(refname) = current_ref {
            repo.checkout_tree(target_commit.as_object(), Some(CheckoutBuilder::new().safe()))
                .map_err(|e| e.message().to_string())?;
            repo.reference(&refname, target_commit.id(), true, "merge (fast-forward)")
                .map_err(|e| e.message().to_string())?;
        } else {
            repo.set_head_detached(target_commit.id())
                .map_err(|e| e.message().to_string())?;
        }
        return Ok(GitOpResult {
            success: true,
            output: format!("快进合并到 {}", branch_name),
            error: String::new(),
        });
    }

    let base_oid = repo
        .merge_base(head_commit.id(), target_commit.id())
        .map_err(|_| "找不到共同祖先".to_string())?;
    let base_tree = repo
        .find_commit(base_oid)
        .map_err(|e| e.message().to_string())?
        .tree()
        .map_err(|e| e.message().to_string())?;
    let mut index = repo
        .merge_trees(
            &head_commit.tree().map_err(|e| e.message().to_string())?,
            &target_commit.tree().map_err(|e| e.message().to_string())?,
            &base_tree,
            None,
        )
        .map_err(|e| e.message().to_string())?;

    if index.has_conflicts() {
        let mut conflicts = Vec::new();
        for entry in index
            .conflicts()
            .map_err(|e| e.message().to_string())?
            .flatten()
        {
            if let Some(their) = entry.their {
                conflicts.push(String::from_utf8_lossy(&their.path).to_string());
            } else if let Some(our) = entry.our {
                conflicts.push(String::from_utf8_lossy(&our.path).to_string());
            }
        }
        return Ok(GitOpResult {
            success: false,
            output: String::new(),
            error: format!("合并存在冲突（请先解决后再合并）：\n{}", conflicts.join("\n")),
        });
    }

    let tree_oid = index
        .write_tree()
        .map_err(|e| e.message().to_string())?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| e.message().to_string())?;
    let sig = repo
        .signature()
        .map_err(|_| "请先配置 git user.name / user.email".to_string())?;
    let msg = format!("Merge branch '{}'", branch_name);
    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        &msg,
        &tree,
        &[&head_commit, &target_commit],
    )
    .map_err(|e| e.message().to_string())?;
    repo.checkout_tree(tree.as_object(), Some(CheckoutBuilder::new().safe()))
        .map_err(|e| e.message().to_string())?;

    Ok(GitOpResult {
        success: true,
        output: format!("已合并 {} 到当前分支", branch_name),
        error: String::new(),
    })
}

#[tauri::command]
pub fn rebase_branch(
    repo_path: String,
    target: String,
) -> Result<GitOpResult, String> {
    let repo = open(&repo_path)?;
    if workdir_dirty(&repo)? {
        return Err("工作区有未提交改动，无法执行变基".to_string());
    }
    let target_obj = repo
        .revparse_single(&target)
        .map_err(|_| format!("无法解析: {}", target))?;
    let target_commit = target_obj.peel_to_commit().map_err(|e| e.message().to_string())?;
    let onto = repo
        .find_annotated_commit(target_commit.id())
        .map_err(|e| e.message().to_string())?;

    let head_oid = repo
        .head()
        .map_err(|e| e.message().to_string())?
        .target();
    if target_commit.id() == head_oid.unwrap_or(target_commit.id()) {
        return Ok(GitOpResult {
            success: true,
            output: "已是最新".to_string(),
            error: String::new(),
        });
    }

    let mut rebase = repo
        .rebase(None, Some(&onto), Some(&onto), None)
        .map_err(|e| e.message().to_string())?;

    let mut rebased = 0usize;
    while rebase.next().is_some() {
        let sig = repo
            .signature()
            .map_err(|_| "请先配置 git user.name / user.email".to_string())?;
        if let Err(e) = rebase.commit(None, &sig, None) {
            let _ = rebase.abort();
            return Ok(GitOpResult {
                success: false,
                output: String::new(),
                error: format!(
                    "变基冲突（已中止，工作区已恢复）：{}",
                    e.message()
                ),
            });
        }
        rebased += 1;
    }
    rebase.finish(None).map_err(|e| e.message().to_string())?;

    Ok(GitOpResult {
        success: true,
        output: format!("变基完成，共重放 {} 个提交", rebased),
        error: String::new(),
    })
}

#[tauri::command]
pub fn compare_branches(
    repo_path: String,
    base: String,
    target: String,
) -> Result<CompareResult, String> {
    let repo = open(&repo_path)?;
    let base_obj = repo
        .revparse_single(&base)
        .map_err(|_| format!("无法解析: {}", base))?;
    let target_obj = repo
        .revparse_single(&target)
        .map_err(|_| format!("无法解析: {}", target))?;
    let base_commit = base_obj.peel_to_commit().map_err(|e| e.message().to_string())?;
    let target_commit = target_obj.peel_to_commit().map_err(|e| e.message().to_string())?;

    let collect = |hide: git2::Oid, push: git2::Oid| -> Result<Vec<CompareCommit>, String> {
        let mut walk = repo.revwalk().map_err(|e| e.message().to_string())?;
        walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
            .map_err(|e| e.message().to_string())?;
        walk.push(push).map_err(|e| e.message().to_string())?;
        walk.hide(hide).map_err(|e| e.message().to_string())?;
        let mut list = Vec::new();
        for oid in walk.flatten() {
            if list.len() >= 300 {
                break;
            }
            list.push(commit_info(&repo, oid)?);
        }
        Ok(list)
    };

    let ahead = collect(base_commit.id(), target_commit.id())?;
    let behind = collect(target_commit.id(), base_commit.id())?;

    let diff = repo
        .diff_tree_to_tree(
            Some(&base_commit.tree().map_err(|e| e.message().to_string())?),
            Some(&target_commit.tree().map_err(|e| e.message().to_string())?),
            None,
        )
        .map_err(|e| e.message().to_string())?;
    let mut files = Vec::new();
    diff.foreach(
        &mut |delta, _| {
            if let Some(path) = delta.new_file().path().or(delta.old_file().path()) {
                files.push(CompareFile {
                    path: path.to_string_lossy().to_string(),
                    status: format!("{:?}", delta.status()),
                });
            }
            true
        },
        None,
        None,
        None,
    )
    .map_err(|e| e.message().to_string())?;

    Ok(CompareResult {
        ahead,
        behind,
        files,
    })
}

#[tauri::command]
pub fn git_push_refspec(
    repo_path: String,
    refspec: String,
    force: bool,
) -> Result<GitOpResult, String> {
    let dir = std::path::Path::new(&repo_path);
    let mut args: Vec<String> = vec!["push".to_string()];
    if force {
        args.push("--force-with-lease".to_string());
    }
    args.push("origin".to_string());
    args.push(refspec);
    let borrowed: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = std::process::Command::new("git")
        .args(&borrowed)
        .current_dir(dir)
        .stdin(std::process::Stdio::null())
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "未检测到 git 命令，请先安装 Git".to_string()
            } else {
                format!("启动 git 失败: {}", e)
            }
        })?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
    .trim()
    .to_string();
    if output.status.success() {
        Ok(GitOpResult {
            success: true,
            output: text,
            error: String::new(),
        })
    } else {
        Ok(GitOpResult {
            success: false,
            output: text.clone(),
            error: if text.is_empty() {
                "git 命令执行失败".to_string()
            } else {
                text
            },
        })
    }
}
