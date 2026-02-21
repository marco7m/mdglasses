import type { TreeNode } from "../../types";

const TREE_MIN_WIDTH = 180;
const TREE_MAX_WIDTH = 480;
const TREE_WIDTH_KEY = "mdglasses-tree-width";
const TREE_EXPANDED_PATHS_KEY = "mdglasses-tree-expanded";
const TREE_LAST_SELECTED_KEY = "mdglasses-tree-last-selected";

type NoteSelectHandler = (path: string) => void | Promise<void>;

let expandedPaths: Set<string> = new Set();
let currentTreePanel: HTMLElement | null = null;

function saveExpandedPaths(paths: Set<string>): void {
  try {
    localStorage.setItem(TREE_EXPANDED_PATHS_KEY, JSON.stringify(Array.from(paths)));
  } catch {
    // Ignore storage failures.
  }
}

function loadExpandedPaths(): Set<string> {
  try {
    const saved = localStorage.getItem(TREE_EXPANDED_PATHS_KEY);
    if (saved) {
      const paths = JSON.parse(saved) as string[];
      return new Set(paths);
    }
  } catch {
    // Ignore parse errors.
  }
  return new Set();
}

function saveLastSelected(path: string): void {
  try {
    localStorage.setItem(TREE_LAST_SELECTED_KEY, path);
  } catch {
    // Ignore storage failures.
  }
}

function loadLastSelected(): string | null {
  try {
    return localStorage.getItem(TREE_LAST_SELECTED_KEY);
  } catch {
    return null;
  }
}

function isDirectory(node: TreeNode): boolean {
  return node.children.length > 0;
}

function toggleExpanded(path: string): void {
  if (expandedPaths.has(path)) {
    expandedPaths.delete(path);
  } else {
    expandedPaths.add(path);
  }
  saveExpandedPaths(expandedPaths);
}

function isExpanded(path: string): boolean {
  return expandedPaths.has(path);
}

/**
 * @internal
 * Exported for testing purposes only.
 */
export function getFileIcon(name: string, isDir: boolean): string {
  if (isDir) {
    return "📁";
  }
  const lowerName = name.toLowerCase();
  if (lowerName === "readme.md") {
    return "⭐";
  }
  const ext = name.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "md":
    case "markdown":
      return "📝";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
      return "🖼️";
    case "json":
      return "📋";
    case "txt":
      return "📄";
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
      return "📜";
    case "css":
    case "scss":
    case "sass":
      return "🎨";
    case "html":
    case "htm":
      return "🌐";
    case "py":
      return "🐍";
    case "rs":
      return "🦀";
    case "yml":
    case "yaml":
      return "⚙️";
    default:
      return "📄";
  }
}

function createTreeItem(node: TreeNode, activePath: string | null, onNoteSelected: NoteSelectHandler, depth: number = 0): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "tree-item-wrapper";

  const item = document.createElement("div");
  const directory = isDirectory(node);
  const expanded = directory && isExpanded(node.path);
  item.className = "tree-item " + (directory ? "directory" : "") + (node.path === activePath ? " active" : "");
  item.dataset.path = node.path;
  const basePadding = depth * 16;
  item.style.paddingLeft = node.path === activePath ? `${basePadding - 3}px` : `${basePadding}px`;
  if (directory) {
    item.setAttribute("aria-expanded", String(expanded));
  }
  item.setAttribute("tabindex", "0");
  item.setAttribute("role", directory ? "treeitem" : "none");

  const chevron = document.createElement("span");
  chevron.className = "tree-item-chevron";
  chevron.setAttribute("aria-hidden", "true");
  if (directory) {
    chevron.textContent = expanded ? "▼" : "▶";
    chevron.style.cursor = "pointer";
  } else {
    chevron.style.width = "18px";
  }

  const icon = document.createElement("span");
  icon.className = "tree-item-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = getFileIcon(node.name, directory);

  const label = document.createElement("span");
  label.className = "tree-item-label";
  label.textContent = node.name;
  label.title = node.path;

  item.appendChild(chevron);
  item.appendChild(icon);
  item.appendChild(label);

  wrapper.appendChild(item);

  if (node.children.length > 0) {
    const childrenContainer = document.createElement("div");
    childrenContainer.className = "tree-children";
    childrenContainer.style.display = expanded ? "" : "none";
    node.children.forEach((child) => {
      childrenContainer.appendChild(createTreeItem(child, activePath, onNoteSelected, depth + 1));
    });
    wrapper.appendChild(childrenContainer);

    chevron.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleExpanded(node.path);
      const wasExpanded = expandedPaths.has(node.path);
      item.setAttribute("aria-expanded", String(wasExpanded));
      chevron.textContent = wasExpanded ? "▼" : "▶";
      childrenContainer.style.display = wasExpanded ? "" : "none";
    });

    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        toggleExpanded(node.path);
        const wasExpanded = expandedPaths.has(node.path);
        item.setAttribute("aria-expanded", String(wasExpanded));
        chevron.textContent = wasExpanded ? "▼" : "▶";
        childrenContainer.style.display = wasExpanded ? "" : "none";
      }
    });
  } else {
    item.addEventListener("click", () => {
      void Promise.resolve(onNoteSelected(node.path)).catch(console.error);
    });

    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        void Promise.resolve(onNoteSelected(node.path)).catch(console.error);
      }
    });
  }

  return wrapper;
}

