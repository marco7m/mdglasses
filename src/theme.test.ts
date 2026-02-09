import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isThemeId, loadThemePreference, applyTheme } from "./theme";

describe("theme", () => {
  let mockLocalStorage: Record<string, string>;
  let mockBody: HTMLElement;

  beforeEach(() => {
    mockLocalStorage = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockLocalStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockLocalStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockLocalStorage[key];
      },
      clear: () => {
        mockLocalStorage = {};
      },
    });

    mockBody = {
      dataset: {},
    } as HTMLElement;
    vi.stubGlobal("document", {
      body: mockBody,
      head: {
        appendChild: vi.fn(),
      },
      getElementById: vi.fn(() => null),
      createElement: vi.fn((tag: string) => {
        const el = {
          id: "",
          rel: "",
          href: "",
          remove: vi.fn(),
        };
        if (tag === "link") {
          return el;
        }
        return {};
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("isThemeId", () => {
    it("returns true for valid theme IDs", () => {
      expect(isThemeId("light")).toBe(true);
      expect(isThemeId("sepia")).toBe(true);
      expect(isThemeId("dark")).toBe(true);
      expect(isThemeId("modern")).toBe(true);
      expect(isThemeId("nordic")).toBe(true);
    });

    it("returns false for invalid theme IDs", () => {
      expect(isThemeId("")).toBe(false);
      expect(isThemeId("invalid")).toBe(false);
      expect(isThemeId("LIGHT")).toBe(false);
      expect(isThemeId("light ")).toBe(false);
      expect(isThemeId("solarized")).toBe(false);
      expect(isThemeId("theme")).toBe(false);
    });

    it("returns false for non-string values", () => {
      expect(isThemeId(null as unknown as string)).toBe(false);
      expect(isThemeId(undefined as unknown as string)).toBe(false);
      expect(isThemeId(123 as unknown as string)).toBe(false);
    });
  });

  describe("loadThemePreference", () => {
    it("returns saved theme from localStorage when valid", () => {
      mockLocalStorage["mdglasses-theme"] = "dark";
      expect(loadThemePreference()).toBe("dark");

      mockLocalStorage["mdglasses-theme"] = "modern";
      expect(loadThemePreference()).toBe("modern");
    });

    it("returns default theme when no value is saved", () => {
      expect(loadThemePreference()).toBe("light");
    });

    it("returns default theme when saved value is invalid", () => {
      mockLocalStorage["mdglasses-theme"] = "invalid";
      expect(loadThemePreference()).toBe("light");

      mockLocalStorage["mdglasses-theme"] = "";
      expect(loadThemePreference()).toBe("light");
    });

    it("returns default theme when localStorage throws error", () => {
      vi.stubGlobal("localStorage", {
        getItem: () => {
          throw new Error("Storage error");
        },
      });

      expect(loadThemePreference()).toBe("light");
    });
  });

  describe("applyTheme", () => {
    let mockLinkElement: HTMLLinkElement;
    let mockMarkdownLinkElement: HTMLLinkElement;

    beforeEach(() => {
      mockLinkElement = {
        id: "hljs-theme",
        href: "",
        rel: "stylesheet",
      } as HTMLLinkElement;

      mockMarkdownLinkElement = {
        id: "markdown-theme-dark",
        href: "",
        rel: "stylesheet",
        remove: vi.fn(),
      } as unknown as HTMLLinkElement;

      vi.mocked(document.getElementById).mockImplementation((id: string) => {
        if (id === "hljs-theme") return mockLinkElement;
        if (id === "markdown-theme-dark") return mockMarkdownLinkElement;
        return null;
      });
    });

    it("updates document.body.dataset.theme", () => {
      applyTheme("dark");
      expect(mockBody.dataset.theme).toBe("dark");

      applyTheme("sepia");
      expect(mockBody.dataset.theme).toBe("sepia");
    });

    it("updates themeSelect value when provided", () => {
      const mockSelect = {
        value: "",
      } as HTMLSelectElement;

      applyTheme("modern", mockSelect);
      expect(mockSelect.value).toBe("modern");

      applyTheme("nordic", mockSelect);
      expect(mockSelect.value).toBe("nordic");
    });

    it("does not throw when themeSelect is null", () => {
      expect(() => applyTheme("dark", null)).not.toThrow();
    });

    it("creates and updates highlight.js stylesheet link", () => {
      applyTheme("dark");
      expect(document.getElementById).toHaveBeenCalledWith("hljs-theme");
    });

    it("adds markdown dark stylesheet for dark themes", () => {
      vi.mocked(document.getElementById).mockReturnValue(null);
      applyTheme("dark");
      expect(document.getElementById).toHaveBeenCalledWith("markdown-theme-dark");
      expect(document.head.appendChild).toHaveBeenCalled();
    });

    it("removes markdown dark stylesheet for light themes", () => {
      vi.mocked(document.getElementById).mockReturnValue(mockMarkdownLinkElement);
      applyTheme("light");
      expect(mockMarkdownLinkElement.remove).toHaveBeenCalled();
    });

    it("removes markdown dark stylesheet for sepia theme", () => {
      vi.mocked(document.getElementById).mockReturnValue(mockMarkdownLinkElement);
      applyTheme("sepia");
      expect(mockMarkdownLinkElement.remove).toHaveBeenCalled();
    });

    it("saves theme preference to localStorage", () => {
      applyTheme("dark");
      expect(mockLocalStorage["mdglasses-theme"]).toBe("dark");

      applyTheme("modern");
      expect(mockLocalStorage["mdglasses-theme"]).toBe("modern");
    });

    it("handles localStorage errors gracefully", () => {
      vi.stubGlobal("localStorage", {
        getItem: vi.fn(),
        setItem: () => {
          throw new Error("Storage error");
        },
        removeItem: vi.fn(),
        clear: vi.fn(),
      });

      expect(() => applyTheme("dark")).not.toThrow();
    });

    it("applies all themes correctly", () => {
      const themes = ["light", "sepia", "dark", "modern", "nordic"] as const;
      themes.forEach((theme) => {
        applyTheme(theme);
        expect(mockBody.dataset.theme).toBe(theme);
        expect(mockLocalStorage["mdglasses-theme"]).toBe(theme);
      });
    });

    it("handles undefined themeSelect gracefully", () => {
      expect(() => applyTheme("dark", undefined)).not.toThrow();
      expect(mockBody.dataset.theme).toBe("dark");
    });

    it("handles multiple consecutive calls correctly", () => {
      const mockSelect = {
        value: "",
      } as HTMLSelectElement;

      applyTheme("light", mockSelect);
      expect(mockBody.dataset.theme).toBe("light");
      expect(mockSelect.value).toBe("light");

      applyTheme("dark", mockSelect);
      expect(mockBody.dataset.theme).toBe("dark");
      expect(mockSelect.value).toBe("dark");

      applyTheme("modern", mockSelect);
      expect(mockBody.dataset.theme).toBe("modern");
      expect(mockSelect.value).toBe("modern");
    });

    it("updates stylesheet links correctly on theme changes", () => {
      vi.mocked(document.getElementById).mockReturnValue(null);
      const appendChildSpy = vi.mocked(document.head.appendChild);

      applyTheme("light");
      expect(appendChildSpy).toHaveBeenCalled();
      appendChildSpy.mockClear();

      applyTheme("dark");
      expect(document.getElementById).toHaveBeenCalledWith("hljs-theme");
      expect(document.getElementById).toHaveBeenCalledWith("markdown-theme-dark");
      expect(appendChildSpy).toHaveBeenCalled();
    });

    it("reuses existing stylesheet links when they exist", () => {
      const existingLink = {
        id: "hljs-theme",
        href: "",
        rel: "stylesheet",
      } as HTMLLinkElement;

      const appendChildSpy = vi.mocked(document.head.appendChild);
      appendChildSpy.mockClear();

      vi.mocked(document.getElementById).mockImplementation((id: string) => {
        if (id === "hljs-theme") return existingLink;
        if (id === "markdown-theme-dark") return null;
        return null;
      });

      applyTheme("dark");
      expect(existingLink.href).toBeDefined();
      expect(appendChildSpy).toHaveBeenCalled();
    });

    it("correctly toggles markdown dark stylesheet when switching between light and dark themes", () => {
      vi.mocked(document.getElementById).mockReturnValue(null);
      const removeSpy = vi.fn();
      let markdownLink: HTMLLinkElement | null = null;

      vi.mocked(document.head.appendChild).mockImplementation((node: Node) => {
        markdownLink = node as HTMLLinkElement;
        (markdownLink as any).remove = removeSpy;
        return node;
      });

      applyTheme("dark");
      expect(markdownLink).not.toBeNull();
      expect(removeSpy).not.toHaveBeenCalled();

      vi.mocked(document.getElementById).mockImplementation((id: string) => {
        if (id === "markdown-theme-dark") return markdownLink;
        return null;
      });

      applyTheme("light");
      expect(removeSpy).toHaveBeenCalled();
    });
  });
});
