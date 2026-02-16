//! Obsidian-style embed resolution and expansion for `![[...]]` and `[[...]]` wikilinks.
//!
//! Parsing is done with a manual scan (no regex) for speed and deterministic tests.
//! Code blocks and inline code are skipped so we do not replace inside them.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// Inclusive (start, end) byte ranges in the markdown that must not be scanned for [[ or ![[.
fn compute_skip_ranges(text: &str) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        // Fenced code block: ``` (optional info string) to closing ```
        if i + 3 <= bytes.len() && bytes[i] == b'`' && bytes[i + 1] == b'`' && bytes[i + 2] == b'`' {
            let start = i;
            i += 3;
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            if i < bytes.len() {
                i += 1;
            }
            while i + 3 <= bytes.len() {
                if bytes[i] == b'`' && bytes[i + 1] == b'`' && bytes[i + 2] == b'`' {
                    i += 3;
                    ranges.push((start, i));
                    break;
                }
                i += 1;
            }
            continue;
        }
        // Inline code: ` to next `
        if bytes[i] == b'`' {
            let start = i;
            i += 1;
            while i < bytes.len() && bytes[i] != b'`' {
                i += 1;
            }
            if i < bytes.len() {
                i += 1;
                ranges.push((start, i));
            }
            continue;
        }
        i += 1;
    }
    ranges
}

fn in_skip_range(pos: usize, skip: &[(usize, usize)]) -> bool {
    skip.iter().any(|&(s, e)| pos >= s && pos <= e)
}

/// Span of one `![[...]]` embed in the source text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EmbedSpan {
    pub start: usize,
    pub end: usize,
    pub raw_inner: String,
}

/// Subtarget inside a wikilink: heading or block ID.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HeadingOrBlock {
    Heading(String),
    Block(String),
}

/// Parsed wikilink inner content: target, optional #heading or ^block, optional |alias.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedLink {
    pub target: String,
    pub subtarget: Option<HeadingOrBlock>,
    pub alias: Option<String>,
}

/// Find all `![[` and matching `]]`; extract (start, end, raw_inner).
/// Single pass, no regex. Invalid (unclosed) `![[` is skipped (no trailing `]]`).
pub fn parse_embed_syntax(text: &str) -> Vec<EmbedSpan> {
    let skip = compute_skip_ranges(text);
    find_obsidian_spans_inner(text, &skip)
        .into_iter()
        .filter(|(is_embed, _, _, _)| *is_embed)
        .map(|(_, start, end, raw_inner)| EmbedSpan { start, end, raw_inner })
        .collect()
}

/// One span: (is_embed, start, end, raw_inner).
fn find_obsidian_spans_inner(
    text: &str,
    skip: &[(usize, usize)],
) -> Vec<(bool, usize, usize, String)> {
    let mut out = Vec::new();
    let bytes = text.as_bytes();
    let mut i = 0;
    while i + 2 <= bytes.len() {
        if bytes[i] == b'[' && bytes[i + 1] == b'[' {
            if in_skip_range(i, skip) {
                i += 1;
                continue;
            }
            let is_embed = i > 0 && bytes[i - 1] == b'!';
            let start = if is_embed { i - 1 } else { i };
            let content_start = i + 2;
            i += 2;
            while i < bytes.len() {
                if bytes[i] == b']' && i + 1 < bytes.len() && bytes[i + 1] == b']' {
                    let raw_inner = text[content_start..i].to_string();
                    out.push((is_embed, start, i + 2, raw_inner));
                    i += 2;
                    break;
                }
                i += 1;
            }
            if i >= bytes.len() {
                break;
            }
            continue;
        }
        i += 1;
    }
    out
}

/// Split inner on #, ^, |. First segment = target. Optional #heading or ^blockid; optional |alias.
pub fn parse_wikilink_inner(inner: &str) -> ParsedLink {
    let inner = inner.trim();
    let mut alias: Option<String> = None;

    // Find alias first (last | wins): "Note|Alias" or "Note#H|A"
    let alias_split = inner.rsplit_once('|');
    let before_alias = match alias_split {
        Some((before, a)) => {
            alias = Some(a.trim().to_string());
            before
        }
        None => inner,
    };

    // Then split on # or ^ for subtarget (first of # or ^ wins for subtarget)
    let rest = before_alias.trim();
    let (target, subtarget) = {
        let sharp = rest.find('#');
        let caret = rest.find('^');
        match (sharp, caret) {
            (None, None) => (rest.replace('\\', "/").trim().to_string(), None),
            (Some(s), None) => (
                rest[..s].replace('\\', "/").trim().to_string(),
                Some(HeadingOrBlock::Heading(rest[s + 1..].trim().to_string())),
            ),
            (None, Some(c)) => (
                rest[..c].replace('\\', "/").trim().to_string(),
                Some(HeadingOrBlock::Block(rest[c + 1..].trim().to_string())),
            ),
            (Some(s), Some(c)) => {
                if s < c {
                    (
                        rest[..s].replace('\\', "/").trim().to_string(),
                        Some(HeadingOrBlock::Heading(rest[s + 1..].trim().to_string())),
                    )
                } else {
                    (
                        rest[..c].replace('\\', "/").trim().to_string(),
                        Some(HeadingOrBlock::Block(rest[c + 1..].trim().to_string())),
                    )
                }
            }
        }
    };

    ParsedLink {
        target,
        subtarget,
        alias,
    }
}