export function applySavedTreeWidth(treePanel: HTMLElement): void {
  const saved = localStorage.getItem(TREE_WIDTH_KEY);
  if (!saved) return;

  const width = Number.parseInt(saved, 10);
  if (Number.isNaN(width)) return;
  if (width < TREE_MIN_WIDTH || width > TREE_MAX_WIDTH) return;

  treePanel.style.width = `${width}px`;
}

export function initTreeResizer(treePanel: HTMLElement, resizeHandle: HTMLElement): void {
  resizeHandle.addEventListener("mousedown", (event) => {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = treePanel.offsetWidth;

    function onMouseMove(moveEvent: MouseEvent): void {
      const deltaX = moveEvent.clientX - startX;
      const width = Math.min(TREE_MAX_WIDTH, Math.max(TREE_MIN_WIDTH, startWidth + deltaX));
      treePanel.style.width = `${width}px`;
    }

    function onMouseUp(): void {
      const width = treePanel.offsetWidth;
      try {
        localStorage.setItem(TREE_WIDTH_KEY, String(width));
      } catch {
        // Ignore storage failures.
      }

      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.removeProperty("user-select");
      document.body.style.removeProperty("cursor");
    }

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}

let currentTree: TreeNode[] = [];
let currentActivePath: string | null = null;
let currentOnNoteSelected: NoteSelectHandler = () => {};
const HIDE_PATTERNS = [".git", "node_modules", "target", ".next", ".vscode", ".idea", "dist", "build", ".DS_Store"];

/**
 * @internal
 * Exported for testing purposes only.
 */
export function shouldHideNode(name: string, showHidden: boolean): boolean {
  if (showHidden) return false;
  return HIDE_PATTERNS.some((pattern) => name === pattern || name.startsWith(pattern + "/"));
}

/**
 * @internal
 * Exported for testing purposes only.
 */
export function filterHiddenNodes(tree: TreeNode[], showHidden: boolean): TreeNode[] {
  if (showHidden) return tree;
  return tree
    .filter((node) => !shouldHideNode(node.name, showHidden))
    .map((node) => ({
      ...node,
      children: filterHiddenNodes(node.children, showHidden),
    }));
}

/**
 * @internal
 * Exported for testing purposes only.
 */
export function filterTree(tree: TreeNode[], query: string): TreeNode[] {
  if (!query.trim()) {
    return tree;
  }
  const lowerQuery = query.toLowerCase();
  const result: TreeNode[] = [];
  for (const node of tree) {
    const matchesName = node.name.toLowerCase().includes(lowerQuery);
    const filteredChildren = filterTree(node.children, query);
    if (matchesName || filteredChildren.length > 0) {
      result.push({
        ...node,
        children: filteredChildren,
      });
    }
  }
  return result;
}

function renderFilteredTree(query: string, showHidden: boolean): void {
  if (!currentTreePanel) return;
  let filtered = filterTree(currentTree, query);
  filtered = filterHiddenNodes(filtered, showHidden);
  const hideToggle = currentTreePanel.querySelector<HTMLElement>(".tree-hide-toggle");
  const treeContainer = document.createElement("div");
  treeContainer.className = "tree-container";
  filtered.forEach((node) => {
    treeContainer.appendChild(createTreeItem(node, currentActivePath, currentOnNoteSelected));
  });
  const existingContainer = currentTreePanel.querySelector(".tree-container");
  if (existingContainer) {
    existingContainer.replaceWith(treeContainer);
  } else {
    if (hideToggle) {
      hideToggle.insertAdjacentElement("afterend", treeContainer);
    } else {
      currentTreePanel.appendChild(treeContainer);
    }
  }
}

export function renderTree(
  treePanel: HTMLElement,
  tree: TreeNode[],
  activePath: string | null,
  onNoteSelected: NoteSelectHandler,
): void {
  currentTreePanel = treePanel;
  currentTree = tree;
  currentActivePath = activePath;
  currentOnNoteSelected = onNoteSelected;
  expandedPaths = loadExpandedPaths();
  if (activePath) {
    saveLastSelected(activePath);
  }
  const searchInput = treePanel.querySelector<HTMLInputElement>("#tree-search");
  const hideToggle = treePanel.querySelector<HTMLInputElement>("#tree-hide-patterns");
  const query = searchInput?.value || "";
  const showHidden = hideToggle?.checked ?? false;
  renderFilteredTree(query, showHidden);
}

export function getLastSelectedPath(): string | null {
  return loadLastSelected();
}

export function setupTreeSearch(searchInput: HTMLInputElement, hideToggle: HTMLInputElement, treePanel: HTMLElement): void {
  const updateTree = () => {
    const query = searchInput.value;
    const showHidden = hideToggle.checked;
    renderFilteredTree(query, showHidden);
  };

  searchInput.addEventListener("input", updateTree);
  hideToggle.addEventListener("change", updateTree);

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "p") {
      e.preventDefault();
      if (!treePanel.classList.contains("hidden")) {
        searchInput.focus();
        searchInput.select();
      }
    }
  });
}

export function renderTreeSelection(treePanel: HTMLElement, path: string): void {
  treePanel.querySelectorAll<HTMLElement>(".tree-item").forEach((element) => {
    element.classList.toggle("active", element.dataset.path === path);
  });
}
