import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { injectCodeBlockCopyButtons } from "./codeBlockCopy";
import { applyHighlighting, configureHighlighting } from "./highlight";
import { normalizeBaseDir, resolvePath } from "./pathUtils";
import { getInitialFile, openMarkdownFile, openWikiFolder, watchPaths } from "./tauriApi";
import { applyTheme, isThemeId, loadThemePreference } from "./theme";
import { applySavedTreeWidth, initTreeResizer, renderTree, renderTreeSelection, setupTreeSearch, getLastSelectedPath } from "./treePanel";
import type { Mode } from "./types";
import { renderAppShell } from "./ui";
import { showError } from "./notifications";
import { showLoading, hideLoading } from "./loading";
import { navigationHistory } from "./navigationHistory";
import { registerShortcut } from "./keyboardNavigation";
import "./styles.css";
import "./notifications.css";
import "./loading.css";

interface AppState {
  mode: Mode;
  currentPath: string | null;
  currentBaseDir: string | null;
  wikiRoot: string | null;
}

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("Missing #app root element");

const { contentEl, treePanel, treeResizeHandle, titleEl, btnBack, btnForward, btnOpen, themeSelect, treeSearch, treeHideToggle, breadcrumb, openModal, openModalFolder, openModalFile, openModalCancel } = renderAppShell(appRoot);

// Adicionar loading imediatamente para esconder mensagem "abra um arquivo" desde o início
contentEl.classList.add("loading");

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
  injectCodeBlockCopyButtons(contentEl);
}

function getDisplayName(path: string): string {
  return path.split(/[/\\]/).pop() ?? "";
}

function updateNavigationButtons(): void {
  btnBack.disabled = !navigationHistory.canGoBack();
  btnForward.disabled = !navigationHistory.canGoForward();
}

async function navigateBack(): Promise<void> {
  const entry = navigationHistory.goBack();
  if (!entry) return;
  
  updateNavigationButtons();
  if (entry.mode === "file") {
    await loadFile(entry.path, { addToHistory: false });
  } else {
    await openWikiNote(entry.path, { addToHistory: false });
  }
}

async function navigateForward(): Promise<void> {
  const entry = navigationHistory.goForward();
  if (!entry) return;
  
  updateNavigationButtons();
  if (entry.mode === "file") {
    await loadFile(entry.path, { addToHistory: false });
  } else {
    await openWikiNote(entry.path, { addToHistory: false });
  }
}

function updateBreadcrumb(path: string, wikiRoot: string | null): void {
  breadcrumb.innerHTML = "";
  breadcrumb.setAttribute("title", path); // Tooltip with full path
  
  if (wikiRoot) {
    const relativePath = path.replace(wikiRoot, "").replace(/^[/\\]/, "");
    const parts = relativePath.split(/[/\\]/).filter((p) => p);
    const rootName = wikiRoot.split(/[/\\]/).filter((p) => p).pop() || "Pasta";
    
    // Root link
    const rootLink = document.createElement("a");
    rootLink.href = "#";
    rootLink.className = "breadcrumb-link";
    rootLink.textContent = rootName;
    rootLink.setAttribute("title", wikiRoot);
    rootLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (state.wikiRoot) {
        void loadWiki(state.wikiRoot);
      }
    });
    breadcrumb.appendChild(rootLink);
    
    // Parts
    parts.forEach((part, index) => {
      const separator = document.createElement("span");
      separator.className = "breadcrumb-separator";
      separator.textContent = " / ";
      separator.setAttribute("aria-hidden", "true");
      breadcrumb.appendChild(separator);
      
      if (index === parts.length - 1) {
        // Current (last) part
        const span = document.createElement("span");
        span.className = "breadcrumb-current";
        span.textContent = part;
        const fullPathToPart = wikiRoot + "/" + parts.slice(0, index + 1).join("/");
        span.setAttribute("title", fullPathToPart);
        breadcrumb.appendChild(span);
      } else {
        // Clickable intermediate parts
        const link = document.createElement("a");
        link.href = "#";
        link.className = "breadcrumb-link";
        link.textContent = part;
        const pathToPart = wikiRoot + "/" + parts.slice(0, index + 1).join("/");
        link.setAttribute("title", pathToPart);
        link.addEventListener("click", (e) => {
          e.preventDefault();
          void openWikiNote(pathToPart);
        });
        breadcrumb.appendChild(link);
      }
    });
  } else {
    // File mode - show file name with full path as tooltip
    const span = document.createElement("span");
    span.className = "breadcrumb-current";
    span.textContent = getDisplayName(path);
    span.setAttribute("title", path);
    breadcrumb.appendChild(span);
  }
}