/// Stable href for Obsidian wikilinks: app://open?path=<encoded path> or app://open?path= when unresolved.
pub fn obs_link_href(resolved_path: Option<&Path>) -> String {
    match resolved_path {
        Some(p) => {
            let s = p.to_string_lossy().replace('\\', "/");
            format!("app://open?path={}", percent_encode_path(&s))
        }
        None => "app://open?path=".to_string(),
    }
}

fn percent_encode_path(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'%' => out.push_str("%25"),
            b'?' => out.push_str("%3F"),
            b'#' => out.push_str("%23"),
            b'&' => out.push_str("%26"),
            b'=' => out.push_str("%3D"),
            b'+' => out.push_str("%2B"),
            b' ' => out.push_str("%20"),
            b'"' => out.push_str("%22"),
            b'<' => out.push_str("%3C"),
            b'>' => out.push_str("%3E"),
            _ if b.is_ascii_graphic() || b == b'/' => out.push(b as char),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// Display text for a wikilink: alias if set, else basename of target, else target including #heading or ^block if present.
pub fn link_display_text(parsed: &ParsedLink) -> String {
    if let Some(ref alias) = parsed.alias {
        if !alias.is_empty() {
            return alias.clone();
        }
    }
    let target = parsed.target.trim();
    let base: String = if target.contains('/') {
        target.rsplit('/').next().unwrap_or(target).to_string()
    } else {
        target.to_string()
    };
    let base = base.trim_end_matches(".md").to_string();
    if let Some(ref s) = parsed.subtarget {
        let suffix = match s {
            HeadingOrBlock::Heading(h) => format!("#{}", h),
            HeadingOrBlock::Block(b) => format!("^{}", b),
        };
        format!("{}{}", base, suffix)
    } else {
        base
    }
}

// ---------------------------------------------------------------------------
// Vault index and resolution
// ---------------------------------------------------------------------------

/// Result of resolving an embed target: file path, placeholder for non-md, or error.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolveResult {
    Resolved(PathBuf),
    Placeholder(PathBuf),
    NotFound,
    Ambiguous(Vec<PathBuf>),
}

/// Normalize path key: forward slashes, no leading slash.
fn normalize_rel_key(rel: &str) -> String {
    rel.replace('\\', "/").trim_matches('/').to_string()
}

/// Index of vault files for O(1) resolution by relative path or basename.
pub struct VaultIndex {
    /// Relative path (normalized) -> canonical PathBuf.
    pub by_rel_path: HashMap<String, PathBuf>,
    /// Basename (no extension) -> list of canonical paths (for ambiguity).
    pub by_basename: HashMap<String, Vec<PathBuf>>,
}

impl VaultIndex {
    /// Build index by walking vault_root; only .md files for phase 1.
    /// Canonicalize once per file during build.
    pub fn build_index(vault_root: &Path) -> Result<VaultIndex, String> {
        let root_canon = vault_root.canonicalize().map_err(|e| e.to_string())?;
        let mut by_rel_path = HashMap::new();
        let mut by_basename: HashMap<String, Vec<PathBuf>> = HashMap::new();

        walk_index(&root_canon, &root_canon, &mut by_rel_path, &mut by_basename)?;

        // Deterministic: sort paths per basename for consistent "first" choice
        for paths in by_basename.values_mut() {
            paths.sort();
        }

        Ok(VaultIndex {
            by_rel_path,
            by_basename,
        })
    }
}

