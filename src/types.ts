export type ThemeId = "light" | "sepia" | "dark";
export type Mode = "file" | "wiki";

export interface OpenMarkdownFileResult {
  raw_md: string;
  html: string;
  base_dir: string;
}

export interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
}

export interface OpenWikiFolderResult {
  tree: TreeNode[];
  initial_note_path: string | null;
  initial_html: string | null;
}