async function loadFile(path: string, options: { watch?: boolean; addToHistory?: boolean } = {}): Promise<void> {
  const loadingId = `load-file-${Date.now()}`;
  showLoading(loadingId, "Carregando arquivo...");
  try {
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
    
    if (options.addToHistory !== false) {
      navigationHistory.addEntry(path, "file");
      updateNavigationButtons();
    }
    
    hideLoading(loadingId);
  } catch (error) {
    hideLoading(loadingId);
    const message = error instanceof Error ? error.message : "Erro ao carregar arquivo";
    showError(`Não foi possível carregar o arquivo: ${message}`);
    throw error;
  }
}

async function openWikiNote(path: string, options: { addToHistory?: boolean } = {}): Promise<void> {
  if (!state.wikiRoot) return;

  const loadingId = `open-wiki-${Date.now()}`;
  showLoading(loadingId, "Abrindo nota...");
  try {
    const result = await openMarkdownFile(path, {
      vaultRoot: state.wikiRoot,
    });

    state.currentPath = path;
    state.currentBaseDir = state.wikiRoot;

    await renderMarkdownContent(result.html, state.wikiRoot);
    renderTreeSelection(treePanel, path);
    updateBreadcrumb(path, state.wikiRoot);
    
    if (options.addToHistory !== false) {
      navigationHistory.addEntry(path, "wiki");
      updateNavigationButtons();
    }
    
    hideLoading(loadingId);
  } catch (error) {
    hideLoading(loadingId);
    const message = error instanceof Error ? error.message : "Erro ao abrir nota";
    showError(`Não foi possível abrir a nota: ${message}`);
    throw error;
  }
}

async function loadWiki(path: string): Promise<void> {
  const loadingId = `load-wiki-${Date.now()}`;
  showLoading(loadingId, "Carregando pasta...");
  try {
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
    hideLoading(loadingId);
  } catch (error) {
    hideLoading(loadingId);
    const message = error instanceof Error ? error.message : "Erro ao carregar pasta";
    showError(`Não foi possível carregar a pasta: ${message}`);
    throw error;
  }
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

function setupNavigation(): void {
  btnBack.addEventListener("click", () => {
    void navigateBack().catch((error) => {
      const message = error instanceof Error ? error.message : "Erro ao navegar";
      showError(`Não foi possível voltar: ${message}`);
    });
  });

  btnForward.addEventListener("click", () => {
    void navigateForward().catch((error) => {
      const message = error instanceof Error ? error.message : "Erro ao navegar";
      showError(`Não foi possível avançar: ${message}`);
    });
  });
}

function setupKeyboardShortcuts(): void {
  // Ctrl/Cmd+O - Abrir arquivo/pasta
  registerShortcut("o", () => {
    btnOpen.click();
  }, { ctrl: true, meta: true, description: "Abrir arquivo/pasta" });

  // Ctrl/Cmd+F - Focar busca na árvore (wiki mode)
  registerShortcut("f", () => {
    if (!treePanel.classList.contains("hidden") && treeSearch) {
      treeSearch.focus();
    }
  }, { ctrl: true, meta: true, description: "Buscar na árvore" });

  // Alt+Left - Voltar
  registerShortcut("ArrowLeft", () => {
    if (navigationHistory.canGoBack()) {
      void navigateBack().catch((error) => {
        const message = error instanceof Error ? error.message : "Erro ao voltar";
        showError(`Não foi possível voltar: ${message}`);
      });
    }
  }, { alt: true, description: "Voltar" });

  // Alt+Right - Avançar
  registerShortcut("ArrowRight", () => {
    if (navigationHistory.canGoForward()) {
      void navigateForward().catch((error) => {
        const message = error instanceof Error ? error.message : "Erro ao avançar";
        showError(`Não foi possível avançar: ${message}`);
      });
    }
  }, { alt: true, description: "Avançar" });

}

function setupOpen(): void {
  const overlay = openModal.querySelector(".modal-overlay");
  const modalBox = openModal.querySelector(".modal-box");

  function closeOpenModal(): void {
    openModal.classList.add("hidden");
    openModal.setAttribute("aria-hidden", "true");
    btnOpen.focus();
  }

  function showOpenModal(): void {
    openModal.classList.remove("hidden");
    openModal.setAttribute("aria-hidden", "false");
    openModalFolder.focus();
  }

  btnOpen.addEventListener("click", () => {
    showOpenModal();
  });

  if (overlay) {
    overlay.addEventListener("click", () => closeOpenModal());
  }
  if (modalBox) {
    modalBox.addEventListener("click", (e) => e.stopPropagation());
  }

  openModalFolder.addEventListener("click", async () => {
    closeOpenModal();
    try {
      const path = await open({ directory: true });
      if (path && typeof path === "string") {
        await loadWiki(path);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao abrir pasta";
      showError(message);
    }
  });

  openModalFile.addEventListener("click", async () => {
    closeOpenModal();
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (path && typeof path === "string") {
        await loadFile(path);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao abrir ficheiro";
      showError(message);
    }
  });

  openModalCancel.addEventListener("click", () => closeOpenModal());

  openModal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeOpenModal();
      e.preventDefault();
    }
  });
}

