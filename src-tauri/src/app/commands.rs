use std::collections::HashSet;

use tauri::State;

use crate::markdown::render_markdown_safe;
use crate::obsidian_embed::{RenderCache, RenderContext, VaultIndex};
use crate::wiki;

use super::state::{canonicalize_path, parent_dir_string, path_to_string, VaultState};
use super::types::{AppResult, InitialPath, OpenMarkdownFileResult, OpenWikiFolderResult};

#[tauri::command]
pub fn get_initial_file(state: State<super::state::InitialFile>) -> Option<InitialPath> {
    state.take()
}

#[tauri::command]
pub fn open_markdown_file(
    path: String,
    vault_root: Option<String>,
    state: State<VaultState>,
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
                    visited: HashSet::new(),
                    depth: 0,
                    max_depth: 5,
                };
                crate::obsidian_embed::render_markdown_with_embeds(&canonical_path, &mut ctx)
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
pub fn open_wiki_folder(path: String, state: State<VaultState>) -> AppResult<OpenWikiFolderResult> {
    let root = canonicalize_path(&path)?;
    let root_str = path_to_string(&root)?;
    let tree = wiki::build_tree(&root_str)?;

    let index = VaultIndex::build_index(&root)?;
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

#[tauri::command]
pub fn watch_paths(
    state: State<super::state::WatchService>,
    paths: Vec<String>,
) -> AppResult<()> {
    state.watch(paths)
}
