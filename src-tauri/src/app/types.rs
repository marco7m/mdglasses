pub type AppResult<T> = Result<T, String>;

#[derive(serde::Serialize)]
pub struct OpenMarkdownFileResult {
    pub raw_md: String,
    pub html: String,
    pub base_dir: String,
}

#[derive(serde::Serialize)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub children: Vec<TreeNode>,
}

#[derive(serde::Serialize)]
pub struct OpenWikiFolderResult {
    pub tree: Vec<TreeNode>,
    pub initial_note_path: Option<String>,
    pub initial_html: Option<String>,
}

#[derive(Clone, serde::Serialize)]
pub struct InitialPath {
    pub path: String,
    pub is_dir: bool,
}
