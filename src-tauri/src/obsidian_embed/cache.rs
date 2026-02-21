//! Render cache: LRU by entry count and size; mtime-based invalidation.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

pub(crate) const MAX_CACHE_ENTRIES: usize = 100;
pub(crate) const MAX_CACHE_SIZE_BYTES: usize = 50 * 1024 * 1024;

#[derive(Clone)]
pub struct CachedEntry {
    pub mtime: SystemTime,
    pub html: String,
    pub size_bytes: usize,
    pub last_accessed: SystemTime,
}

pub struct RenderCache {
    entries: HashMap<PathBuf, CachedEntry>,
    access_order: Vec<PathBuf>,
    current_size_bytes: usize,
    hits: usize,
    misses: usize,
}

impl Default for RenderCache {
    fn default() -> Self {
        Self {
            entries: HashMap::new(),
            access_order: Vec::new(),
            current_size_bytes: 0,
            hits: 0,
            misses: 0,
        }
    }
}

impl RenderCache {
    pub fn get(&mut self, path: &Path, mtime: SystemTime) -> Option<String> {
        let should_update = self
            .entries
            .get(path)
            .map(|e| e.mtime == mtime)
            .unwrap_or(false);
        if should_update {
            self.update_access_order(path);
            self.hits += 1;
            if let Some(entry) = self.entries.get(path) {
                return Some(entry.html.clone());
            }
        }
        self.misses += 1;
        None
    }

    pub fn insert(&mut self, path: PathBuf, mtime: SystemTime, html: String) {
        let size_bytes = html.len();
        if let Some(old_entry) = self.entries.remove(&path) {
            self.current_size_bytes -= old_entry.size_bytes;
            self.remove_from_access_order(&path);
        }
        while (self.entries.len() >= MAX_CACHE_ENTRIES
            || self.current_size_bytes + size_bytes > MAX_CACHE_SIZE_BYTES)
            && !self.entries.is_empty()
        {
            self.evict_lru();
        }
        let now = SystemTime::now();
        let entry = CachedEntry {
            mtime,
            html: html.clone(),
            size_bytes,
            last_accessed: now,
        };
        self.current_size_bytes += size_bytes;
        self.entries.insert(path.clone(), entry);
        self.access_order.push(path);
    }

    fn update_access_order(&mut self, path: &Path) {
        self.access_order.retain(|p| p != path);
        self.access_order.push(path.to_path_buf());
        if let Some(entry) = self.entries.get_mut(path) {
            entry.last_accessed = SystemTime::now();
        }
    }

    fn remove_from_access_order(&mut self, path: &Path) {
        self.access_order.retain(|p| p != path);
    }

    fn evict_lru(&mut self) {
        if let Some(lru_path) = self.access_order.first().cloned() {
            if let Some(entry) = self.entries.remove(&lru_path) {
                self.current_size_bytes -= entry.size_bytes;
                self.remove_from_access_order(&lru_path);
            }
        }
    }

    #[allow(dead_code)]
    pub fn get_stats(&self) -> (usize, usize, usize, usize) {
        (
            self.entries.len(),
            self.current_size_bytes,
            self.hits,
            self.misses,
        )
    }

    #[allow(dead_code)]
    pub fn clear(&mut self) {
        self.entries.clear();
        self.access_order.clear();
        self.current_size_bytes = 0;
        self.hits = 0;
        self.misses = 0;
    }
}
