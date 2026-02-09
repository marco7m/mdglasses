import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { applyHighlighting, configureHighlighting } from "./highlight";
import { normalizeBaseDir, resolvePath } from "./pathUtils";
import { getInitialFile, openMarkdownFile, openWikiFolder, watchPaths } from "./tauriApi";
import { applyTheme, isThemeId, loadThemePreference } from "./theme";
import { applySavedTreeWidth, initTreeResizer, renderTree, renderTreeSelection, setupTreeSearch, getLastSelectedPath } from "./treePanel";
import type { Mode } from "./types";
import { renderAppShell } from "./ui";
import "./styles.css";

interface AppState {
  mode: Mode;
  currentPath: string | null;
  currentBaseDir: string | null;
  wikiRoot: string | null;
}

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("Missing #app root element");

const { contentEl, treePanel, treeResizeHandle, titleEl, btnOpen, openMenu, themeSelect, treeSearch, treeHideToggle, breadcrumb } = renderAppShell(appRoot);

const state: AppState = {
  mode: "file",
  currentPath: null,
  currentBaseDir: null,
  wikiRoot: null,
};

function normalizeWatchedPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function showContent(html: string): void {
  contentEl.innerHTML = html;
}

function isExternalHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:");
}

function isIgnoredImageSource(src: string): boolean {
  return src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:");
}

function closeOpenMenu(): void {
  openMenu.classList.remove("is-open");
  openMenu.setAttribute("aria-hidden", "true");
}

async function rewriteImages(baseDir: string): Promise<void> {
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

async function renderMarkdownContent(html: string, baseDir: string): Promise<void> {
  showContent(html);
  await rewriteImages(baseDir);
  applyHighlighting(contentEl);
}

function getDisplayName(path: string): string {
  return path.split(/[/\\]/).pop() ?? "";
}

function updateBreadcrumb(path: string, wikiRoot: string | null): void {
  breadcrumb.innerHTML = "";
  if (wikiRoot) {
    const relativePath = path.replace(wikiRoot, "").replace(/^[/\\]/, "");
    const parts = relativePath.split(/[/\\]/).filter((p) => p);
    const rootName = wikiRoot.split(/[/\\]/).filter((p) => p).pop() || "Pasta";
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = rootName;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      if (state.wikiRoot) {
        void loadWiki(state.wikiRoot);
      }
    });
    breadcrumb.appendChild(link);
    parts.forEach((part, index) => {
      const separator = document.createElement("span");
      separator.className = "breadcrumb-separator";
      separator.textContent = " / ";
      breadcrumb.appendChild(separator);
      if (index === parts.length - 1) {
        const span = document.createElement("span");
        span.className = "breadcrumb-current";
        span.textContent = part;
        breadcrumb.appendChild(span);
      } else {
        const link = document.createElement("a");
        link.href = "#";
        link.textContent = part;
        const pathToPart = wikiRoot + "/" + parts.slice(0, index + 1).join("/");
        link.addEventListener("click", (e) => {
          e.preventDefault();
          void openWikiNote(pathToPart);
        });
        breadcrumb.appendChild(link);
      }
    });
  } else {
    const span = document.createElement("span");
    span.className = "breadcrumb-current";
    span.textContent = getDisplayName(path);
    breadcrumb.appendChild(span);
  }
}

async function loadFile(path: string, options: { watch?: boolean } = {}): Promise<void> {
  const result = await openMarkdownFile(path);

  state.mode = "file";
  state.currentPath = path;
  state.currentBaseDir = normalizeBaseDir(result.base_dir);
  state.wikiRoot = null;

  treePanel.classList.add("hidden");
  treePanel.innerHTML = "";
  titleEl.textContent = getDisplayName(path);
  updateBreadcrumb(path, null);

  await renderMarkdownContent(result.html, state.currentBaseDir);

  if (options.watch !== false) {
    await watchPaths([path]);
  }
}

async function openWikiNote(path: string): Promise<void> {
  if (!state.wikiRoot) return;

  const result = await openMarkdownFile(path);

  state.currentPath = path;
  state.currentBaseDir = state.wikiRoot;

  await renderMarkdownContent(result.html, state.wikiRoot);
  renderTreeSelection(treePanel, path);
  updateBreadcrumb(path, state.wikiRoot);
}

