use std::path::Path;
use std::sync::mpsc::{self, Receiver, Sender};
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use tauri::Emitter;

use super::types::AppResult;

type WatchDebouncer = Debouncer<RecommendedWatcher, FileIdMap>;

pub fn create_debouncer(app: tauri::AppHandle, paths: Vec<String>) -> AppResult<WatchDebouncer> {
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
    let mut _active_debouncer: Option<WatchDebouncer> = None;

    while let Ok(paths) = receiver.recv() {
        match create_debouncer(app.clone(), paths) {
            Ok(debouncer) => _active_debouncer = Some(debouncer),
            Err(error) => {
                _active_debouncer = None;
                let _ = app.emit("watch-error", error);
            }
        }
        let _ = _active_debouncer.as_ref();
    }
}

pub fn spawn_watch_service(app: tauri::AppHandle) -> Sender<Vec<String>> {
    let (sender, receiver) = mpsc::channel::<Vec<String>>();
    std::thread::spawn(move || watch_loop(app, receiver));
    sender
}
