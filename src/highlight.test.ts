import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("highlight.js/lib/core", () => {
  const mockRegisterLanguage = vi.fn();
  const mockHighlightElement = vi.fn();
  return {
    default: {
      registerLanguage: mockRegisterLanguage,
      highlightElement: mockHighlightElement,
    },
  };
});

vi.mock("highlight.js/lib/languages/javascript", () => ({ default: {} }));
vi.mock("highlight.js/lib/languages/typescript", () => ({ default: {} }));
vi.mock("highlight.js/lib/languages/json", () => ({ default: {} }));
vi.mock("highlight.js/lib/languages/bash", () => ({ default: {} }));
vi.mock("highlight.js/lib/languages/css", () => ({ default: {} }));
vi.mock("highlight.js/lib/languages/xml", () => ({ default: {} }));

import { configureHighlighting, applyHighlighting } from "./highlight";
import hljs from "highlight.js/lib/core";

describe("highlight", () => {
  const mockRegisterLanguage = vi.mocked(hljs.registerLanguage);
  const mockHighlightElement = vi.mocked(hljs.highlightElement);

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegisterLanguage.mockClear();
    mockHighlightElement.mockClear();
  });

  describe("configureHighlighting", () => {
    it("registers all languages on first call", () => {
      configureHighlighting();
      expect(mockRegisterLanguage).toHaveBeenCalledTimes(8);
      expect(mockRegisterLanguage).toHaveBeenCalledWith("javascript", expect.anything());
      expect(mockRegisterLanguage).toHaveBeenCalledWith("typescript", expect.anything());
      expect(mockRegisterLanguage).toHaveBeenCalledWith("json", expect.anything());
      expect(mockRegisterLanguage).toHaveBeenCalledWith("bash", expect.anything());
      expect(mockRegisterLanguage).toHaveBeenCalledWith("shell", expect.anything());
      expect(mockRegisterLanguage).toHaveBeenCalledWith("css", expect.anything());
      expect(mockRegisterLanguage).toHaveBeenCalledWith("html", expect.anything());
      expect(mockRegisterLanguage).toHaveBeenCalledWith("xml", expect.anything());
    });

    it("does not register languages again on subsequent calls", () => {
      configureHighlighting();
      mockRegisterLanguage.mockClear();
      configureHighlighting();
      expect(mockRegisterLanguage).not.toHaveBeenCalled();
    });

    it("can be called multiple times safely", () => {
      configureHighlighting();
      const firstCallCount = mockRegisterLanguage.mock.calls.length;
      configureHighlighting();
      configureHighlighting();
      expect(mockRegisterLanguage).toHaveBeenCalledTimes(firstCallCount);
    });
  });

  describe("applyHighlighting", () => {
    beforeEach(() => {
      configureHighlighting();
    });

    it("processes pre code elements", () => {
      const code1 = document.createElement("code");
      code1.textContent = "const x = 1;";
      const pre = document.createElement("pre");
      pre.appendChild(code1);
      const root = document.createElement("div");
      root.appendChild(pre);

      applyHighlighting(root);

      expect(mockHighlightElement).toHaveBeenCalledTimes(1);
      expect(mockHighlightElement).toHaveBeenCalledWith(code1);
    });

    it("processes multiple pre code blocks", () => {
      const code1 = document.createElement("code");
      code1.textContent = "const x = 1;";
      const pre1 = document.createElement("pre");
      pre1.appendChild(code1);
      const code2 = document.createElement("code");
      code2.textContent = "function test() {}";
      const pre2 = document.createElement("pre");
      pre2.appendChild(code2);
      const root = document.createElement("div");
      root.appendChild(pre1);
      root.appendChild(pre2);

      applyHighlighting(root);

      expect(mockHighlightElement).toHaveBeenCalledTimes(2);
      expect(mockHighlightElement).toHaveBeenCalledWith(code1);
      expect(mockHighlightElement).toHaveBeenCalledWith(code2);
    });

    it("does not process code elements outside pre", () => {
      const code = document.createElement("code");
      code.textContent = "inline code";
      const root = document.createElement("div");
      root.appendChild(code);

      applyHighlighting(root);

      expect(mockHighlightElement).not.toHaveBeenCalled();
    });

    it("handles empty root gracefully", () => {
      const root = document.createElement("div");

      applyHighlighting(root);

      expect(mockHighlightElement).not.toHaveBeenCalled();
    });

    it("processes nested pre code structures", () => {
      const code = document.createElement("code");
      code.textContent = "nested code";
      const pre = document.createElement("pre");
      pre.appendChild(code);
      const container = document.createElement("div");
      container.appendChild(pre);
      const root = document.createElement("div");
      root.appendChild(container);

      applyHighlighting(root);

      expect(mockHighlightElement).toHaveBeenCalledTimes(1);
      expect(mockHighlightElement).toHaveBeenCalledWith(code);
    });

    it("processes code elements with class attributes", () => {
      const code = document.createElement("code");
      code.className = "language-javascript";
      code.textContent = "const x = 1;";
      const pre = document.createElement("pre");
      pre.appendChild(code);
      const root = document.createElement("div");
      root.appendChild(pre);

      applyHighlighting(root);

      expect(mockHighlightElement).toHaveBeenCalledTimes(1);
      expect(mockHighlightElement).toHaveBeenCalledWith(code);
    });
  });
});
