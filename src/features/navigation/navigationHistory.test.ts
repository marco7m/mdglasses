import { describe, it, expect, beforeEach } from "vitest";
import { navigationHistory } from "./navigationHistory";

describe("navigationHistory", () => {
  beforeEach(() => {
    navigationHistory.clear();
  });

  it("starts empty", () => {
    expect(navigationHistory.canGoBack()).toBe(false);
    expect(navigationHistory.canGoForward()).toBe(false);
    expect(navigationHistory.getCurrent()).toBeNull();
  });

  it("adds entry to history", () => {
    navigationHistory.addEntry("/path/to/file.md", "file");
    expect(navigationHistory.getCurrent()?.path).toBe("/path/to/file.md");
    expect(navigationHistory.getCurrent()?.mode).toBe("file");
  });

  it("does not add duplicate consecutive entry", () => {
    navigationHistory.addEntry("/path/to/file.md", "file");
    navigationHistory.addEntry("/path/to/file.md", "file");
    
    expect(navigationHistory.getHistory().length).toBe(1);
  });

  it("can go back after adding multiple entries", () => {
    navigationHistory.addEntry("/file1.md", "file");
    navigationHistory.addEntry("/file2.md", "file");
    navigationHistory.addEntry("/file3.md", "file");
    
    expect(navigationHistory.canGoBack()).toBe(true);
    expect(navigationHistory.getCurrent()?.path).toBe("/file3.md");
    
    const back = navigationHistory.goBack();
    expect(back?.path).toBe("/file2.md");
    expect(navigationHistory.getCurrent()?.path).toBe("/file2.md");
  });

  it("can go forward after going back", () => {
    navigationHistory.addEntry("/file1.md", "file");
    navigationHistory.addEntry("/file2.md", "file");
    navigationHistory.addEntry("/file3.md", "file");
    
    navigationHistory.goBack();
    expect(navigationHistory.canGoForward()).toBe(true);
    
    const forward = navigationHistory.goForward();
    expect(forward?.path).toBe("/file3.md");
    expect(navigationHistory.getCurrent()?.path).toBe("/file3.md");
  });

  it("cannot go back from first entry", () => {
    navigationHistory.addEntry("/file1.md", "file");
    expect(navigationHistory.canGoBack()).toBe(false);
    expect(navigationHistory.goBack()).toBeNull();
  });

  it("cannot go forward from last entry", () => {
    navigationHistory.addEntry("/file1.md", "file");
    navigationHistory.addEntry("/file2.md", "file");
    expect(navigationHistory.canGoForward()).toBe(false);
    expect(navigationHistory.goForward()).toBeNull();
  });

  it("removes future entries when adding new entry after going back", () => {
    navigationHistory.addEntry("/file1.md", "file");
    navigationHistory.addEntry("/file2.md", "file");
    navigationHistory.addEntry("/file3.md", "file");
    
    navigationHistory.goBack();
    navigationHistory.goBack();
    expect(navigationHistory.getCurrent()?.path).toBe("/file1.md");
    
    navigationHistory.addEntry("/file4.md", "file");
    expect(navigationHistory.getHistory().length).toBe(2);
    expect(navigationHistory.getCurrent()?.path).toBe("/file4.md");
    expect(navigationHistory.canGoForward()).toBe(false);
  });

  it("limits history size to MAX_HISTORY_SIZE", () => {
    for (let i = 0; i < 60; i++) {
      navigationHistory.addEntry(`/file${i}.md`, "file");
    }
    
    expect(navigationHistory.getHistory().length).toBeLessThanOrEqual(50);
  });

  it("maintains correct index after limiting size", () => {
    for (let i = 0; i < 60; i++) {
      navigationHistory.addEntry(`/file${i}.md`, "file");
    }
    
    expect(navigationHistory.getCurrentIndex()).toBe(navigationHistory.getHistory().length - 1);
  });

  it("clears history", () => {
    navigationHistory.addEntry("/file1.md", "file");
    navigationHistory.addEntry("/file2.md", "file");
    
    navigationHistory.clear();
    expect(navigationHistory.getHistory().length).toBe(0);
    expect(navigationHistory.canGoBack()).toBe(false);
    expect(navigationHistory.canGoForward()).toBe(false);
  });

  it("handles different modes correctly", () => {
    navigationHistory.addEntry("/file1.md", "file");
    navigationHistory.addEntry("/wiki/note.md", "wiki");
    
    expect(navigationHistory.getHistory()[0]?.mode).toBe("file");
    expect(navigationHistory.getHistory()[1]?.mode).toBe("wiki");
  });

  it("includes timestamp in entries", () => {
    const before = Date.now();
    navigationHistory.addEntry("/file1.md", "file");
    const after = Date.now();
    
    const entry = navigationHistory.getCurrent();
    expect(entry?.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry?.timestamp).toBeLessThanOrEqual(after);
  });

  it("allows adding same path with different mode", () => {
    navigationHistory.addEntry("/file.md", "file");
    navigationHistory.addEntry("/file.md", "wiki");
    
    expect(navigationHistory.getHistory().length).toBe(2);
  });
});
