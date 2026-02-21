use std::path::PathBuf;

use super::index::{normalize_rel_key, VaultIndex};
use super::parse::ParsedLink;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolveResult {
    Resolved(PathBuf),
    Placeholder(PathBuf),
    NotFound,
    #[allow(dead_code)]
    Ambiguous(Vec<PathBuf>),
}

pub fn resolve_target(
    parsed: &ParsedLink,
    index: &VaultIndex,
    _vault_root: &std::path::Path,
) -> ResolveResult {
    let target = normalize_rel_key(parsed.target.trim());
    if target.is_empty() {
        return ResolveResult::NotFound;
    }
    if target.contains('/') {
        let with_md = if target.ends_with(".md") {
            target.clone()
        } else {
            format!("{}.md", target)
        };
        if let Some(p) = index.by_rel_path.get(&target) {
            return path_to_result(p.clone());
        }
        if let Some(p) = index.by_rel_path.get(&with_md) {
            return path_to_result(p.clone());
        }
        return ResolveResult::NotFound;
    }
    let base = if target.ends_with(".md") {
        target.strip_suffix(".md").unwrap_or(&target).to_string()
    } else {
        target
    };
    if let Some(paths) = index.by_basename.get(&base) {
        if paths.is_empty() {
            return ResolveResult::NotFound;
        }
        return path_to_result(paths[0].clone());
    }
    ResolveResult::NotFound
}

fn path_to_result(p: PathBuf) -> ResolveResult {
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
    match ext.to_lowercase().as_str() {
        "md" => ResolveResult::Resolved(p),
        "png" | "jpg" | "jpeg" | "svg" | "pdf" => ResolveResult::Placeholder(p),
        _ => ResolveResult::Resolved(p),
    }
}
