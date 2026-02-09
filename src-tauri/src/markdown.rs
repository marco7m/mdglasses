use comrak::{markdown_to_html, Options};

/// Renders markdown to HTML with safe options (no raw HTML / unsafe content).
pub fn render_markdown_safe(md: &str) -> String {
    let mut options = Options::default();
    options.render.unsafe_ = false;
    markdown_to_html(md, &options)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heading_becomes_h1() {
        let html = render_markdown_safe("# Hi");
        assert!(html.contains("<h1>"), "expected h1 in {}", html);
        assert!(html.contains("Hi"), "expected content in {}", html);
    }

    #[test]
    fn link_has_href() {
        let html = render_markdown_safe("[text](https://example.com)");
        assert!(html.contains("href"), "expected href in {}", html);
        assert!(html.contains("https://example.com"), "expected url in {}", html);
    }

    #[test]
    fn image_has_src() {
        let html = render_markdown_safe("![alt](img.png)");
        assert!(html.contains("<img"), "expected img in {}", html);
        assert!(html.contains("src"), "expected src in {}", html);
        assert!(html.contains("img.png"), "expected path in {}", html);
    }

    #[test]
    fn code_inline_wrapped_in_code() {
        let html = render_markdown_safe("use `foo` here");
        assert!(html.contains("<code>"), "expected code in {}", html);
        assert!(html.contains("foo"), "expected content in {}", html);
    }

    #[test]
    fn code_block_has_pre() {
        let html = render_markdown_safe("```\nfn main() {}\n```");
        assert!(html.contains("<pre>"), "expected pre in {}", html);
        assert!(html.contains("<code>"), "expected code in {}", html);
    }

    #[test]
    fn unsafe_html_escaped() {
        let html = render_markdown_safe("<script>alert(1)</script>");
        assert!(!html.contains("<script>"), "raw script must not appear: {}", html);
    }
}
