use std::path::{Path, PathBuf};
use std::sync::mpsc::Sender;
use std::sync::RwLock;

use crate::obsidian_embed::{RenderCache, VaultIndex};

use super::types::{AppResult, InitialPath};

pub struct InitialFile(RwLock<Option<InitialPath>>);

impl InitialFile {
    pub fn new(initial: Option<InitialPath>) -> Self {
        InitialFile(RwLock::new(initial))
    }

    pub fn take(&self) -> Option<InitialPath> {
        self.0.write().unwrap().take()
    }
}

pub struct WatchService(RwLock<Option<Sender<Vec<String>>>>);

impl WatchService {
    pub fn new() -> Self {
        WatchService(RwLock::new(None))
    }

    pub fn set_sender(&self, sender: Sender<Vec<String>>) {
        *self.0.write().unwrap() = Some(sender);
    }

    pub fn watch(&self, paths: Vec<String>) -> AppResult<()> {
        let sender = self
            .0
            .read()
            .unwrap()
            .as_ref()
            .cloned()
            .ok_or("Watch service unavailable")?;
        sender.send(paths).map_err(|e| e.to_string())
    }
}

/// Per-vault state: canonical root, index, and render cache for embed expansion.
pub struct VaultState(pub RwLock<Option<(PathBuf, VaultIndex, RenderCache)>>);

impl VaultState {
    pub fn new() -> Self {
        VaultState(RwLock::new(None))
    }
}

pub fn canonicalize_path(path: &str) -> AppResult<PathBuf> {
    Path::new(path).canonicalize().map_err(|e| e.to_string())
}

pub fn path_to_string(path: &Path) -> AppResult<String> {
    path.to_str().map(String::from).ok_or("Invalid path".to_string())
}

pub fn parent_dir_string(path: &Path) -> AppResult<String> {
    let parent = path.parent().ok_or("No parent dir")?;
    path_to_string(parent)
}
