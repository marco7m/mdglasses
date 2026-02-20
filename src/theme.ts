import hljsLightUrl from "highlight.js/styles/github.css?url";
import hljsDarkUrl from "highlight.js/styles/github-dark.css?url";
import markdownDarkUrl from "github-markdown-css/github-markdown-dark.css?url";
import type { ThemeId } from "./types";

const THEME_STORAGE_KEY = "mdglasses-theme";
const DEFAULT_THEME: ThemeId = "light";
const DARK_MARKDOWN_THEMES = new Set<ThemeId>(["dark"]);
const VALID_THEMES: readonly ThemeId[] = ["light", "sepia", "dark"];

const HIGHLIGHT_THEME_BY_ID: Record<ThemeId, string> = {
  light: hljsLightUrl,
  sepia: hljsLightUrl,
  dark: hljsDarkUrl,
};

function ensureStylesheetLink(id: string): HTMLLinkElement {
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  return link;
}

function removeStylesheetLink(id: string): void {
  const link = document.getElementById(id);
  if (link) link.remove();
}

function saveThemePreference(theme: ThemeId): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures.
  }
}

export function isThemeId(value: string): value is ThemeId {
  return (VALID_THEMES as readonly string[]).includes(value);
}

export function loadThemePreference(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && isThemeId(stored)) return stored;
  } catch {
    // Ignore storage failures.
  }
  return DEFAULT_THEME;
}

export function applyTheme(theme: ThemeId, themeSelect?: HTMLSelectElement | null): void {
  document.body.dataset.theme = theme;

  if (themeSelect) {
    themeSelect.value = theme;
  }

  ensureStylesheetLink("hljs-theme").href = HIGHLIGHT_THEME_BY_ID[theme];

  if (DARK_MARKDOWN_THEMES.has(theme)) {
    ensureStylesheetLink("markdown-theme-dark").href = markdownDarkUrl;
  } else {
    removeStylesheetLink("markdown-theme-dark");
  }

  saveThemePreference(theme);
}
