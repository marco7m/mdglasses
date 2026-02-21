//! Parsing of `[[...]]` and `![[...]]` spans; skip ranges for code blocks and inline code.

use std::path::Path;

/// Inclusive (start, end) byte ranges that must not be scanned for [[ or ![[.
pub(crate) fn compute_skip_ranges(text: &str) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EmbedSpan {
    pub start: usize,
    pub end: usize,
    pub raw_inner: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HeadingOrBlock {
    Heading(String),
    Block(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedLink {
    pub target: String,
    pub subtarget: Option<HeadingOrBlock>,
    pub alias: Option<String>,
}

#[allow(dead_code)]
pub fn parse_embed_syntax(text: &str) -> Vec<EmbedSpan> {
    let skip = compute_skip_ranges(text);
    find_obsidian_spans_inner(text, &skip)
        .into_iter()
        .filter(|(is_embed, _, _, _)| *is_embed)
        .map(|(_, start, end, raw_inner)| EmbedSpan {
            start,
            end,
            raw_inner,
        })
        .collect()
}

/// Returns (is_embed, start, end, raw_inner).
pub(crate) fn find_obsidian_spans_inner(
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

pub fn parse_wikilink_inner(inner: &str) -> ParsedLink {
    let inner = inner.trim();
    let mut alias: Option<String> = None;
    let alias_split = inner.rsplit_once('|');
    let before_alias = match alias_split {
        Some((before, a)) => {
            alias = Some(a.trim().to_string());
            before
        }
        None => inner,
    };
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

pub fn obs_link_href(resolved_path: Option<&Path>) -> String {
    match resolved_path {
        Some(p) => {
            let s = p.to_string_lossy().replace('\\', "/");
            format!("app://open?path={}", percent_encode_path(&s))
        }
        None => "app://open?path=".to_string(),
    }
}

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