fn walk_index(
    vault_root: &Path,
    dir: &Path,
    by_rel_path: &mut HashMap<String, PathBuf>,
    by_basename: &mut HashMap<String, Vec<PathBuf>>,
) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.starts_with('.') {
                continue;
            }
            walk_index(vault_root, &path, by_rel_path, by_basename)?;
        } else if path.extension().map(|e| e == "md").unwrap_or(false) {
            let canonical = path.canonicalize().map_err(|e| e.to_string())?;
            let rel = canonical.strip_prefix(vault_root).map_err(|e| e.to_string())?;
            let rel_key = rel.to_str().unwrap_or("").replace('\\', "/");
            let rel_key = rel_key.trim_matches('/').to_string();
            by_rel_path.insert(rel_key.clone(), canonical.clone());
            // With extension for by_rel_path we also allow lookup with .md
            let without_md = rel_key.strip_suffix(".md").unwrap_or(&rel_key);
            if without_md != rel_key {
                by_rel_path.insert(without_md.to_string(), canonical.clone());
            }
            let base = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
            by_basename.entry(base).or_default().push(canonical);
        }
    }
    Ok(())
}

/// Resolve a parsed link against the vault index. Prefer exact rel path, then basename.
/// Deterministic: when multiple basenames match, pick shortest path (first after sort).
pub fn resolve_target(
    parsed: &ParsedLink,
    index: &VaultIndex,
    _vault_root: &Path,
) -> ResolveResult {
    let target = normalize_rel_key(parsed.target.trim());
    if target.is_empty() {
        return ResolveResult::NotFound;
    }

    // If target looks like a path (contains /), try exact rel path first
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

    // Basename lookup (no path)
    let base = if target.ends_with(".md") {
        target.strip_suffix(".md").unwrap_or(&target).to_string()
    } else {
        target
    };
    if let Some(paths) = index.by_basename.get(&base) {
        if paths.is_empty() {
            return ResolveResult::NotFound;
        }
        if paths.len() == 1 {
            return path_to_result(paths[0].clone());
        }
        // Deterministic: already sorted in build_index; pick first (shortest path)
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

// ---------------------------------------------------------------------------
// Cache and expansion
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct CachedEntry {
    pub mtime: SystemTime,
    pub html: String,
}

pub struct RenderCache {
    pub entries: HashMap<PathBuf, CachedEntry>,
}

impl Default for RenderCache {
    fn default() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }
}

impl RenderCache {
    pub fn get(&self, path: &Path, mtime: SystemTime) -> Option<String> {
        self.entries.get(path).and_then(|e| {
            if e.mtime == mtime {
                Some(e.html.clone())
            } else {
                None
            }
        })
    }

    pub fn insert(&mut self, path: PathBuf, mtime: SystemTime, html: String) {
        self.entries.insert(path, CachedEntry { mtime, html });
    }
}

pub struct RenderContext<'a> {
    pub vault_root: PathBuf,
    pub index: &'a VaultIndex,
    pub cache: &'a mut RenderCache,
    pub visited: HashSet<PathBuf>,
    pub depth: u32,
    pub max_depth: u32,
}

/// Single preprocessing entry: replace both ![[...]] (embeds) and [[...]] (wikilinks) with
/// markdown so comrak emits normal links/HTML. Respects code-block and inline-code skip ranges.
/// Processes spans from end to start to preserve indices.
pub fn preprocess_obsidian_links(markdown: &str, ctx: &mut RenderContext<'_>) -> String {
    let skip = compute_skip_ranges(markdown);
    let mut spans = find_obsidian_spans_inner(markdown, &skip);
    if spans.is_empty() {
        return markdown.to_string();
    }
    spans.sort_by(|a, b| b.1.cmp(&a.1));
    let mut out = markdown.to_string();
    for (is_embed, start, end, raw_inner) in spans {
        let replacement = if is_embed {
            let parsed = parse_wikilink_inner(&raw_inner);
            let resolved = resolve_target(&parsed, ctx.index, &ctx.vault_root);
            match resolved {
                ResolveResult::Resolved(path) => get_expanded_markdown(&path, ctx),
                ResolveResult::Placeholder(path) => {
                    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("asset");
                    let href = path.to_string_lossy();
                    format!("[Asset: {}](file:///{})", name, href.replace('\\', "/"))
                }
                ResolveResult::NotFound => format!("*[Embed: {} (not found)]*", parsed.target),
                ResolveResult::Ambiguous(_) => format!("*[Embed: {} (ambiguous)]*", parsed.target),
            }
        } else {
            let parsed = parse_wikilink_inner(&raw_inner);
            let resolved = resolve_target(&parsed, ctx.index, &ctx.vault_root);
            let path_opt = match &resolved {
                ResolveResult::Resolved(p) | ResolveResult::Placeholder(p) => Some(p.as_path()),
                _ => None,
            };
            let display = link_display_text(&parsed);
            let href = obs_link_href(path_opt);
            format!("[{}]({})", display, href)
        };
        out.replace_range(start..end, &replacement);
    }
    out
}

