// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Entry point: builds Tauri app, registers commands, runs. State and types: app/state, app/types.
// Command implementations: app/commands. Watch service: app/watch.

mod app;
mod markdown;
mod obsidian_embed;
mod wiki;

pub use app::{InitialFile, InitialPath, TreeNode};

use std::path::Path;

use tauri::Manager;

use app::{get_initial_file, open_markdown_file, open_wiki_folder, spawn_watch_service, watch_paths, VaultState, WatchService};

fn run_app(initial_file: Option<app::InitialPath>) {
    tauri::Builder::default()
        .manage(InitialFile::new(initial_file))
        .manage(VaultState::new())
        .manage(WatchService::new())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_initial_file,
            open_markdown_file,
            open_wiki_folder,
            watch_paths,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let watch_sender = spawn_watch_service(handle.clone());
            app.state::<WatchService>().set_sender(watch_sender);

            let handle_for_closure = handle.clone();
            let _ = handle.run_on_main_thread(move || {
                if let Some(window) = handle_for_closure.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn parse_initial_file_from_args() -> Option<app::InitialPath> {
    let arg = std::env::args().skip(1).find(|argument| !argument.starts_with('-'))?;
    let canonical_path = Path::new(&arg).canonicalize().ok()?;
    let path_str = canonical_path.to_str()?.to_string();
    let is_dir = canonical_path.is_dir();
    Some(app::InitialPath {
        path: path_str,
        is_dir,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_file = parse_initial_file_from_args();
    run_app(initial_file);
}

#[cfg(test)]
mod wiki_tests {
    use std::fs;

    use tempfile::TempDir;

    use crate::wiki;

    fn setup_temp_wiki() -> (TempDir, String) {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_str().unwrap().to_string();
        fs::write(dir.path().join("index.md"), "# Index").unwrap();
        fs::write(dir.path().join("a.md"), "# A").unwrap();
        fs::write(dir.path().join("b.md"), "# B").unwrap();
        let sub = dir.path().join("sub");
        fs::create_dir_all(&sub).unwrap();
        fs::write(sub.join("c.md"), "# C").unwrap();
        (dir, root)
    }

    #[test]
    fn initial_note_prefers_index_md() {
        let (_dir, root) = setup_temp_wiki();
        let (path, html) = wiki::initial_note(&root).unwrap();
        let path = path.unwrap();
        assert!(path.ends_with("index.md"), "expected index.md, got {}", path);
        assert!(html.unwrap().contains("<h1>"), "expected rendered html");
    }

    #[test]
    fn initial_note_without_index_returns_first_md_by_name() {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_str().unwrap().to_string();
        fs::write(dir.path().join("z.md"), "# Z").unwrap();
        fs::write(dir.path().join("a.md"), "# A").unwrap();
        let (path, html) = wiki::initial_note(&root).unwrap();
        let path = path.unwrap();
        assert!(
            path.ends_with("a.md"),
            "expected first by name (a before z), got {}",
            path
        );
        assert!(html.unwrap().contains("<h1>"));
    }

    #[test]
    fn build_tree_includes_md_files_and_subdirs() {
        let (_dir, root) = setup_temp_wiki();
        let tree = wiki::build_tree(&root).unwrap();
        let names: Vec<&str> = tree.iter().map(|n| n.name.as_str()).collect();
        assert!(names.contains(&"a.md"), "expected a.md in {:?}", names);
        assert!(names.contains(&"b.md"), "expected b.md in {:?}", names);
        let subdir = tree
            .iter()
            .find(|n| !n.children.is_empty())
            .expect("expected one subdir with children");
        assert_eq!(subdir.name, "sub");
        let sub_names: Vec<&str> = subdir.children.iter().map(|n| n.name.as_str()).collect();
        assert!(sub_names.contains(&"c.md"), "expected c.md in sub {:?}", sub_names);
    }

    #[test]
    fn initial_note_empty_dir_returns_none() {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_str().unwrap().to_string();
        let (path, html) = wiki::initial_note(&root).unwrap();
        assert!(path.is_none());
        assert!(html.is_none());
    }
}
