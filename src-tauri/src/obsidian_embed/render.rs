//! Preprocess/postprocess Obsidian links and render markdown with embeds.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::markdown::render_markdown_safe;

use super::cache::RenderCache;
use super::index::VaultIndex;
use super::parse::{
    compute_skip_ranges, find_obsidian_spans_inner, link_display_text, obs_link_href,
    parse_embed_syntax, parse_wikilink_inner,
};
use super::resolve::{resolve_target, ResolveResult};

pub struct RenderContext<'a> {
    pub vault_root: PathBuf,
    pub index: &'a VaultIndex,
    pub cache: &'a mut RenderCache,
    pub visited: HashSet<PathBuf>,
    pub depth: u32,
    pub max_depth: u32,
}

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

#[allow(dead_code)]
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

pub fn render_markdown_with_embeds(path: &Path, ctx: &mut RenderContext<'_>) -> String {
    let canonical = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => return render_markdown_safe("*[Embed: invalid path]*"),
    };
    let mtime = match fs::metadata(&canonical) {
        Ok(m) => m.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH),
        Err(_) => std::time::SystemTime::UNIX_EPOCH,
    };
    if let Some(html) = ctx.cache.get(&canonical, mtime) {
        return html;
    }
    let expanded_md = get_expanded_markdown(&canonical, ctx);
    let raw_html = render_markdown_safe(&expanded_md);
    let html = postprocess_obsidian_html(&raw_html);
    ctx.cache.insert(canonical, mtime, html.clone());
    html
}
