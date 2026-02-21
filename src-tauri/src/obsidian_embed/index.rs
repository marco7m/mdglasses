use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub(crate) fn normalize_rel_key(rel: &str) -> String {
    rel.replace('\\', "/").trim_matches('/').to_string()
}

pub struct VaultIndex {
    pub by_rel_path: HashMap<String, PathBuf>,
    pub by_basename: HashMap<String, Vec<PathBuf>>,
}

impl VaultIndex {
    pub fn build_index(vault_root: &Path) -> Result<VaultIndex, String> {
        let root_canon = vault_root.canonicalize().map_err(|e| e.to_string())?;
        let mut by_rel_path = HashMap::new();
        let mut by_basename: HashMap<String, Vec<PathBuf>> = HashMap::new();
        walk_index(&root_canon, &root_canon, &mut by_rel_path, &mut by_basename)?;
        for paths in by_basename.values_mut() {
            paths.sort();
        }
        Ok(VaultIndex { by_rel_path, by_basename })
    }
}

fn walk_index(
    vault_root: &Path,
    dir: &Path,
    by_rel_path: &mut HashMap<String, PathBuf>,
    by_basename: &mut HashMap<String, Vec<PathBuf>>,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            if path.file_name().and_then(|n| n.to_str()).map(|n| n.starts_with('.')).unwrap_or(false) {
                continue;
            }
            walk_index(vault_root, &path, by_rel_path, by_basename)?;
        } else if path.extension().map(|e| e == "md").unwrap_or(false) {
            let canonical = path.canonicalize().map_err(|e| e.to_string())?;
            let rel = canonical.strip_prefix(vault_root).map_err(|e| e.to_string())?;
            let rel_key = rel.to_str().unwrap_or("").replace('\\', "/").trim_matches('/').to_string();
            by_rel_path.insert(rel_key.clone(), canonical.clone());
            if let Some(without_md) = rel_key.strip_suffix(".md") {
                if without_md != rel_key {
                    by_rel_path.insert(without_md.to_string(), canonical.clone());
                }
            }
            let base = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
            by_basename.entry(base).or_default().push(canonical);
        }
    }
    Ok(())
}
