import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  registerShortcut,
  enableKeyboardNavigation,
  disableKeyboardNavigation,
  isKeyboardNavigationEnabled,
  getRegisteredShortcuts,
} from "./keyboardNavigation";

describe("keyboardNavigation", () => {
  let handler: ReturnType<typeof vi.fn>;
  let unregister: (() => void) | null = null;

  beforeEach(() => {
    handler = vi.fn();
    enableKeyboardNavigation();
  });

  afterEach(() => {
    if (unregister) {
      unregister();
      unregister = null;
    }
    enableKeyboardNavigation();
  });

  it("registers shortcut and calls handler on key press", () => {
    unregister = registerShortcut("o", handler, { ctrl: true });
    
    const event = new KeyboardEvent("keydown", { key: "o", ctrlKey: true });
    document.dispatchEvent(event);
    
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ key: "o", ctrlKey: true }));
  });

  it("does not call handler when key does not match", () => {
    unregister = registerShortcut("o", handler, { ctrl: true });
    
    const event = new KeyboardEvent("keydown", { key: "p", ctrlKey: true });
    document.dispatchEvent(event);
    
    expect(handler).not.toHaveBeenCalled();
  });

  it("requires ctrl key when specified", () => {
    unregister = registerShortcut("o", handler, { ctrl: true });
    
    const event = new KeyboardEvent("keydown", { key: "o", ctrlKey: false });
    document.dispatchEvent(event);
    
    expect(handler).not.toHaveBeenCalled();
  });

  it("supports meta key for Mac", () => {
    unregister = registerShortcut("o", handler, { meta: true });
    
    const event = new KeyboardEvent("keydown", { key: "o", metaKey: true });
    document.dispatchEvent(event);
    
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("supports alt key", () => {
    unregister = registerShortcut("ArrowLeft", handler, { alt: true });
    
    const event = new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true });
    document.dispatchEvent(event);
    
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("supports shift key", () => {
    unregister = registerShortcut("F", handler, { ctrl: true, shift: true });
    
    const event = new KeyboardEvent("keydown", { key: "F", ctrlKey: true, shiftKey: true });
    document.dispatchEvent(event);
    
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("prevents default and stops propagation", () => {
    unregister = registerShortcut("o", handler, { ctrl: true });
    
    const event = new KeyboardEvent("keydown", { key: "o", ctrlKey: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    const stopPropagationSpy = vi.spyOn(event, "stopPropagation");
    
    document.dispatchEvent(event);
    
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it("does not handle shortcuts when disabled", () => {
    disableKeyboardNavigation();
    unregister = registerShortcut("o", handler, { ctrl: true });
    
    const event = new KeyboardEvent("keydown", { key: "o", ctrlKey: true });
    document.dispatchEvent(event);
    
    expect(handler).not.toHaveBeenCalled();
  });

  it("unregisters shortcut", () => {
    unregister = registerShortcut("o", handler, { ctrl: true });
    unregister();
    
    const event = new KeyboardEvent("keydown", { key: "o", ctrlKey: true });
    document.dispatchEvent(event);
    
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not handle shortcuts when typing in input", () => {
    unregister = registerShortcut("o", handler, { ctrl: true });
    
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    
    const event = new KeyboardEvent("keydown", { key: "o", ctrlKey: true });
    input.dispatchEvent(event);
    
    expect(handler).not.toHaveBeenCalled();
    
    document.body.removeChild(input);
  });

  it("handles Escape even in inputs", () => {
    const escapeHandler = vi.fn();
    unregister = registerShortcut("Escape", escapeHandler);
    
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    
    const event = new KeyboardEvent("keydown", { key: "Escape" });
    input.dispatchEvent(event);
    
    expect(escapeHandler).toHaveBeenCalledTimes(1);
    
    document.body.removeChild(input);
  });

  it("returns list of registered shortcuts", () => {
    const unreg1 = registerShortcut("o", handler, { ctrl: true, description: "Open" });
    const unreg2 = registerShortcut("f", handler, { ctrl: true, description: "Find" });
    
    const shortcuts = getRegisteredShortcuts();
    expect(shortcuts.length).toBeGreaterThanOrEqual(2);
    
    unreg1();
    unreg2();
  });

  it("can enable and disable navigation", () => {
    expect(isKeyboardNavigationEnabled()).toBe(true);
    
    disableKeyboardNavigation();
    expect(isKeyboardNavigationEnabled()).toBe(false);
    
    enableKeyboardNavigation();
    expect(isKeyboardNavigationEnabled()).toBe(true);
  });
});
