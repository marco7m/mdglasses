import type { Mode } from "../../types";
import { openMarkdownFile, openWikiFolder, watchPaths } from "../../core/api";
import { normalizeBaseDir, resolvePath } from "../../core/pathUtils";
import { type BreadcrumbCallbacks } from "../content/contentRendering";
import { applySavedTreeWidth, renderTree, renderTreeSelection, getLastSelectedPath } from "../tree/treePanel";
import { navigationHistory } from "./navigationHistory";
import { showLoading, hideLoading } from "../../ui/loading";
import { showError } from "../../ui/notifications";

export interface AppState {
  mode: Mode;
  currentPath: string | null;
  currentBaseDir: string | null;
  wikiRoot: string | null;
}

export interface NavigationContext {
  state: AppState;
  contentEl: HTMLElement;
  treePanel: HTMLElement;
  titleEl: HTMLElement;
  breadcrumb: HTMLElement;
  btnBack: HTMLButtonElement;
  btnForward: HTMLButtonElement;
  renderMarkdownContent: (contentEl: HTMLElement, html: string, baseDir: string) => Promise<void>;
  updateBreadcrumb: (
    breadcrumb: HTMLElement,
    path: string,
    wikiRoot: string | null,
    callbacks: BreadcrumbCallbacks
  ) => void;
  showContent: (contentEl: HTMLElement, html: string) => void;
  getDisplayName: (path: string) => string;
}

function updateNavigationButtons(ctx: NavigationContext): void {
  ctx.btnBack.disabled = !navigationHistory.canGoBack();
  ctx.btnForward.disabled = !navigationHistory.canGoForward();
}

function breadcrumbCallbacks(
  loader: {
    loadWiki: (path: string) => Promise<void>;
    openWikiNote: (path: string, options?: { addToHistory?: boolean }) => Promise<void>;
  },
  _state: AppState
): BreadcrumbCallbacks {
  return {
    onLoadWiki: (wikiRoot: string) => void loader.loadWiki(wikiRoot),
    onOpenWikiNote: (path: string) => void loader.openWikiNote(path),
  };
}