/// Replace each ![[...]] with the expanded *markdown* of the target (so the final
/// document is one markdown string for a single comrak pass). Processes from end to start.
/// Prefer preprocess_obsidian_links for full wikilink + embed handling.
pub fn expand_embeds(markdown: &str, ctx: &mut RenderContext<'_>) -> String {
    let spans = parse_embed_syntax(markdown);
    if spans.is_empty() {
        return markdown.to_string();
    }
    let mut out = markdown.to_string();
    for span in spans.into_iter().rev() {
        let parsed = parse_wikilink_inner(&span.raw_inner);
        let resolved = resolve_target(&parsed, ctx.index, &ctx.vault_root);
        let replacement = match resolved {
            ResolveResult::Resolved(path) => get_expanded_markdown(&path, ctx),
            ResolveResult::Placeholder(path) => {
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("asset");
                let href = path.to_string_lossy();
                format!("[Asset: {}](file:///{})", name, href.replace('\\', "/"))
            }
            ResolveResult::NotFound => format!("*[Embed: {} (not found)]*", parsed.target),
            ResolveResult::Ambiguous(_) => format!("*[Embed: {} (ambiguous)]*", parsed.target),
        };
        out.replace_range(span.start..span.end, &replacement);
    }
    out
}

/// Return expanded markdown for a path (recursive embeds inlined as markdown). Used by
/// expand_embeds so we inject markdown not HTML, avoiding comrak stripping raw HTML.
fn get_expanded_markdown(path: &Path, ctx: &mut RenderContext<'_>) -> String {
    let canonical = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => return "*[Embed: invalid path]*".to_string(),
    };

    if ctx.visited.contains(&canonical) {
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("?");
        return format!("*[Embed: {} (cycle)]*", name);
    }
    if ctx.depth > ctx.max_depth {
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("?");
        return format!("*[Embed: {} (depth limit)]*", name);
    }

    ctx.visited.insert(canonical.clone());
    ctx.depth += 1;

    let content = match fs::read_to_string(&canonical) {
        Ok(c) => c,
        Err(_) => {
            ctx.visited.remove(&canonical);
            ctx.depth -= 1;
            return "*[Embed: read error]*".to_string();
        }
    };

    let expanded = preprocess_obsidian_links(&content, ctx);
    ctx.visited.remove(&canonical);
    ctx.depth -= 1;
    expanded
}

/// Post-process HTML: add class="obs-link" and data-obs-path to app://open links;
/// replace empty-path links with <span class="obs-link broken">display</span>.
pub fn postprocess_obsidian_html(html: &str) -> String {
    const PREFIX: &str = "href=\"app://open?path=";
    let mut out = String::with_capacity(html.len());
    let mut last = 0;
    let bytes = html.as_bytes();
    let mut i = 0;
    while i + PREFIX.len() <= bytes.len() {
        if &bytes[i..i + PREFIX.len()] != PREFIX.as_bytes() {
            i += 1;
            continue;
        }
        let tag_start = html[..i].rfind('<').unwrap_or(i);
        out.push_str(&html[last..tag_start]);
        i += PREFIX.len();
        let path_start = i;
        while i < bytes.len() && bytes[i] != b'"' {
            i += 1;
        }
        let path = &html[path_start..i];
        i += 1;
        let after_open_gt = html[i..].find('>').map(|j| i + j + 1).unwrap_or(i);
        let inner_start = after_open_gt;
        let inner_end = html[inner_start..]
            .find("</a>")
            .map(|j| inner_start + j)
            .unwrap_or(inner_start);
        let inner = &html[inner_start..inner_end];
        let after_close = inner_end + 4;

        if path.is_empty() {
            out.push_str("<span class=\"obs-link broken\">");
            out.push_str(&escape_html_text(inner));
            out.push_str("</span>");
        } else {
            let a_tag = &html[tag_start..inner_start];
            let before_gt = a_tag.rfind('>').unwrap_or(a_tag.len());
            let frag = &a_tag[..before_gt];
            if let Some(pos) = frag.find("class=\"") {
                let insert = pos + 7;
                out.push_str(&frag[..insert]);
                out.push_str("obs-link ");
                out.push_str(&frag[insert..]);
                out.push_str(&format!(" data-obs-path=\"{}\"", escape_attr(path)));
            } else {
                out.push_str(frag);
                out.push_str(&format!(" class=\"obs-link\" data-obs-path=\"{}\"", escape_attr(path)));
            }
            out.push_str(&a_tag[before_gt..]);
            out.push_str(inner);
            out.push_str("</a>");
        }
        last = after_close;
        i = after_close;
    }
    out.push_str(&html[last..]);
    out
}

