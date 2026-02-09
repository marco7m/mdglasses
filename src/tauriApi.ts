import { invoke } from "@tauri-apps/api/core";
import type { OpenMarkdownFileResult, OpenWikiFolderResult } from "./types";

export interface InitialPath {
  path: string;
  is_dir: boolean;
}

export function getInitialFile(): Promise<InitialPath | null> {
  return invoke<InitialPath | null>("get_initial_file");
}

export function openMarkdownFile(path: string): Promise<OpenMarkdownFileResult> {
  return invoke<OpenMarkdownFileResult>("open_markdown_file", { path });
}

export function openWikiFolder(path: string): Promise<OpenWikiFolderResult> {
  return invoke<OpenWikiFolderResult>("open_wiki_folder", { path });
}

export function watchPaths(paths: string[]): Promise<void> {
  return invoke<void>("watch_paths", { paths });
}
