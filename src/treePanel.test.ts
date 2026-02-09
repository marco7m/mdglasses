import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TreeNode } from "./types";
import {
  getFileIcon,
  filterTree,
  filterHiddenNodes,
  shouldHideNode,
  applySavedTreeWidth,
  getLastSelectedPath,
  renderTreeSelection,
} from "./treePanel";

describe("treePanel", () => {
  let mockLocalStorage: Record<string, string>;

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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getFileIcon", () => {
    it("returns folder icon for directories", () => {
      expect(getFileIcon("folder", true)).toBe("📁");
      expect(getFileIcon("any-name", true)).toBe("📁");
    });

    it("returns special icon for README.md", () => {
      expect(getFileIcon("README.md", false)).toBe("⭐");
      expect(getFileIcon("readme.md", false)).toBe("⭐");
      expect(getFileIcon("ReadMe.Md", false)).toBe("⭐");
    });

    it("returns markdown icon for .md files", () => {
      expect(getFileIcon("file.md", false)).toBe("📝");
      expect(getFileIcon("document.markdown", false)).toBe("📝");
    });

    it("returns image icon for image files", () => {
      expect(getFileIcon("photo.png", false)).toBe("🖼️");
      expect(getFileIcon("image.jpg", false)).toBe("🖼️");
      expect(getFileIcon("picture.jpeg", false)).toBe("🖼️");
      expect(getFileIcon("icon.gif", false)).toBe("🖼️");
      expect(getFileIcon("logo.svg", false)).toBe("🖼️");
      expect(getFileIcon("photo.webp", false)).toBe("🖼️");
    });

    it("returns json icon for .json files", () => {
      expect(getFileIcon("config.json", false)).toBe("📋");
    });

    it("returns text icon for .txt files", () => {
      expect(getFileIcon("notes.txt", false)).toBe("📄");
    });

    it("returns script icon for JavaScript/TypeScript files", () => {
      expect(getFileIcon("script.js", false)).toBe("📜");
      expect(getFileIcon("app.ts", false)).toBe("📜");
      expect(getFileIcon("component.jsx", false)).toBe("📜");
      expect(getFileIcon("component.tsx", false)).toBe("📜");
    });

    it("returns css icon for stylesheet files", () => {
      expect(getFileIcon("style.css", false)).toBe("🎨");
      expect(getFileIcon("theme.scss", false)).toBe("🎨");
      expect(getFileIcon("styles.sass", false)).toBe("🎨");
    });

    it("returns html icon for HTML files", () => {
      expect(getFileIcon("page.html", false)).toBe("🌐");
      expect(getFileIcon("index.htm", false)).toBe("🌐");
    });

    it("returns python icon for .py files", () => {
      expect(getFileIcon("script.py", false)).toBe("🐍");
    });

    it("returns rust icon for .rs files", () => {
      expect(getFileIcon("lib.rs", false)).toBe("🦀");
    });

    it("returns config icon for YAML files", () => {
      expect(getFileIcon("config.yml", false)).toBe("⚙️");
      expect(getFileIcon("settings.yaml", false)).toBe("⚙️");
    });

    it("returns default icon for unknown extensions", () => {
      expect(getFileIcon("file.unknown", false)).toBe("📄");
      expect(getFileIcon("file", false)).toBe("📄");
      expect(getFileIcon("file.", false)).toBe("📄");
    });
  });

  describe("shouldHideNode", () => {
    it("returns false when showHidden is true (show all)", () => {
      expect(shouldHideNode(".git", true)).toBe(false);
      expect(shouldHideNode("node_modules", true)).toBe(false);
      expect(shouldHideNode("any-file", true)).toBe(false);
    });

    it("returns true for exact matches of hide patterns when showHidden is false", () => {
      expect(shouldHideNode(".git", false)).toBe(true);
      expect(shouldHideNode("node_modules", false)).toBe(true);
      expect(shouldHideNode("target", false)).toBe(true);
      expect(shouldHideNode(".next", false)).toBe(true);
      expect(shouldHideNode(".vscode", false)).toBe(true);
      expect(shouldHideNode(".idea", false)).toBe(true);
      expect(shouldHideNode("dist", false)).toBe(true);
      expect(shouldHideNode("build", false)).toBe(true);
      expect(shouldHideNode(".DS_Store", false)).toBe(true);
    });

    it("returns true for paths starting with hide pattern when showHidden is false", () => {
      expect(shouldHideNode(".git/config", false)).toBe(true);
      expect(shouldHideNode("node_modules/package", false)).toBe(true);
      expect(shouldHideNode("target/debug", false)).toBe(true);
    });

    it("returns false for files that do not match patterns", () => {
      expect(shouldHideNode("src", false)).toBe(false);
      expect(shouldHideNode("file.md", false)).toBe(false);
      expect(shouldHideNode("README.md", false)).toBe(false);
      expect(shouldHideNode("package.json", false)).toBe(false);
    });
  });

  describe("filterHiddenNodes", () => {
    const createTree = (): TreeNode[] => [
      {
        name: "src",
        path: "/src",
        children: [
          { name: "file.md", path: "/src/file.md", children: [] },
        ],
      },
      {
        name: ".git",
        path: "/.git",
        children: [
          { name: "config", path: "/.git/config", children: [] },
        ],
      },
      {
        name: "node_modules",
        path: "/node_modules",
        children: [],
      },
      {
        name: "README.md",
        path: "/README.md",
        children: [],
      },
    ];

    it("returns tree unchanged when showHidden is true (show all)", () => {
      const tree = createTree();
      const result = filterHiddenNodes(tree, true);
      expect(result).toEqual(tree);
    });

    it("filters out nodes matching hide patterns when showHidden is false", () => {
      const tree = createTree();
      const result = filterHiddenNodes(tree, false);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("src");
      expect(result[1].name).toBe("README.md");
    });

    it("filters nested nodes recursively", () => {
      const tree: TreeNode[] = [
        {
          name: "project",
          path: "/project",
          children: [
            {
              name: ".git",
              path: "/project/.git",
              children: [],
            },
            {
              name: "src",
              path: "/project/src",
              children: [
                {
                  name: "node_modules",
                  path: "/project/src/node_modules",
                  children: [],
                },
                {
                  name: "file.ts",
                  path: "/project/src/file.ts",
                  children: [],
                },
              ],
            },
          ],
        },
      ];

      const result = filterHiddenNodes(tree, false);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("project");
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].name).toBe("src");
      expect(result[0].children[0].children).toHaveLength(1);
      expect(result[0].children[0].children[0].name).toBe("file.ts");
    });
  });

  describe("filterTree", () => {
    const createTree = (): TreeNode[] => [
      {
        name: "src",
        path: "/src",
        children: [
          { name: "file1.md", path: "/src/file1.md", children: [] },
          { name: "file2.ts", path: "/src/file2.ts", children: [] },
        ],
      },
      {
        name: "docs",
        path: "/docs",
        children: [
          { name: "readme.md", path: "/docs/readme.md", children: [] },
        ],
      },
      {
        name: "README.md",
        path: "/README.md",
        children: [],
      },
    ];

    it("returns tree unchanged when query is empty", () => {
      const tree = createTree();
      const result = filterTree(tree, "");
      expect(result).toEqual(tree);
    });

    it("returns tree unchanged when query is only whitespace", () => {
      const tree = createTree();
      const result = filterTree(tree, "   ");
      expect(result).toEqual(tree);
    });

    it("filters nodes by name (case insensitive)", () => {
      const tree = createTree();
      const result = filterTree(tree, "readme");
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("docs");
      expect(result[1].name).toBe("README.md");
    });

    it("includes parent when child matches", () => {
      const tree = createTree();
      const result = filterTree(tree, "file1");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("src");
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].name).toBe("file1.md");
    });

    it("includes parent when any child matches", () => {
      const tree = createTree();
      const result = filterTree(tree, "file");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("src");
      expect(result[0].children).toHaveLength(2);
    });

    it("filters nested trees recursively", () => {
      const tree: TreeNode[] = [
        {
          name: "project",
          path: "/project",
          children: [
            {
              name: "src",
              path: "/project/src",
              children: [
                { name: "utils.ts", path: "/project/src/utils.ts", children: [] },
                { name: "main.ts", path: "/project/src/main.ts", children: [] },
              ],
            },
            {
              name: "tests",
              path: "/project/tests",
              children: [
                { name: "test.ts", path: "/project/tests/test.ts", children: [] },
              ],
            },
          ],
        },
      ];

      const result = filterTree(tree, "main");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("project");
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].name).toBe("src");
      expect(result[0].children[0].children).toHaveLength(1);
      expect(result[0].children[0].children[0].name).toBe("main.ts");
    });

    it("returns empty array when no matches", () => {
      const tree = createTree();
      const result = filterTree(tree, "nonexistent");
      expect(result).toHaveLength(0);
    });
  });

  describe("applySavedTreeWidth", () => {
    it("applies saved width when valid", () => {
      mockLocalStorage["mdglasses-tree-width"] = "300";
      const mockPanel = {
        style: { width: "" },
      } as HTMLElement;

      applySavedTreeWidth(mockPanel);

      expect(mockPanel.style.width).toBe("300px");
    });

    it("does not apply when no value is saved", () => {
      const mockPanel = {
        style: { width: "" },
      } as HTMLElement;

      applySavedTreeWidth(mockPanel);

      expect(mockPanel.style.width).toBe("");
    });

    it("does not apply when value is NaN", () => {
      mockLocalStorage["mdglasses-tree-width"] = "invalid";
      const mockPanel = {
        style: { width: "" },
      } as HTMLElement;

      applySavedTreeWidth(mockPanel);

      expect(mockPanel.style.width).toBe("");
    });

    it("does not apply when value is below minimum", () => {
      mockLocalStorage["mdglasses-tree-width"] = "100";
      const mockPanel = {
        style: { width: "" },
      } as HTMLElement;

      applySavedTreeWidth(mockPanel);

      expect(mockPanel.style.width).toBe("");
    });

    it("does not apply when value is above maximum", () => {
      mockLocalStorage["mdglasses-tree-width"] = "500";
      const mockPanel = {
        style: { width: "" },
      } as HTMLElement;

      applySavedTreeWidth(mockPanel);

      expect(mockPanel.style.width).toBe("");
    });

    it("applies value at minimum boundary", () => {
      mockLocalStorage["mdglasses-tree-width"] = "180";
      const mockPanel = {
        style: { width: "" },
      } as HTMLElement;

      applySavedTreeWidth(mockPanel);

      expect(mockPanel.style.width).toBe("180px");
    });

    it("applies value at maximum boundary", () => {
      mockLocalStorage["mdglasses-tree-width"] = "480";
      const mockPanel = {
        style: { width: "" },
      } as HTMLElement;

      applySavedTreeWidth(mockPanel);

      expect(mockPanel.style.width).toBe("480px");
    });

    it("parses decimal values as integers (parseInt behavior)", () => {
      mockLocalStorage["mdglasses-tree-width"] = "300.5";
      const mockPanel = {
        style: { width: "" },
      } as HTMLElement;

      applySavedTreeWidth(mockPanel);

      expect(mockPanel.style.width).toBe("300px");
    });

    it("ignores non-numeric strings", () => {
      mockLocalStorage["mdglasses-tree-width"] = "abc";
      const mockPanel = {
        style: { width: "" },
      } as HTMLElement;

      applySavedTreeWidth(mockPanel);

      expect(mockPanel.style.width).toBe("");
    });

    it("parses strings with leading numbers (parseInt behavior)", () => {
      mockLocalStorage["mdglasses-tree-width"] = "300px";
      const mockPanel = {
        style: { width: "" },
      } as HTMLElement;

      applySavedTreeWidth(mockPanel);

      expect(mockPanel.style.width).toBe("300px");
    });

    it("ignores negative values", () => {
      mockLocalStorage["mdglasses-tree-width"] = "-100";
      const mockPanel = {
        style: { width: "" },
      } as HTMLElement;

      applySavedTreeWidth(mockPanel);

      expect(mockPanel.style.width).toBe("");
    });
  });

  describe("getLastSelectedPath", () => {
    it("returns saved path from localStorage", () => {
      mockLocalStorage["mdglasses-tree-last-selected"] = "/path/to/file.md";
      expect(getLastSelectedPath()).toBe("/path/to/file.md");
    });

    it("returns null when no value is saved", () => {
      expect(getLastSelectedPath()).toBeNull();
    });

    it("returns null when localStorage throws error", () => {
      vi.stubGlobal("localStorage", {
        getItem: () => {
          throw new Error("Storage error");
        },
      });

      expect(getLastSelectedPath()).toBeNull();
    });
  });

  describe("renderTreeSelection", () => {
    beforeEach(() => {
      vi.stubGlobal("document", {
        createElement: (_tag: string) => {
          const el = {
            className: "",
            dataset: {} as DOMStringMap,
            classList: {
              contains: (cls: string) => el.className.split(" ").includes(cls),
              add: (cls: string) => {
                if (!el.className.split(" ").includes(cls)) {
                  el.className = el.className ? `${el.className} ${cls}` : cls;
                }
              },
              remove: (cls: string) => {
                el.className = el.className
                  .split(" ")
                  .filter((c) => c !== cls)
                  .join(" ");
              },
              toggle: (cls: string, force?: boolean) => {
                const has = el.classList.contains(cls);
                if (force === undefined) {
                  if (has) el.classList.remove(cls);
                  else el.classList.add(cls);
                } else if (force && !has) {
                  el.classList.add(cls);
                } else if (!force && has) {
                  el.classList.remove(cls);
                }
              },
            },
            appendChild: vi.fn(),
            querySelectorAll: vi.fn(() => []),
          };
          return el;
        },
      });
    });

    it("adds active class to item with matching path", () => {
      const mockPanel = document.createElement("div") as HTMLElement;
      const item1 = document.createElement("div") as HTMLElement;
      item1.className = "tree-item";
      item1.dataset.path = "/path/to/file1.md";
      const item2 = document.createElement("div") as HTMLElement;
      item2.className = "tree-item";
      item2.dataset.path = "/path/to/file2.md";
      mockPanel.appendChild(item1);
      mockPanel.appendChild(item2);
      mockPanel.querySelectorAll = vi.fn(() => [item1, item2]) as unknown as typeof mockPanel.querySelectorAll;

      renderTreeSelection(mockPanel, "/path/to/file1.md");

      expect(item1.classList.contains("active")).toBe(true);
      expect(item2.classList.contains("active")).toBe(false);
    });

    it("removes active class from other items", () => {
      const mockPanel = document.createElement("div") as HTMLElement;
      const item1 = document.createElement("div") as HTMLElement;
      item1.className = "tree-item active";
      item1.dataset.path = "/path/to/file1.md";
      const item2 = document.createElement("div") as HTMLElement;
      item2.className = "tree-item";
      item2.dataset.path = "/path/to/file2.md";
      mockPanel.appendChild(item1);
      mockPanel.appendChild(item2);
      mockPanel.querySelectorAll = vi.fn(() => [item1, item2]) as unknown as typeof mockPanel.querySelectorAll;

      renderTreeSelection(mockPanel, "/path/to/file2.md");

      expect(item1.classList.contains("active")).toBe(false);
      expect(item2.classList.contains("active")).toBe(true);
    });

    it("handles empty tree panel", () => {
      const mockPanel = document.createElement("div") as HTMLElement;
      mockPanel.querySelectorAll = vi.fn(() => []) as unknown as typeof mockPanel.querySelectorAll;
      expect(() => renderTreeSelection(mockPanel, "/path/to/file.md")).not.toThrow();
    });

    it("handles items without path dataset", () => {
      const mockPanel = document.createElement("div") as HTMLElement;
      const item = document.createElement("div") as HTMLElement;
      item.className = "tree-item";
      mockPanel.appendChild(item);
      mockPanel.querySelectorAll = vi.fn(() => [item]) as unknown as typeof mockPanel.querySelectorAll;

      expect(() => renderTreeSelection(mockPanel, "/path/to/file.md")).not.toThrow();
      expect(item.classList.contains("active")).toBe(false);
    });

    it("handles multiple items with same path (edge case)", () => {
      const mockPanel = document.createElement("div") as HTMLElement;
      const item1 = document.createElement("div") as HTMLElement;
      item1.className = "tree-item";
      item1.dataset.path = "/path/to/file.md";
      const item2 = document.createElement("div") as HTMLElement;
      item2.className = "tree-item";
      item2.dataset.path = "/path/to/file.md";
      const item3 = document.createElement("div") as HTMLElement;
      item3.className = "tree-item";
      item3.dataset.path = "/path/to/other.md";
      mockPanel.appendChild(item1);
      mockPanel.appendChild(item2);
      mockPanel.appendChild(item3);
      mockPanel.querySelectorAll = vi.fn(() => [item1, item2, item3]) as unknown as typeof mockPanel.querySelectorAll;

      renderTreeSelection(mockPanel, "/path/to/file.md");

      expect(item1.classList.contains("active")).toBe(true);
      expect(item2.classList.contains("active")).toBe(true);
      expect(item3.classList.contains("active")).toBe(false);
    });

    it("handles paths with special characters", () => {
      const mockPanel = document.createElement("div") as HTMLElement;
      const item1 = document.createElement("div") as HTMLElement;
      item1.className = "tree-item";
      item1.dataset.path = "/path/with spaces/file.md";
      const item2 = document.createElement("div") as HTMLElement;
      item2.className = "tree-item";
      item2.dataset.path = "/path/with-special-chars@file.md";
      const item3 = document.createElement("div") as HTMLElement;
      item3.className = "tree-item";
      item3.dataset.path = "/path/with#hash/file.md";
      mockPanel.appendChild(item1);
      mockPanel.appendChild(item2);
      mockPanel.appendChild(item3);
      mockPanel.querySelectorAll = vi.fn(() => [item1, item2, item3]) as unknown as typeof mockPanel.querySelectorAll;

      renderTreeSelection(mockPanel, "/path/with spaces/file.md");

      expect(item1.classList.contains("active")).toBe(true);
      expect(item2.classList.contains("active")).toBe(false);
      expect(item3.classList.contains("active")).toBe(false);
    });

    it("handles paths with unicode characters", () => {
      const mockPanel = document.createElement("div") as HTMLElement;
      const item = document.createElement("div") as HTMLElement;
      item.className = "tree-item";
      item.dataset.path = "/path/with-émojis-🚀/file.md";
      mockPanel.appendChild(item);
      mockPanel.querySelectorAll = vi.fn(() => [item]) as unknown as typeof mockPanel.querySelectorAll;

      renderTreeSelection(mockPanel, "/path/with-émojis-🚀/file.md");

      expect(item.classList.contains("active")).toBe(true);
    });

    it("handles empty path string", () => {
      const mockPanel = document.createElement("div") as HTMLElement;
      const item = document.createElement("div") as HTMLElement;
      item.className = "tree-item";
      item.dataset.path = "";
      mockPanel.appendChild(item);
      mockPanel.querySelectorAll = vi.fn(() => [item]) as unknown as typeof mockPanel.querySelectorAll;

      renderTreeSelection(mockPanel, "");

      expect(item.classList.contains("active")).toBe(true);
    });

    it("handles null path parameter", () => {
      const mockPanel = document.createElement("div") as HTMLElement;
      const item = document.createElement("div") as HTMLElement;
      item.className = "tree-item";
      item.dataset.path = "/path/to/file.md";
      mockPanel.appendChild(item);
      mockPanel.querySelectorAll = vi.fn(() => [item]) as unknown as typeof mockPanel.querySelectorAll;

      renderTreeSelection(mockPanel, null as unknown as string);

      expect(item.classList.contains("active")).toBe(false);
    });
  });
});
