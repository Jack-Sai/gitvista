mod commands;

use commands::auth::{delete_github_token, get_github_token, store_github_token};
use commands::branches::{
    checkout_branch, compare_branches, create_branch, delete_branch, git_push_refspec,
    list_refs, merge_branch, rebase_branch, rename_branch,
};
use commands::graph::get_commit_graph;
use commands::remote::{git_clone, git_fetch, git_pull, git_push};
use commands::repos::{open_repository, scan_repositories};
use commands::workdir::{
    commit_changes, get_diff, get_worktree_status, stage_files, unstage_files,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_repository,
            scan_repositories,
            get_commit_graph,
            get_worktree_status,
            stage_files,
            unstage_files,
            get_diff,
            commit_changes,
            git_fetch,
            git_pull,
            git_push,
            git_clone,
            store_github_token,
            get_github_token,
            delete_github_token,
            list_refs,
            checkout_branch,
            create_branch,
            rename_branch,
            delete_branch,
            merge_branch,
            rebase_branch,
            compare_branches,
            git_push_refspec
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
