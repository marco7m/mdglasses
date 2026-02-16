// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod markdown;
mod obsidian_embed;
mod wiki;

use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::RwLock;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use tauri::Emitter;
use tauri::Manager;

use markdown::render_markdown_safe;
use obsidian_embed::{RenderCache, RenderContext, VaultIndex};
use wiki::build_tree;

type AppResult<T> = Result<T, String>;
type WatchDebouncer = Debouncer<RecommendedWatcher, FileIdMap>;

#[derive(serde::Serialize)]
struct OpenMarkdownFileResult {
    raw_md: String,
    html: String,
    base_dir: String,
}

#[derive(serde::Serialize)]
struct TreeNode {
    name: String,
    path: String,
    children: Vec<TreeNode>,
}

#[derive(serde::Serialize)]
struct OpenWikiFolderResult {
    tree: Vec<TreeNode>,
    initial_note_path: Option<String>,
    initial_html: Option<String>,
}

#[derive(serde::Serialize)]
struct InitialPath {
    path: String,
    is_dir: bool,
}

struct InitialFile(RwLock<Option<InitialPath>>);

impl InitialFile {
    fn take(&self) -> Option<InitialPath> {
        self.0.write().unwrap().take()
    }
}

struct WatchService(RwLock<Option<Sender<Vec<String>>>>);

/// Per-vault state: canonical root, index, and render cache for embed expansion.
struct VaultState(RwLock<Option<(PathBuf, VaultIndex, RenderCache)>>);

impl WatchService {
    fn set_sender(&self, sender: Sender<Vec<String>>) {
        *self.0.write().unwrap() = Some(sender);
    }

    fn watch(&self, paths: Vec<String>) -> AppResult<()> {
        let sender = self
            .0
            .read()
            .unwrap()
            .as_ref()
            .cloned()
            .ok_or("Watch service unavailable")?;

        sender.send(paths).map_err(|error| error.to_string())
    }
}

fn canonicalize_path(path: &str) -> AppResult<PathBuf> {
    Path::new(path).canonicalize().map_err(|e| e.to_string())
}

fn path_to_string(path: &Path) -> AppResult<String> {
    path.to_str().map(String::from).ok_or("Invalid path".to_string())
}

fn parent_dir_string(path: &Path) -> AppResult<String> {
    let parent = path.parent().ok_or("No parent dir")?;
    path_to_string(parent)
}

#[tauri::command]
fn get_initial_file(state: tauri::State<InitialFile>) -> Option<InitialPath> {
    state.take()
}

#[tauri::command]
fn open_markdown_file(
    path: String,
    vault_root: Option<String>,
    state: tauri::State<VaultState>,
) -> AppResult<OpenMarkdownFileResult> {
    let canonical_path = canonicalize_path(&path)?;
    let path_str = path_to_string(&canonical_path)?;
    let base_dir = parent_dir_string(&canonical_path)?;
    let raw_md = std::fs::read_to_string(&path_str).map_err(|e| e.to_string())?;

    let html = if let Some(vault_str) = vault_root {
        let vault_canon = canonicalize_path(&vault_str)?;
        let mut guard = state.0.write().unwrap();
        if let Some((root, index, cache)) = guard.as_mut() {
            if *root == vault_canon {
                let mut ctx = RenderContext {
                    vault_root: root.clone(),
                    index,
                    cache,
                    visited: std::collections::HashSet::new(),
                    depth: 0,
                    max_depth: 5,
                };
                obsidian_embed::render_markdown_with_embeds(&canonical_path, &mut ctx)
            } else {
                render_markdown_safe(&raw_md)
            }
        } else {
            render_markdown_safe(&raw_md)
        }
    } else {
        render_markdown_safe(&raw_md)
    };

    Ok(OpenMarkdownFileResult {
        raw_md,
        html,
        base_dir,
    })
}

#[tauri::command]
fn open_wiki_folder(
    path: String,
    state: tauri::State<VaultState>,
) -> AppResult<OpenWikiFolderResult> {
    let root = canonicalize_path(&path)?;
    let root_str = path_to_string(&root)?;
    let tree = build_tree(&root_str)?;

    let index = obsidian_embed::VaultIndex::build_index(&root)?;
    let mut cache = RenderCache::default();
    let (initial_note_path, initial_html) =
        wiki::initial_note_with_embeds(&root_str, &index, &mut cache)?;

    *state.0.write().unwrap() = Some((root, index, cache));

    Ok(OpenWikiFolderResult {
        tree,
        initial_note_path,
        initial_html,
    })
}

fn create_debouncer(app: tauri::AppHandle, paths: Vec<String>) -> AppResult<WatchDebouncer> {
    let app_for_closure = app.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(400),
        None,
        move |result: DebounceEventResult| {
            if let Ok(events) = result {
                let changed_paths: Vec<String> = events
                    .into_iter()
                    .flat_map(|event| event.paths.clone().into_iter())
                    .filter_map(|path| path.into_os_string().into_string().ok())
                    .collect();
                let _ = app_for_closure.emit("watch-change", changed_paths);
            }
        },
    )
    .map_err(|e| e.to_string())?;

    for path in paths {
        let watch_path = Path::new(&path);
        if !watch_path.exists() {
            continue;
        }

        if let Err(error) = debouncer.watcher().watch(watch_path, RecursiveMode::Recursive) {
            let _ = app.emit("watch-error", error.to_string());
            continue;
        }

        let _ = debouncer.cache().add_root(watch_path, RecursiveMode::Recursive);
    }

    Ok(debouncer)
}

fn watch_loop(app: tauri::AppHandle, receiver: Receiver<Vec<String>>) {
    let mut active_debouncer: Option<WatchDebouncer>;

    while let Ok(paths) = receiver.recv() {
        match create_debouncer(app.clone(), paths) {
            Ok(debouncer) => active_debouncer = Some(debouncer),
            Err(error) => {
                active_debouncer = None;
                let _ = app.emit("watch-error", error);
            }
        }
        let _ = active_debouncer.as_ref();
    }
}

fn spawn_watch_service(app: tauri::AppHandle) -> Sender<Vec<String>> {
    let (sender, receiver) = mpsc::channel::<Vec<String>>();
    std::thread::spawn(move || watch_loop(app, receiver));
    sender
}

#[tauri::command]
fn watch_paths(state: tauri::State<WatchService>, paths: Vec<String>) -> AppResult<()> {
    state.watch(paths)
}

fn run_app(initial_file: Option<InitialPath>) {
    tauri::Builder::default()
        .manage(InitialFile(RwLock::new(initial_file)))
        .manage(VaultState(RwLock::new(None)))
        .manage(WatchService(RwLock::new(None)))
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

fn parse_initial_file_from_args() -> Option<InitialPath> {
    let arg = std::env::args().skip(1).find(|argument| !argument.starts_with('-'))?;
    let canonical_path = Path::new(&arg).canonicalize().ok()?;
    let path_str = canonical_path.to_str()?.to_string();
    let is_dir = canonical_path.is_dir();
    Some(InitialPath { path: path_str, is_dir })
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
