type KeyboardHandler = (event: KeyboardEvent) => void;

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
  handler: KeyboardHandler;
  description?: string;
}

const shortcuts: KeyboardShortcut[] = [];
let isEnabled = true;

function matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  if (event.key !== shortcut.key) return false;
  if (shortcut.ctrl !== undefined && event.ctrlKey !== shortcut.ctrl) return false;
  if (shortcut.meta !== undefined && event.metaKey !== shortcut.meta) return false;
  if (shortcut.alt !== undefined && event.altKey !== shortcut.alt) return false;
  if (shortcut.shift !== undefined && event.shiftKey !== shortcut.shift) return false;
  return true;
}

function isInputElement(element: Element | null): boolean {
  if (!element) return false;
  const tagName = element.tagName?.toLowerCase();
  if (!tagName) return false;
  const inputTypes = ["input", "textarea", "select"];
  if (inputTypes.includes(tagName)) {
    const input = element as HTMLInputElement;
    if (tagName === "input" && input.type === "button") return false;
    if (tagName === "input" && input.type === "submit") return false;
    if (tagName === "input" && input.type === "reset") return false;
    return true;
  }
  return element.hasAttribute("contenteditable");
}

function handleKeyboardEvent(event: KeyboardEvent): void {
  if (!isEnabled) return;

  // Don't handle shortcuts when typing in inputs (except for global shortcuts)
  const target = event.target as Element;
  if (isInputElement(target)) {
    // Allow some shortcuts even in inputs (like Esc)
    if (event.key !== "Escape") {
      return;
    }
  }

  for (const shortcut of shortcuts) {
    if (matchesShortcut(event, shortcut)) {
      event.preventDefault();
      event.stopPropagation();
      shortcut.handler(event);
      return;
    }
  }
}

export function registerShortcut(
  key: string,
  handler: KeyboardHandler,
  options: {
    ctrl?: boolean;
    meta?: boolean;
    alt?: boolean;
    shift?: boolean;
    description?: string;
  } = {}
): () => void {
  const shortcut: KeyboardShortcut = {
    key,
    handler,
    ...options,
  };

  shortcuts.push(shortcut);

  // Return unregister function
  return () => {
    const index = shortcuts.indexOf(shortcut);
    if (index > -1) {
      shortcuts.splice(index, 1);
    }
  };
}

export function enableKeyboardNavigation(): void {
  isEnabled = true;
}

export function disableKeyboardNavigation(): void {
  isEnabled = false;
}

export function isKeyboardNavigationEnabled(): boolean {
  return isEnabled;
}

export function getRegisteredShortcuts(): readonly KeyboardShortcut[] {
  return [...shortcuts];
}

// Initialize keyboard listener
if (typeof document !== "undefined") {
  document.addEventListener("keydown", handleKeyboardEvent, true);
}
