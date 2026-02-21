/**
 * Application entry point: composes shell, state, and feature setup.
 * Content and breadcrumb: features/content/contentRendering.
 * Navigation and loading: features/navigation/documentLoader.
 * Open modal: features/open/openModal. Link handling: features/content/linkHandler.
 */
import { listen } from "@tauri-apps/api/event";
import { configureHighlighting } from "./features/content/highlight";
import { getInitialFile } from "./core/api";
import { applyTheme, isThemeId, loadThemePreference } from "./features/theme/theme";
import { initTreeResizer, setupTreeSearch } from "./features/tree/treePanel";
import { renderAppShell } from "./ui/shell";
import { showError } from "./ui/notifications";
import { navigationHistory } from "./features/navigation/navigationHistory";
import { registerShortcut } from "./features/keyboard/keyboardNavigation";
import {
  renderMarkdownContent,
  updateBreadcrumb,
  showContent,
  getDisplayName,
} from "./features/content/contentRendering";
import {
  createDocumentLoader,
  type AppState,
  type NavigationContext,
} from "./features/navigation/documentLoader";
import { setupOpenModal } from "./features/open/openModal";
import { setupLinkHandler } from "./features/content/linkHandler";
import "./styles.css";
import "./notifications.css";
import "./loading.css";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("Missing #app root element");

const {
  contentEl,
  treePanel,
  treeResizeHandle,
  titleEl,
  btnBack,
  btnForward,
  btnOpen,
  themeSelect,
  treeSearch,
  treeHideToggle,
  breadcrumb,
  openModal,
  openModalFolder,
  openModalFile,
  openModalCancel,
} = renderAppShell(appRoot);

contentEl.classList.add("loading");

const state: AppState = {
  mode: "file",
  currentPath: null,
  currentBaseDir: null,
  wikiRoot: null,
};

const navContext: NavigationContext = {
  state,
  contentEl,
  treePanel,
  titleEl,
  breadcrumb,
  btnBack,
  btnForward,
  renderMarkdownContent,
  updateBreadcrumb,
  showContent,
  getDisplayName,
};

const loader = createDocumentLoader(navContext);

function normalizeWatchedPath(path: string): string {
  return path.replace(/\\/g, "/");
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
    void loader.navigateBack().catch((err) =>
      showError(`Não foi possível voltar: ${err instanceof Error ? err.message : "Erro ao navegar"}`)
    );
  });
  btnForward.addEventListener("click", () => {
    void loader.navigateForward().catch((err) =>
      showError(`Não foi possível avançar: ${err instanceof Error ? err.message : "Erro ao navegar"}`)
    );
  });
}

function setupKeyboardShortcuts(): void {
  registerShortcut("o", () => btnOpen.click(), { ctrl: true, meta: true });
  registerShortcut("f", () => {
    if (!treePanel.classList.contains("hidden") && treeSearch) treeSearch.focus();
  }, { ctrl: true, meta: true });
  registerShortcut("ArrowLeft", () => {
    if (navigationHistory.canGoBack()) void loader.navigateBack().catch((e) => showError(String(e)));
  }, { alt: true });
  registerShortcut("ArrowRight", () => {
    if (navigationHistory.canGoForward()) void loader.navigateForward().catch((e) => showError(String(e)));
  }, { alt: true });
}

function setupWatchListener(): void {
  void listen<string[]>("watch-change", (event) => {
    if (!state.currentPath || event.payload.length === 0) return;
    const currentPath = normalizeWatchedPath(state.currentPath);
    const changed = event.payload.some((path) => {
      const n = normalizeWatchedPath(path);
      return currentPath === n || currentPath.startsWith(`${n}/`);
    });
    if (!changed) return;
    if (state.mode === "file") void loader.loadFile(state.currentPath, { watch: false }).catch(() => {});
    else void loader.openWikiNote(state.currentPath).catch(() => {});
  });
}

setupTheme();
initTreeResizer(treePanel, treeResizeHandle);
setupTreeSearch(treeSearch, treeHideToggle, treePanel);
setupNavigation();
setupKeyboardShortcuts();
setupOpenModal(
  { openModal, openModalFolder, openModalFile, openModalCancel, btnOpen },
  { loadWiki: (path) => loader.loadWiki(path), loadFile: (path) => loader.loadFile(path) }
);
setupLinkHandler(
  contentEl,
  () => ({ mode: state.mode, wikiRoot: state.wikiRoot, currentBaseDir: state.currentBaseDir }),
  {
    openWikiNote: (path, opts) => loader.openWikiNote(path, opts),
    loadFile: (path, opts) => loader.loadFile(path, opts),
    openRelativeLink: (href) => loader.openRelativeLink(href),
  },
  showError
);
setupWatchListener();
loader.updateNavigationButtons();

void getInitialFile()
  .then((initialPath) => {
    if (initialPath) {
      const loadPromise = initialPath.is_dir ? loader.loadWiki(initialPath.path) : loader.loadFile(initialPath.path);
      void loadPromise.finally(() => contentEl.classList.remove("loading"));
    } else {
      contentEl.classList.remove("loading");
    }
  })
  .catch((error) => {
    showError(`Não foi possível carregar o arquivo inicial: ${error instanceof Error ? error.message : String(error)}`);
    contentEl.classList.remove("loading");
  });