export function createDocumentLoader(ctx: NavigationContext) {
  const loader = {
    async loadFile(
      path: string,
      options: { watch?: boolean; addToHistory?: boolean } = {}
    ): Promise<void> {
      const loadingId = `load-file-${Date.now()}`;
      showLoading(loadingId, "Carregando arquivo...");
      try {
        const result = await openMarkdownFile(path);
        ctx.state.mode = "file";
        ctx.state.currentPath = path;
        ctx.state.currentBaseDir = normalizeBaseDir(result.base_dir);
        ctx.state.wikiRoot = null;

        ctx.treePanel.classList.add("hidden");
        ctx.treePanel.innerHTML = "";
        ctx.titleEl.textContent = ctx.getDisplayName(path);
        ctx.updateBreadcrumb(ctx.breadcrumb, path, null, breadcrumbCallbacks(loader, ctx.state));

        await ctx.renderMarkdownContent(ctx.contentEl, result.html, ctx.state.currentBaseDir);

        if (options.watch !== false) await watchPaths([path]);
        if (options.addToHistory !== false) {
          navigationHistory.addEntry(path, "file");
          updateNavigationButtons(ctx);
        }
        hideLoading(loadingId);
      } catch (error) {
        hideLoading(loadingId);
        const message = error instanceof Error ? error.message : "Erro ao carregar arquivo";
        showError(`Não foi possível carregar o arquivo: ${message}`);
        throw error;
      }
    },

    async openWikiNote(
      path: string,
      options: { addToHistory?: boolean } = {}
    ): Promise<void> {
      if (!ctx.state.wikiRoot) return;
      const loadingId = `open-wiki-${Date.now()}`;
      showLoading(loadingId, "Abrindo nota...");
      try {
        const result = await openMarkdownFile(path, { vaultRoot: ctx.state.wikiRoot });
        ctx.state.currentPath = path;
        ctx.state.currentBaseDir = ctx.state.wikiRoot;

        await ctx.renderMarkdownContent(ctx.contentEl, result.html, ctx.state.wikiRoot);
        renderTreeSelection(ctx.treePanel, path);
        ctx.updateBreadcrumb(ctx.breadcrumb, path, ctx.state.wikiRoot, breadcrumbCallbacks(loader, ctx.state));

        if (options.addToHistory !== false) {
          navigationHistory.addEntry(path, "wiki");
          updateNavigationButtons(ctx);
        }
        hideLoading(loadingId);
      } catch (error) {
        hideLoading(loadingId);
        const message = error instanceof Error ? error.message : "Erro ao abrir nota";
        showError(`Não foi possível abrir a nota: ${message}`);
        throw error;
      }
    },

    async loadWiki(path: string): Promise<void> {
      const loadingId = `load-wiki-${Date.now()}`;
      showLoading(loadingId, "Carregando pasta...");
      try {
        const result = await openWikiFolder(path);
        ctx.state.mode = "wiki";
        ctx.state.wikiRoot = normalizeBaseDir(path);
        ctx.state.currentBaseDir = ctx.state.wikiRoot;

        ctx.treePanel.classList.remove("hidden");
        applySavedTreeWidth(ctx.treePanel);
        renderTree(ctx.treePanel, result.tree, result.initial_note_path, (p) => loader.openWikiNote(p));

        if (result.initial_html && result.initial_note_path && ctx.state.wikiRoot) {
          ctx.state.currentPath = result.initial_note_path;
          await ctx.renderMarkdownContent(ctx.contentEl, result.initial_html, ctx.state.wikiRoot);
          renderTreeSelection(ctx.treePanel, result.initial_note_path);
          ctx.updateBreadcrumb(
            ctx.breadcrumb,
            result.initial_note_path,
            ctx.state.wikiRoot,
            breadcrumbCallbacks(loader, ctx.state)
          );
        } else {
          const lastSelected = getLastSelectedPath();
          if (lastSelected && ctx.state.wikiRoot) {
            try {
              await loader.openWikiNote(lastSelected);
            } catch {
              ctx.state.currentPath = null;
              ctx.showContent(ctx.contentEl, "");
              ctx.breadcrumb.innerHTML = "";
            }
          } else {
            ctx.state.currentPath = null;
            ctx.showContent(ctx.contentEl, "");
            ctx.breadcrumb.innerHTML = "";
          }
        }

        const rootName = ctx.state.wikiRoot?.split(/[/\\]/).filter((p) => p).pop() || "Pasta";
        ctx.titleEl.textContent = rootName;
        await watchPaths([path]);
        hideLoading(loadingId);
      } catch (error) {
        hideLoading(loadingId);
        const message = error instanceof Error ? error.message : "Erro ao carregar pasta";
        showError(`Não foi possível carregar a pasta: ${message}`);
        throw error;
      }
    },

    async navigateBack(): Promise<void> {
      const entry = navigationHistory.goBack();
      if (!entry) return;
      updateNavigationButtons(ctx);
      if (entry.mode === "file") {
        await loader.loadFile(entry.path, { addToHistory: false });
      } else {
        await loader.openWikiNote(entry.path, { addToHistory: false });
      }
    },

    async navigateForward(): Promise<void> {
      const entry = navigationHistory.goForward();
      if (!entry) return;
      updateNavigationButtons(ctx);
      if (entry.mode === "file") {
        await loader.loadFile(entry.path, { addToHistory: false });
      } else {
        await loader.openWikiNote(entry.path, { addToHistory: false });
      }
    },

    updateNavigationButtons(): void {
      updateNavigationButtons(ctx);
    },

    async openRelativeLink(href: string): Promise<void> {
      const baseDir = ctx.state.mode === "wiki" ? ctx.state.wikiRoot : ctx.state.currentBaseDir;
      if (!baseDir) return;
      const resolvedPath = resolvePath(baseDir, decodeURIComponent(href));
      if (ctx.state.mode === "wiki") {
        await loader.openWikiNote(resolvedPath);
      } else {
        await loader.loadFile(resolvedPath);
      }
    },
  };
  return loader;
}
