use serde::Serialize;
use std::io;
use std::path::Path;
use std::process::{Command, Output, Stdio};

#[derive(Serialize)]
pub struct GitOpResult {
    pub success: bool,
    pub output: String,
    pub error: String,
}

fn output_text(output: &Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    format!("{}{}", stdout, stderr).trim().to_string()
}

fn map_spawn_error(e: io::Error) -> String {
    if e.kind() == io::ErrorKind::NotFound {
        "未检测到 git 命令，请先安装 Git".to_string()
    } else {
        format!("启动 git 失败: {}", e)
    }
}

fn run_git(cwd: &Path, args: &[&str]) -> Result<GitOpResult, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .output()
        .map_err(map_spawn_error)?;

    let text = output_text(&output);
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

#[tauri::command]
pub fn git_fetch(repo_path: String) -> Result<GitOpResult, String> {
    let dir = Path::new(&repo_path);
    run_git(dir, &["fetch", "--all", "--prune"])
}

#[tauri::command]
pub fn git_pull(repo_path: String, rebase: bool) -> Result<GitOpResult, String> {
    let dir = Path::new(&repo_path);
    if rebase {
        run_git(dir, &["pull", "--rebase"])
    } else {
        run_git(dir, &["pull"])
    }
}

#[tauri::command]
pub fn git_push(
    repo_path: String,
    force_with_lease: bool,
) -> Result<GitOpResult, String> {
    let dir = Path::new(&repo_path);
    let mut args: Vec<&str> = vec!["push"];
    if force_with_lease {
        args.push("--force-with-lease");
    }
    let first = run_git(dir, &args)?;
    if first.success {
        return Ok(first);
    }
    if first.error.contains("no upstream")
        || first.error.contains("has no upstream")
        || first.error.contains("set-upstream")
        || first.error.contains("fatal: The current branch")
    {
        let mut args_upstream: Vec<&str> = vec!["push", "-u", "origin", "HEAD"];
        if force_with_lease {
            args_upstream = vec![
                "push",
                "--force-with-lease",
                "-u",
                "origin",
                "HEAD",
            ];
        }
        return run_git(dir, &args_upstream);
    }
    Ok(first)
}

#[tauri::command]
pub fn git_clone(
    url: String,
    target: String,
    branch: Option<String>,
) -> Result<GitOpResult, String> {
    let mut args: Vec<String> = vec!["clone".to_string()];
    if let Some(b) = &branch {
        if !b.trim().is_empty() {
            args.push("--branch".to_string());
            args.push(b.trim().to_string());
        }
    }
    args.push(url);
    args.push(target);

    let borrowed: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = Command::new("git")
        .args(&borrowed)
        .stdin(Stdio::null())
        .output()
        .map_err(map_spawn_error)?;

    let text = output_text(&output);
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
                "clone 失败".to_string()
            } else {
                text
            },
        })
    }
}
