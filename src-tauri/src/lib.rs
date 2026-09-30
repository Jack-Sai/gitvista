mod commands;

use commands::graph::get_commit_graph;
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
            commit_changes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
