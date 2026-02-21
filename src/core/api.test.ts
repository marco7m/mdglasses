import { describe, it, expect, vi, beforeEach } from "vitest";
import { getInitialFile, openMarkdownFile, openWikiFolder, watchPaths } from "./api";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

describe("tauriApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getInitialFile", () => {
    it("calls invoke with correct command name", async () => {
      const mockInvoke = vi.mocked(invoke);
      mockInvoke.mockResolvedValue("/path/to/file.md");

      await getInitialFile();

      expect(mockInvoke).toHaveBeenCalledWith("get_initial_file");
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it("returns the result from invoke", async () => {
      const mockInvoke = vi.mocked(invoke);
      const expectedPath = "/path/to/file.md";
      mockInvoke.mockResolvedValue(expectedPath);

      const result = await getInitialFile();

      expect(result).toBe(expectedPath);
    });

    it("handles null result", async () => {
      const mockInvoke = vi.mocked(invoke);
      mockInvoke.mockResolvedValue(null);

      const result = await getInitialFile();

      expect(result).toBeNull();
    });
  });

  describe("openMarkdownFile", () => {
    it("calls invoke with correct command name and path parameter", async () => {
      const mockInvoke = vi.mocked(invoke);
      const testPath = "/path/to/file.md";
      const mockResult = {
        raw_md: "# Test",
        html: "<h1>Test</h1>",
        base_dir: "/path/to",
      };
      mockInvoke.mockResolvedValue(mockResult);

      await openMarkdownFile(testPath);

      expect(mockInvoke).toHaveBeenCalledWith("open_markdown_file", { path: testPath });
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it("returns the result from invoke", async () => {
      const mockInvoke = vi.mocked(invoke);
      const testPath = "/path/to/file.md";
      const mockResult = {
        raw_md: "# Test",
        html: "<h1>Test</h1>",
        base_dir: "/path/to",
      };
      mockInvoke.mockResolvedValue(mockResult);

      const result = await openMarkdownFile(testPath);

      expect(result).toEqual(mockResult);
    });

    it("passes vaultRoot when provided", async () => {
      const mockInvoke = vi.mocked(invoke);
      const testPath = "/vault/notes/note.md";
      const vaultRoot = "/vault";
      mockInvoke.mockResolvedValue({
        raw_md: "# Note",
        html: "<h1>Note</h1>",
        base_dir: "/vault",
      });

      await openMarkdownFile(testPath, { vaultRoot });

      expect(mockInvoke).toHaveBeenCalledWith("open_markdown_file", {
        path: testPath,
        vaultRoot,
      });
    });
  });

  describe("openWikiFolder", () => {
    it("calls invoke with correct command name and path parameter", async () => {
      const mockInvoke = vi.mocked(invoke);
      const testPath = "/path/to/wiki";
      const mockResult = {
        tree: [],
        initial_note_path: null,
        initial_html: null,
      };
      mockInvoke.mockResolvedValue(mockResult);

      await openWikiFolder(testPath);

      expect(mockInvoke).toHaveBeenCalledWith("open_wiki_folder", { path: testPath });
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it("returns the result from invoke", async () => {
      const mockInvoke = vi.mocked(invoke);
      const testPath = "/path/to/wiki";
      const mockResult = {
        tree: [
          {
            name: "file.md",
            path: "/path/to/wiki/file.md",
            children: [],
          },
        ],
        initial_note_path: "/path/to/wiki/file.md",
        initial_html: "<h1>File</h1>",
      };
      mockInvoke.mockResolvedValue(mockResult);

      const result = await openWikiFolder(testPath);

      expect(result).toEqual(mockResult);
    });
  });

  describe("watchPaths", () => {
    it("calls invoke with correct command name and paths parameter", async () => {
      const mockInvoke = vi.mocked(invoke);
      const testPaths = ["/path/to/file1.md", "/path/to/file2.md"];
      mockInvoke.mockResolvedValue(undefined);

      await watchPaths(testPaths);

      expect(mockInvoke).toHaveBeenCalledWith("watch_paths", { paths: testPaths });
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it("handles empty paths array", async () => {
      const mockInvoke = vi.mocked(invoke);
      mockInvoke.mockResolvedValue(undefined);

      await watchPaths([]);

      expect(mockInvoke).toHaveBeenCalledWith("watch_paths", { paths: [] });
    });

    it("returns void promise", async () => {
      const mockInvoke = vi.mocked(invoke);
      mockInvoke.mockResolvedValue(undefined);

      const result = await watchPaths(["/path/to/file.md"]);

      expect(result).toBeUndefined();
    });
  });
});