fn escape_html_text(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn escape_attr(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Render a single file with embed expansion. Checks cache (mtime), then get_expanded_markdown
/// and one markdown_to_html pass. Root path is not added to visited (only embeds are).
pub fn render_markdown_with_embeds(path: &Path, ctx: &mut RenderContext<'_>) -> String {
    let canonical = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            return crate::markdown::render_markdown_safe("*[Embed: invalid path]*");
        }
    };

    let mtime = match fs::metadata(&canonical) {
        Ok(m) => m.modified().unwrap_or(SystemTime::UNIX_EPOCH),
        Err(_) => SystemTime::UNIX_EPOCH,
    };
    if let Some(html) = ctx.cache.get(&canonical, mtime) {
        return html;
    }

    let expanded_md = get_expanded_markdown(&canonical, ctx);
    let raw_html = crate::markdown::render_markdown_safe(&expanded_md);
    let html = postprocess_obsidian_html(&raw_html);
    ctx.cache.insert(canonical, mtime, html.clone());
    html
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_embed_syntax_simple() {
        let spans = parse_embed_syntax("![[Note]]");
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].start, 0);
        assert_eq!(spans[0].end, 9);
        assert_eq!(spans[0].raw_inner, "Note");
    }

    #[test]
    fn parse_embed_syntax_path() {
        let spans = parse_embed_syntax("![[path/to/Note]]");
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].raw_inner, "path/to/Note");
    }

    #[test]
    fn parse_embed_syntax_heading() {
        let spans = parse_embed_syntax("![[Note#H]]");
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].raw_inner, "Note#H");
    }

    #[test]
    fn parse_embed_syntax_block() {
        let spans = parse_embed_syntax("![[Note^abc]]");
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].raw_inner, "Note^abc");
    }

    #[test]
    fn parse_embed_syntax_alias() {
        let spans = parse_embed_syntax("![[Note|Alias]]");
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].raw_inner, "Note|Alias");
    }

    #[test]
    fn parse_embed_syntax_multiple() {
        let spans = parse_embed_syntax("a ![[A]] b ![[B]] c");
        assert_eq!(spans.len(), 2);
        assert_eq!(spans[0].raw_inner, "A");
        assert_eq!(spans[1].raw_inner, "B");
    }

    #[test]
    fn parse_embed_syntax_no_trailing_ignored() {
        let spans = parse_embed_syntax("![[Note");
        assert_eq!(spans.len(), 0);
    }

    #[test]
    fn parse_embed_syntax_skipped_inside_code_block() {
        let md = "```\n![[Link]]\n```";
        let spans = parse_embed_syntax(md);
        assert_eq!(spans.len(), 0, "![[Link]] inside fenced code block should be skipped");
    }

    #[test]
    fn parse_embed_syntax_skipped_inside_inline_code() {
        let spans = parse_embed_syntax("text `![[x]]` more");
        assert_eq!(spans.len(), 0, "![[x]] inside inline code should be skipped");
    }

    #[test]
    fn link_display_text_alias() {
        let p = ParsedLink {
            target: "path/to/Note".to_string(),
            subtarget: None,
            alias: Some("My Alias".to_string()),
        };
        assert_eq!(link_display_text(&p), "My Alias");
    }

    #[test]
    fn link_display_text_basename() {
        let p = ParsedLink {
            target: "path/to/Note".to_string(),
            subtarget: None,
            alias: None,
        };
        assert_eq!(link_display_text(&p), "Note");
    }

    #[test]
    fn link_display_text_heading() {
        let p = ParsedLink {
            target: "Note".to_string(),
            subtarget: Some(HeadingOrBlock::Heading("H".to_string())),
            alias: None,
        };
        assert_eq!(link_display_text(&p), "Note#H");
    }

    #[test]
    fn obs_link_href_resolved() {
        let p = Path::new("/vault/Note.md");
        let h = obs_link_href(Some(p));
        assert!(h.starts_with("app://open?path="));
        assert!(h.contains("Note"));
    }

    #[test]
    fn obs_link_href_empty() {
        assert_eq!(obs_link_href(None), "app://open?path=");
    }

    #[test]
    fn parse_wikilink_inner_note() {
        let p = parse_wikilink_inner("Note");
        assert_eq!(p.target, "Note");
        assert!(p.subtarget.is_none());
        assert!(p.alias.is_none());
    }

    #[test]
    fn parse_wikilink_inner_path() {
        let p = parse_wikilink_inner("path/to/Note");
        assert_eq!(p.target, "path/to/Note");
        assert!(p.subtarget.is_none());
        assert!(p.alias.is_none());
    }

    #[test]
    fn parse_wikilink_inner_heading() {
        let p = parse_wikilink_inner("Note#H");
        assert_eq!(p.target, "Note");
        assert!(matches!(&p.subtarget, Some(HeadingOrBlock::Heading(h)) if h == "H"));
        assert!(p.alias.is_none());
    }

    #[test]
    fn parse_wikilink_inner_block() {
        let p = parse_wikilink_inner("Note^abc");
        assert_eq!(p.target, "Note");
        assert!(matches!(&p.subtarget, Some(HeadingOrBlock::Block(b)) if b == "abc"));
        assert!(p.alias.is_none());
    }

    #[test]
    fn parse_wikilink_inner_alias() {
        let p = parse_wikilink_inner("Note|Alias");
        assert_eq!(p.target, "Note");
        assert!(p.subtarget.is_none());
        assert_eq!(p.alias.as_deref(), Some("Alias"));
    }

    #[test]
    fn parse_wikilink_inner_heading_and_alias() {
        let p = parse_wikilink_inner("Note#H|Alias");
        assert_eq!(p.target, "Note");
        assert!(matches!(&p.subtarget, Some(HeadingOrBlock::Heading(h)) if h == "H"));
        assert_eq!(p.alias.as_deref(), Some("Alias"));
    }

    // ---------- Resolution tests (temp vault) ----------
    #[test]
    fn resolve_rel_path_and_basename() {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path();
        let a_md = root.join("a.md");
        let sub = root.join("sub");
        std::fs::create_dir_all(&sub).unwrap();
        let b_md = sub.join("b.md");
        std::fs::write(&a_md, "# A").unwrap();
        std::fs::write(&b_md, "# B").unwrap();

        let index = VaultIndex::build_index(root).unwrap();
        let vault = root.canonicalize().unwrap();

        let p_a = parse_wikilink_inner("a");
        let res_a = resolve_target(&p_a, &index, &vault);
        assert!(matches!(&res_a, ResolveResult::Resolved(p) if p.ends_with("a.md")));

        let p_sub_b = parse_wikilink_inner("sub/b");
        let res_b = resolve_target(&p_sub_b, &index, &vault);
        assert!(matches!(&res_b, ResolveResult::Resolved(p) if p.ends_with("b.md") && p.parent().unwrap().ends_with("sub")));

        let p_basename_b = parse_wikilink_inner("b");
        let res_b2 = resolve_target(&p_basename_b, &index, &vault);
        assert!(matches!(&res_b2, ResolveResult::Resolved(p) if p.ends_with("b.md")));
    }

    #[test]
    fn resolve_deterministic_when_duplicate_basename() {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path();
        let foo = root.join("foo");
        std::fs::create_dir_all(&foo).unwrap();
        std::fs::create_dir_all(foo.join("bar")).unwrap();
        let a1 = root.join("a.md");
        let a2 = foo.join("a.md");
        let a3 = foo.join("bar").join("a.md");
        std::fs::write(&a1, "# A1").unwrap();
        std::fs::write(&a2, "# A2").unwrap();
        std::fs::write(&a3, "# A3").unwrap();

        let index = VaultIndex::build_index(root).unwrap();
        let vault = root.canonicalize().unwrap();
        let p = parse_wikilink_inner("a");
        let res = resolve_target(&p, &index, &vault);
        let path = match &res {
            ResolveResult::Resolved(p) => p.clone(),
            _ => panic!("expected Resolved"),
        };
        // Sorted: shortest path first (a.md at root, then foo/a.md, then foo/bar/a.md)
        assert!(path.ends_with("a.md"));
        // Deterministic: we pick first after sort
        let first = index.by_basename.get("a").unwrap()[0].clone();
        assert_eq!(path, first);
    }

    #[test]
    fn resolve_not_found() {
        let dir = tempfile::TempDir::new().unwrap();
        let index = VaultIndex::build_index(dir.path()).unwrap();
        let vault = dir.path().canonicalize().unwrap();
        let p = parse_wikilink_inner("Nonexistent");
        let res = resolve_target(&p, &index, &vault);
        assert!(matches!(res, ResolveResult::NotFound));
    }

    // ---------- Expansion tests ----------
    #[test]
    fn expand_single_embed() {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path();
        std::fs::write(root.join("A.md"), "# A").unwrap();
        std::fs::write(root.join("B.md"), "# B").unwrap();
        std::fs::write(
            root.join("A.md"),
            "Before\n\n![[B]]\n\nAfter",
        )
        .unwrap();

        let index = VaultIndex::build_index(root).unwrap();
        let vault = root.canonicalize().unwrap();
        let mut cache = RenderCache::default();
        let mut ctx = RenderContext {
            vault_root: vault.clone(),
            index: &index,
            cache: &mut cache,
            visited: HashSet::new(),
            depth: 0,
            max_depth: 5,
        };
        let html = render_markdown_with_embeds(&root.join("A.md"), &mut ctx);
        assert!(html.contains("<h1>"), "expected h1 in {}", html);
        assert!(html.contains("B"), "expected B content in {}", html);
        assert!(html.contains("Before"), "expected Before in {}", html);
        assert!(html.contains("After"), "expected After in {}", html);
    }

    #[test]
    fn expand_nested_embed() {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path();
        std::fs::write(root.join("A.md"), "A ![[B]]").unwrap();
        std::fs::write(root.join("B.md"), "B ![[C]]").unwrap();
        std::fs::write(root.join("C.md"), "# C").unwrap();

        let index = VaultIndex::build_index(root).unwrap();
        let vault = root.canonicalize().unwrap();
        let mut cache = RenderCache::default();
        let mut ctx = RenderContext {
            vault_root: vault,
            index: &index,
            cache: &mut cache,
            visited: HashSet::new(),
            depth: 0,
            max_depth: 5,
        };
        let html = render_markdown_with_embeds(&root.join("A.md"), &mut ctx);
        assert!(html.contains("A "), "{}", html);
        assert!(html.contains("B "), "{}", html);
        assert!(html.contains("C"), "{}", html);
    }

    #[test]
    fn expand_cycle_detection() {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path();
        std::fs::write(root.join("A.md"), "A ![[B]]").unwrap();
        std::fs::write(root.join("B.md"), "B ![[A]]").unwrap();

        let index = VaultIndex::build_index(root).unwrap();
        let vault = root.canonicalize().unwrap();
        let mut cache = RenderCache::default();
        let mut ctx = RenderContext {
            vault_root: vault,
            index: &index,
            cache: &mut cache,
            visited: HashSet::new(),
            depth: 0,
            max_depth: 5,
        };
        let html = render_markdown_with_embeds(&root.join("A.md"), &mut ctx);
        assert!(html.contains("A "), "{}", html);
        assert!(html.contains("B "), "{}", html);
        assert!(html.contains("cycle"), "expected cycle placeholder in {}", html);
    }

    #[test]
    fn expand_depth_limit() {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path();
        std::fs::write(root.join("0.md"), "0 ![[1]]").unwrap();
        std::fs::write(root.join("1.md"), "1 ![[2]]").unwrap();
        std::fs::write(root.join("2.md"), "2 ![[3]]").unwrap();
        std::fs::write(root.join("3.md"), "3 ![[4]]").unwrap();
        std::fs::write(root.join("4.md"), "4 ![[5]]").unwrap();
        std::fs::write(root.join("5.md"), "# Five").unwrap();

        let index = VaultIndex::build_index(root).unwrap();
        let vault = root.canonicalize().unwrap();
        let mut cache = RenderCache::default();
        let mut ctx = RenderContext {
            vault_root: vault,
            index: &index,
            cache: &mut cache,
            visited: HashSet::new(),
            depth: 0,
            max_depth: 3,
        };
        let html = render_markdown_with_embeds(&root.join("0.md"), &mut ctx);
        assert!(html.contains("depth limit"), "expected depth limit placeholder in {}", html);
    }

    #[test]
    fn wikilink_renders_as_link_no_raw_brackets() {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path();
        std::fs::write(root.join("Note.md"), "# Note").unwrap();
        std::fs::write(root.join("A.md"), "See [[Note]] here").unwrap();

        let index = VaultIndex::build_index(root).unwrap();
        let vault = root.canonicalize().unwrap();
        let mut cache = RenderCache::default();
        let mut ctx = RenderContext {
            vault_root: vault,
            index: &index,
            cache: &mut cache,
            visited: HashSet::new(),
            depth: 0,
            max_depth: 5,
        };
        let html = render_markdown_with_embeds(&root.join("A.md"), &mut ctx);
        assert!(!html.contains("[[Note]]"), "wikilink should be replaced, no raw [[Note]] in {}", html);
        assert!(html.contains("app://open?path="), "expected app link in {}", html);
        assert!(html.contains("obs-link") || html.contains("href="), "expected link styling or href");
    }

    #[test]
    fn wikilink_broken_renders_as_broken_or_empty_path() {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path();
        std::fs::write(root.join("A.md"), "See [[Missing]] here").unwrap();

        let index = VaultIndex::build_index(root).unwrap();
        let vault = root.canonicalize().unwrap();
        let mut cache = RenderCache::default();
        let mut ctx = RenderContext {
            vault_root: vault,
            index: &index,
            cache: &mut cache,
            visited: HashSet::new(),
            depth: 0,
            max_depth: 5,
        };
        let html = render_markdown_with_embeds(&root.join("A.md"), &mut ctx);
        assert!(!html.contains("[[Missing]]"), "broken wikilink should be replaced");
        let has_broken = html.contains("obs-link broken") || html.contains("app://open?path=\"\"") || (html.contains("app://open?path=") && html.contains("Missing"));
        assert!(has_broken, "expected broken link marker in {}", html);
    }

    #[test]
    fn embed_no_literal_in_html() {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path();
        std::fs::write(root.join("B.md"), "# B").unwrap();
        std::fs::write(root.join("A.md"), "Before ![[B]] After").unwrap();

        let index = VaultIndex::build_index(root).unwrap();
        let vault = root.canonicalize().unwrap();
        let mut cache = RenderCache::default();
        let mut ctx = RenderContext {
            vault_root: vault,
            index: &index,
            cache: &mut cache,
            visited: HashSet::new(),
            depth: 0,
            max_depth: 5,
        };
        let html = render_markdown_with_embeds(&root.join("A.md"), &mut ctx);
        assert!(!html.contains("![["), "embed syntax must not appear in output HTML");
    }

    #[test]
    fn normal_markdown_link_unchanged() {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path();
        std::fs::write(root.join("A.md"), "Link: [text](https://x.com)").unwrap();

        let index = VaultIndex::build_index(root).unwrap();
        let vault = root.canonicalize().unwrap();
        let mut cache = RenderCache::default();
        let mut ctx = RenderContext {
            vault_root: vault,
            index: &index,
            cache: &mut cache,
            visited: HashSet::new(),
            depth: 0,
            max_depth: 5,
        };
        let html = render_markdown_with_embeds(&root.join("A.md"), &mut ctx);
        assert!(html.contains("https://x.com"), "normal markdown link href should be preserved: {}", html);
    }

    #[test]
    fn wikilink_inside_inline_code_not_replaced() {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path();
        std::fs::write(root.join("Note.md"), "# Note").unwrap();
        std::fs::write(root.join("A.md"), "Code: `[[Link]]` end").unwrap();

        let index = VaultIndex::build_index(root).unwrap();
        let vault = root.canonicalize().unwrap();
        let mut cache = RenderCache::default();
        let mut ctx = RenderContext {
            vault_root: vault,
            index: &index,
            cache: &mut cache,
            visited: HashSet::new(),
            depth: 0,
            max_depth: 5,
        };
        let html = render_markdown_with_embeds(&root.join("A.md"), &mut ctx);
        assert!(html.contains("[[Link]]"), "[[Link]] inside inline code should remain literal: {}", html);
    }

    #[test]
    fn cache_hit_when_mtime_unchanged() {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path();
        std::fs::write(root.join("x.md"), "# X").unwrap();

        let index = VaultIndex::build_index(root).unwrap();
        let vault = root.canonicalize().unwrap();
        let mut cache = RenderCache::default();
        let mut ctx = RenderContext {
            vault_root: vault,
            index: &index,
            cache: &mut cache,
            visited: HashSet::new(),
            depth: 0,
            max_depth: 5,
        };
        let html1 = render_markdown_with_embeds(&root.join("x.md"), &mut ctx);
        let html2 = render_markdown_with_embeds(&root.join("x.md"), &mut ctx);
        assert_eq!(html1, html2);
        assert!(html1.contains("X"));
    }

    #[test]
    fn cache_invalidates_when_mtime_changes() {
        let dir = tempfile::TempDir::new().unwrap();
        let root = dir.path();
        let path = root.join("y.md");
        std::fs::write(&path, "# Y1").unwrap();

        let index = VaultIndex::build_index(root).unwrap();
        let vault = root.canonicalize().unwrap();
        let mut cache = RenderCache::default();
        let mut ctx = RenderContext {
            vault_root: vault,
            index: &index,
            cache: &mut cache,
            visited: HashSet::new(),
            depth: 0,
            max_depth: 5,
        };
        let html1 = render_markdown_with_embeds(&path, &mut ctx);
        assert!(html1.contains("Y1"));

        std::fs::write(&path, "# Y2").unwrap();

        let html2 = render_markdown_with_embeds(&path, &mut ctx);
        assert!(html2.contains("Y2"));
        assert!(!html2.contains("Y1"));
    }
}
