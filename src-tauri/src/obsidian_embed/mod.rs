//! Obsidian-style embed resolution and expansion for `![[...]]` and `[[...]]` wikilinks.

mod cache;
mod index;
mod parse;
mod render;
mod resolve;

pub use cache::RenderCache;
pub use index::VaultIndex;
pub use render::{render_markdown_with_embeds, RenderContext};

#[cfg(test)]
mod tests {
    use std::collections::HashSet;
    use std::path::{Path, PathBuf};
    use std::time::SystemTime;

    use super::cache::{MAX_CACHE_ENTRIES, MAX_CACHE_SIZE_BYTES};
    use super::parse::{
        link_display_text, obs_link_href, parse_embed_syntax, parse_wikilink_inner, HeadingOrBlock,
        ParsedLink,
    };
    use super::resolve::{resolve_target, ResolveResult};
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
    fn cache_lru_evicts_oldest_when_limit_reached() {
        let mut cache = RenderCache::default();
        let mtime = SystemTime::UNIX_EPOCH;
        
        // Insert entries up to limit
        for i in 0..=MAX_CACHE_ENTRIES {
            let path = PathBuf::from(format!("/file{}.md", i));
            let html = format!("<h1>File {}</h1>", i);
            cache.insert(path, mtime, html);
        }
        
        let (count, _, _, _) = cache.get_stats();
        assert!(count <= MAX_CACHE_ENTRIES, "cache should not exceed max entries");
    }

    #[test]
    fn cache_lru_evicts_when_size_limit_reached() {
        let mut cache = RenderCache::default();
        let mtime = SystemTime::UNIX_EPOCH;
        
        // Insert large entries
        let large_html = "x".repeat(1024 * 1024); // 1MB each
        for i in 0..60 {
            let path = PathBuf::from(format!("/large{}.md", i));
            cache.insert(path, mtime, large_html.clone());
        }
        
        let (_, size_bytes, _, _) = cache.get_stats();
        assert!(size_bytes <= MAX_CACHE_SIZE_BYTES, "cache size should not exceed limit");
    }

    #[test]
    fn cache_tracks_hits_and_misses() {
        let mut cache = RenderCache::default();
        let path = PathBuf::from("/test.md");
        let mtime = SystemTime::UNIX_EPOCH;
        
        // Miss
        let result = cache.get(&path, mtime);
        assert!(result.is_none());
        
        // Insert
        cache.insert(path.clone(), mtime, "<h1>Test</h1>".to_string());
        
        // Hit
        let result = cache.get(&path, mtime);
        assert!(result.is_some());
        
        let (_, _, hits, misses) = cache.get_stats();
        assert_eq!(hits, 1);
        assert_eq!(misses, 1);
    }

    #[test]
    fn cache_updates_access_order_on_get() {
        let mut cache = RenderCache::default();
        let mtime = SystemTime::UNIX_EPOCH;
        
        let path1 = PathBuf::from("/file1.md");
        let path2 = PathBuf::from("/file2.md");
        
        cache.insert(path1.clone(), mtime, "<h1>1</h1>".to_string());
        cache.insert(path2.clone(), mtime, "<h1>2</h1>".to_string());
        
        // Access first file
        cache.get(&path1, mtime);
        
        // Insert another to trigger eviction
        for i in 3..=MAX_CACHE_ENTRIES + 1 {
            let path = PathBuf::from(format!("/file{}.md", i));
            cache.insert(path, mtime, format!("<h1>{}</h1>", i));
        }
        
        // path1 should still be in cache (most recently accessed)
        let result = cache.get(&path1, mtime);
        assert!(result.is_some(), "most recently accessed entry should remain");
    }

    #[test]
    fn cache_clear_resets_all_stats() {
        let mut cache = RenderCache::default();
        let mtime = SystemTime::UNIX_EPOCH;
        
        cache.insert(PathBuf::from("/test.md"), mtime, "<h1>Test</h1>".to_string());
        cache.get(&PathBuf::from("/test.md"), mtime);
        
        cache.clear();
        
        let (count, size, hits, misses) = cache.get_stats();
        assert_eq!(count, 0);
        assert_eq!(size, 0);
        assert_eq!(hits, 0);
        assert_eq!(misses, 0);
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
