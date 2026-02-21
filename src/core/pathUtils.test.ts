import { describe, it, expect } from "vitest";
import { normalizeBaseDir, resolvePath } from "./pathUtils";

describe("normalizeBaseDir", () => {
  it("removes trailing slash", () => {
    expect(normalizeBaseDir("/a/b/")).toBe("/a/b");
  });

  it("replaces backslashes with forward slashes", () => {
    expect(normalizeBaseDir("C:\\foo\\bar")).toBe("C:/foo/bar");
  });

  it("returns / for empty string", () => {
    expect(normalizeBaseDir("")).toBe("/");
  });

  it("returns / when result would be empty after stripping trailing slash", () => {
    expect(normalizeBaseDir("/")).toBe("/");
  });

  it("leaves path without trailing slash unchanged except normalizing backslash", () => {
    expect(normalizeBaseDir("/a/b")).toBe("/a/b");
  });

  it("handles paths with multiple consecutive slashes", () => {
    expect(normalizeBaseDir("/a//b///c")).toBe("/a//b///c");
  });

  it("handles Windows paths with drive letter", () => {
    expect(normalizeBaseDir("C:\\Users\\test")).toBe("C:/Users/test");
    expect(normalizeBaseDir("D:\\")).toBe("D:");
  });

  it("handles relative paths", () => {
    expect(normalizeBaseDir("a/b/")).toBe("a/b");
    expect(normalizeBaseDir("./a/b/")).toBe("./a/b");
    expect(normalizeBaseDir("../a/b/")).toBe("../a/b");
  });
});

describe("resolvePath", () => {
  it("joins base and relative path", () => {
    expect(resolvePath("/a/b", "c")).toBe("/a/b/c");
  });

  it("resolves .. to parent", () => {
    expect(resolvePath("/a/b", "..")).toBe("/a");
    expect(resolvePath("/a/b", "../c")).toBe("/a/c");
  });

  it("ignores . segments", () => {
    expect(resolvePath("/a/b", ".")).toBe("/a/b");
    expect(resolvePath("/a/b", "./c")).toBe("/a/b/c");
  });

  it("treats relative starting with / as absolute", () => {
    expect(resolvePath("/a/b", "/c")).toBe("/c");
  });

  it("handles multiple ..", () => {
    expect(resolvePath("/a/b/c", "../..")).toBe("/a");
    expect(resolvePath("/a/b/c", "../../d")).toBe("/a/d");
  });

  it("normalizes backslashes in base and relative", () => {
    expect(resolvePath("C:/foo", "bar\\baz")).toBe("/C:/foo/bar/baz");
  });

  it("handles relative path with mixed . and ..", () => {
    expect(resolvePath("/a/b/c", "./../d")).toBe("/a/b/d");
  });

  it("handles multiple .. that go beyond root", () => {
    expect(resolvePath("/a/b", "../..")).toBe("/");
    expect(resolvePath("/a", "../..")).toBe("/");
    expect(resolvePath("/a/b/c", "../../..")).toBe("/");
    expect(resolvePath("/a/b/c", "../../../../d")).toBe("/d");
  });

  it("handles paths with double slashes", () => {
    expect(resolvePath("/a//b", "c")).toBe("/a/b/c");
    expect(resolvePath("/a/b", "//c")).toBe("//c");
    expect(resolvePath("/a/b", "c//d")).toBe("/a/b/c//d");
  });

  it("handles empty relative path", () => {
    expect(resolvePath("/a/b", "")).toBe("/a/b/");
    expect(resolvePath("/a/b/c", "")).toBe("/a/b/c/");
  });

  it("handles empty base dir", () => {
    expect(resolvePath("", "a")).toBe("/a");
    expect(resolvePath("", "a/b")).toBe("/a/b");
    expect(resolvePath("", "../a")).toBe("/a");
  });

  it("handles both base and relative empty", () => {
    expect(resolvePath("", "")).toBe("/");
  });
});
