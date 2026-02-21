import { convertFileSrc } from "@tauri-apps/api/core";
import { injectCodeBlockCopyButtons } from "./codeBlockCopy";
import { applyHighlighting } from "./highlight";
import { resolvePath } from "../../core/pathUtils";

export function getDisplayName(path: string): string {
  return path.split(/[/\\]/).pop() ?? "";
}

export function isExternalHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:");
}

export function isIgnoredImageSource(src: string): boolean {
  return src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:");
}

export function showContent(contentEl: HTMLElement, html: string): void {
  contentEl.innerHTML = html;
}

export async function rewriteImages(contentEl: HTMLElement, baseDir: string): Promise<void> {
  const images = contentEl.querySelectorAll<HTMLImageElement>(".markdown-body img[src]");
  for (const image of images) {
    const src = image.getAttribute("src");
    if (!src || isIgnoredImageSource(src)) continue;
    try {
      const absolutePath = resolvePath(baseDir, decodeURIComponent(src));
      image.src = await convertFileSrc(absolutePath);
    } catch {
      // Keep original source if conversion fails.
    }
  }
}

export async function renderMarkdownContent(
  contentEl: HTMLElement,
  html: string,
  baseDir: string
): Promise<void> {
  showContent(contentEl, html);
  await rewriteImages(contentEl, baseDir);
  applyHighlighting(contentEl);
  injectCodeBlockCopyButtons(contentEl);
}

export interface BreadcrumbCallbacks {
  onLoadWiki: (wikiRoot: string) => void;
  onOpenWikiNote: (path: string) => void;
}

export function updateBreadcrumb(
  breadcrumb: HTMLElement,
  path: string,
  wikiRoot: string | null,
  callbacks: BreadcrumbCallbacks
): void {
  breadcrumb.innerHTML = "";
  breadcrumb.setAttribute("title", path);

  if (wikiRoot) {
    const relativePath = path.replace(wikiRoot, "").replace(/^[/\\]/, "");
    const parts = relativePath.split(/[/\\]/).filter((p) => p);
    const rootName = wikiRoot.split(/[/\\]/).filter((p) => p).pop() || "Pasta";

    const rootLink = document.createElement("a");
    rootLink.href = "#";
    rootLink.className = "breadcrumb-link";
    rootLink.textContent = rootName;
    rootLink.setAttribute("title", wikiRoot);
    rootLink.addEventListener("click", (e) => {
      e.preventDefault();
      callbacks.onLoadWiki(wikiRoot);
    });
    breadcrumb.appendChild(rootLink);

    parts.forEach((part, index) => {
      const separator = document.createElement("span");
      separator.className = "breadcrumb-separator";
      separator.textContent = " / ";
      separator.setAttribute("aria-hidden", "true");
      breadcrumb.appendChild(separator);

      if (index === parts.length - 1) {
        const span = document.createElement("span");
        span.className = "breadcrumb-current";
        span.textContent = part;
        const fullPathToPart = wikiRoot + "/" + parts.slice(0, index + 1).join("/");
        span.setAttribute("title", fullPathToPart);
        breadcrumb.appendChild(span);
      } else {
        const link = document.createElement("a");
        link.href = "#";
        link.className = "breadcrumb-link";
        link.textContent = part;
        const pathToPart = wikiRoot + "/" + parts.slice(0, index + 1).join("/");
        link.setAttribute("title", pathToPart);
        link.addEventListener("click", (e) => {
          e.preventDefault();
          callbacks.onOpenWikiNote(pathToPart);
        });
        breadcrumb.appendChild(link);
      }
    });
  } else {
    const span = document.createElement("span");
    span.className = "breadcrumb-current";
    span.textContent = getDisplayName(path);
    span.setAttribute("title", path);
    breadcrumb.appendChild(span);
  }
}