async function loadWiki(path: string): Promise<void> {
  const result = await openWikiFolder(path);

  state.mode = "wiki";
  state.wikiRoot = normalizeBaseDir(path);
  state.currentBaseDir = state.wikiRoot;

  treePanel.classList.remove("hidden");
  applySavedTreeWidth(treePanel);
  renderTree(treePanel, result.tree, result.initial_note_path, openWikiNote);

  if (result.initial_html && result.initial_note_path && state.wikiRoot) {
    state.currentPath = result.initial_note_path;
    await renderMarkdownContent(result.initial_html, state.wikiRoot);
    renderTreeSelection(treePanel, result.initial_note_path);
    updateBreadcrumb(result.initial_note_path, state.wikiRoot);
  } else {
    const lastSelected = getLastSelectedPath();
    if (lastSelected && state.wikiRoot) {
      try {
        await openWikiNote(lastSelected);
      } catch {
        state.currentPath = null;
        showContent("");
        breadcrumb.innerHTML = "";
      }
    } else {
      state.currentPath = null;
      showContent("");
      breadcrumb.innerHTML = "";
    }
  }

  const rootName = state.wikiRoot?.split(/[/\\]/).filter((p) => p).pop() || "Pasta";
  titleEl.textContent = rootName;
  await watchPaths([path]);
}

async function openRelativeLink(href: string): Promise<void> {
  const baseDir = state.mode === "wiki" ? state.wikiRoot : state.currentBaseDir;
  if (!baseDir) return;

  const resolvedPath = resolvePath(baseDir, decodeURIComponent(href));
  if (state.mode === "wiki") {
    await openWikiNote(resolvedPath);
  } else {
    await loadFile(resolvedPath);
  }
}

function setupTheme(): void {
  configureHighlighting();
  applyTheme(loadThemePreference(), themeSelect);

  themeSelect.addEventListener("change", () => {
    const selected = themeSelect.value;
    applyTheme(isThemeId(selected) ? selected : "light", themeSelect);
  });
}

function setupOpenMenu(): void {
  btnOpen.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = openMenu.classList.toggle("is-open");
    openMenu.setAttribute("aria-hidden", String(!isOpen));
  });

  openMenu.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  openMenu.querySelectorAll<HTMLElement>("[data-open]").forEach((element) => {
    element.addEventListener("click", async (event) => {
      try {
        closeOpenMenu();
        const kind = (event.currentTarget as HTMLElement).dataset.open;

        if (kind === "file") {
          const selected = await open({
            multiple: false,
            filters: [{ name: "Markdown", extensions: ["md"] }],
          });
          if (selected && typeof selected === "string") {
            await loadFile(selected);
          }
        } else if (kind === "folder") {
          const selected = await open({ directory: true });
          if (selected && typeof selected === "string") {
            await loadWiki(selected);
          }
        }
      } catch (error) {
        console.error(error);
      }
    });
  });

  document.addEventListener("click", () => {
    closeOpenMenu();
  });
}

function setupLinkHandler(): void {
  contentEl.addEventListener("click", (event) => {
    const anchor = (event.target as HTMLElement).closest("a[href]");
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#")) return;

    event.preventDefault();

    if (isExternalHref(href)) {
      void openUrl(href);
      return;
    }

    void openRelativeLink(href).catch(console.error);
  });
}

function setupWatchListener(): void {
  void listen<string[]>("watch-change", (event) => {
    if (!state.currentPath || event.payload.length === 0) return;

    const currentPath = normalizeWatchedPath(state.currentPath);
    const changedCurrentPath = event.payload.some((path) => {
      const normalized = normalizeWatchedPath(path);
      return currentPath === normalized || currentPath.startsWith(`${normalized}/`);
    });

    if (!changedCurrentPath) return;

    if (state.mode === "file") {
      void loadFile(state.currentPath, { watch: false }).catch(console.error);
    } else {
      void openWikiNote(state.currentPath).catch(console.error);
    }
  });
}

function bootstrap(): void {
  setupTheme();
  initTreeResizer(treePanel, treeResizeHandle);
  setupTreeSearch(treeSearch, treeHideToggle, treePanel);
  setupOpenMenu();
  setupLinkHandler();
  setupWatchListener();

  void getInitialFile().then((initialPath) => {
    if (!initialPath) return;
    if (initialPath.is_dir) {
      return loadWiki(initialPath.path);
    } else {
      return loadFile(initialPath.path);
    }
  }).catch(console.error);
}

bootstrap();