function setupLinkHandler(): void {
  contentEl.addEventListener("click", (event) => {
    const anchor = (event.target as HTMLElement).closest("a[href]");
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#")) return;

    event.preventDefault();

    if (href.startsWith("app://open")) {
      try {
        const url = new URL(href);
        const path = url.searchParams.get("path");
        const decoded = path ? decodeURIComponent(path) : "";
        if (decoded && state.mode === "wiki") {
          void openWikiNote(decoded).catch(() => {
            // Error already shown by openWikiNote
          });
        } else if (decoded && state.mode === "file") {
          void loadFile(decoded).catch(() => {
            // Error already shown by loadFile
          });
        }
      } catch {
        // Broken or invalid app://open link; do nothing
      }
      return;
    }

    if (isExternalHref(href)) {
      void openUrl(href);
      return;
    }

    void openRelativeLink(href).catch((error) => {
      const message = error instanceof Error ? error.message : "Erro ao abrir link";
      showError(`Não foi possível abrir o link: ${message}`);
    });
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
      void loadFile(state.currentPath, { watch: false }).catch(() => {
        // Error already shown by loadFile
      });
    } else {
      void openWikiNote(state.currentPath).catch(() => {
        // Error already shown by openWikiNote
      });
    }
  });
}

function bootstrap(): void {
  // Priorizar carregamento do arquivo inicial se houver
  void getInitialFile().then((initialPath) => {
    if (initialPath) {
      // Loading já foi adicionado imediatamente após renderShell
      const loadPromise = initialPath.is_dir
        ? loadWiki(initialPath.path)
        : loadFile(initialPath.path);
      void loadPromise.finally(() => {
        // Remover classe loading após carregamento (sucesso ou erro)
        contentEl.classList.remove("loading");
      });
    } else {
      // Não há arquivo inicial - remover loading para mostrar mensagem "abra um arquivo"
      contentEl.classList.remove("loading");
    }
  }).catch((error) => {
    const message = error instanceof Error ? error.message : "Erro ao carregar arquivo inicial";
    showError(`Não foi possível carregar o arquivo inicial: ${message}`);
    contentEl.classList.remove("loading");
  });

  // Configurar resto da aplicação em paralelo
  setupTheme();
  initTreeResizer(treePanel, treeResizeHandle);
  setupTreeSearch(treeSearch, treeHideToggle, treePanel);
  setupNavigation();
  setupKeyboardShortcuts();
  setupOpen();
  setupLinkHandler();
  setupWatchListener();
  updateNavigationButtons();
}

bootstrap();
