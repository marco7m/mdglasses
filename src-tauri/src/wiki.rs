use std::collections::HashSet;
use std::fs;
use std::path::Path;

use crate::obsidian_embed::{RenderCache, RenderContext, VaultIndex};
use crate::TreeNode;
use crate::markdown::render_markdown_safe;

pub fn build_tree(root: &str) -> Result<Vec<TreeNode>, String> {
    let mut children = Vec::new();
    walk_dir(Path::new(root), root, &mut children)?;
    Ok(children)
}

fn walk_dir(dir: &Path, root: &str, out: &mut Vec<TreeNode>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    let mut nodes: Vec<_> = entries
        .filter_map(|e| e.ok())
        .map(|e| (e.path(), e.file_name().into_string().ok()))
        .filter_map(|(path, name)| name.map(|n| (path, n)))
        .collect();
    nodes.sort_by(|a, b| {
        let a_is_dir = a.0.is_dir();
        let b_is_dir = b.0.is_dir();
        let a_is_readme = a.1.eq_ignore_ascii_case("readme.md");
        let b_is_readme = b.1.eq_ignore_ascii_case("readme.md");
        
        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            (false, false) => {
                match (a_is_readme, b_is_readme) {
                    (true, false) => std::cmp::Ordering::Less,
                    (false, true) => std::cmp::Ordering::Greater,
                    _ => a.1.to_lowercase().cmp(&b.1.to_lowercase()),
                }
            }
            (true, true) => a.1.to_lowercase().cmp(&b.1.to_lowercase()),
        }
    });
    for (path, name) in nodes {
        if path.is_dir() {
            if name.starts_with('.') {
                continue;
            }
            let mut children = Vec::new();
            walk_dir(&path, root, &mut children)?;
            if !children.is_empty() {
                out.push(TreeNode {
                    name,
                    path: path.to_str().unwrap_or("").to_string(),
                    children,
                });
            }
        } else if path.extension().map(|e| e == "md").unwrap_or(false) {
            out.push(TreeNode {
                name,
                path: path.to_str().unwrap_or("").to_string(),
                children: Vec::new(),
            });
        }
    }
    Ok(())
}

/// Returns (initial_note_path, initial_html) - prefers index.md, else first .md by name.
#[allow(dead_code)]
pub fn initial_note(root: &str) -> Result<(Option<String>, Option<String>), String> {
    let root_path = Path::new(root);
    let index = root_path.join("index.md");
    if index.exists() {
        let path_str = index.to_str().unwrap().to_string();
        let raw = fs::read_to_string(&index).map_err(|e| e.to_string())?;
        return Ok((Some(path_str), Some(render_markdown_safe(&raw))));
    }
    let mut md_files: Vec<_> = fs::read_dir(root_path)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file() && p.extension().map(|e| e == "md").unwrap_or(false))
        .collect();
    md_files.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
    if let Some(path) = md_files.into_iter().next() {
        let path_str = path.to_str().unwrap().to_string();
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        return Ok((Some(path_str), Some(render_markdown_safe(&raw))));
    }
    Ok((None, None))
}

/// Returns (initial_note_path, initial_html) with Obsidian embeds expanded.
/// Uses the same initial path logic as initial_note (index.md or first .md by name).
pub fn initial_note_with_embeds(
    root: &str,
    index: &VaultIndex,
    cache: &mut RenderCache,
) -> Result<(Option<String>, Option<String>), String> {
    let root_path = Path::new(root);
    let index_md = root_path.join("index.md");
    let path = if index_md.exists() {
        index_md
    } else {
        let mut md_files: Vec<_> = fs::read_dir(root_path)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.is_file() && p.extension().map(|e| e == "md").unwrap_or(false))
            .collect();
        md_files.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
        match md_files.into_iter().next() {
            Some(p) => p,
            None => return Ok((None, None)),
        }
    };
    let path_str = path.to_str().unwrap().to_string();
    let vault_root = root_path.canonicalize().map_err(|e| e.to_string())?;
    let mut ctx = RenderContext {
        vault_root,
        index,
        cache,
        visited: HashSet::new(),
        depth: 0,
        max_depth: 5,
    };
    let html = crate::obsidian_embed::render_markdown_with_embeds(&path, &mut ctx);
    Ok((Some(path_str), Some(html)))
}
