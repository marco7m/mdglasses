import { openUrl } from "@tauri-apps/plugin-opener";
import { isExternalHref } from "./contentRendering";

export interface LinkHandlerState {
  mode: "file" | "wiki";
  wikiRoot: string | null;
  currentBaseDir: string | null;
}

export interface LinkHandlerActions {
  openWikiNote: (path: string, options?: { addToHistory?: boolean }) => Promise<void>;
  loadFile: (path: string, options?: { watch?: boolean; addToHistory?: boolean }) => Promise<void>;
  openRelativeLink: (href: string) => Promise<void>;
}

export function setupLinkHandler(
  contentEl: HTMLElement,
  getState: () => LinkHandlerState,
  actions: LinkHandlerActions,
  onError: (message: string) => void
): void {
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
        const state = getState();
        if (decoded && state.mode === "wiki") {
          void actions.openWikiNote(decoded).catch(() => {});
        } else if (decoded && state.mode === "file") {
          void actions.loadFile(decoded).catch(() => {});
        }
      } catch {
        // Broken or invalid app://open link
      }
      return;
    }

    if (isExternalHref(href)) {
      void openUrl(href);
      return;
    }

    void actions.openRelativeLink(href).catch((error) => {
      const message = error instanceof Error ? error.message : "Erro ao abrir link";
      onError(`Não foi possível abrir o link: ${message}`);
    });
  });
}
