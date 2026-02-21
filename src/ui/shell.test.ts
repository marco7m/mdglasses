import { describe, it, expect } from "vitest";
import { renderAppShell } from "./shell";

describe("ui", () => {
  describe("renderAppShell", () => {
    it("creates all expected elements in the HTML structure", () => {
      const root = document.createElement("div");
      const result = renderAppShell(root);

      expect(result.contentEl).toBeInstanceOf(HTMLElement);
      expect(result.treePanel).toBeInstanceOf(HTMLElement);
      expect(result.treeResizeHandle).toBeInstanceOf(HTMLElement);
      expect(result.titleEl).toBeInstanceOf(HTMLElement);
      expect(result.btnOpen).toBeInstanceOf(HTMLButtonElement);
      expect(result.themeSelect).toBeInstanceOf(HTMLSelectElement);
      expect(result.treeSearch).toBeInstanceOf(HTMLInputElement);
      expect(result.treeHideToggle).toBeInstanceOf(HTMLInputElement);
      expect(result.breadcrumb).toBeInstanceOf(HTMLElement);
      expect(result.openModal).toBeInstanceOf(HTMLElement);
      expect(result.openModalFolder).toBeInstanceOf(HTMLButtonElement);
      expect(result.openModalFile).toBeInstanceOf(HTMLButtonElement);
      expect(result.openModalCancel).toBeInstanceOf(HTMLButtonElement);
    });

    it("creates toolbar with correct structure", () => {
      const root = document.createElement("div");
      renderAppShell(root);

      const toolbar = root.querySelector("header.toolbar");
      expect(toolbar).not.toBeNull();
      expect(toolbar?.querySelector("#btn-open")).not.toBeNull();
      expect(toolbar?.querySelector("#open-menu")).toBeNull();
      expect(toolbar?.querySelector("#theme-select")).not.toBeNull();
      expect(toolbar?.querySelector("#title")).not.toBeNull();
    });

    it("creates main structure with tree panel and content", () => {
      const root = document.createElement("div");
      renderAppShell(root);

      const main = root.querySelector("main.main");
      expect(main).not.toBeNull();
      expect(main?.querySelector("#tree-panel")).not.toBeNull();
      expect(main?.querySelector("#tree-resize-handle")).not.toBeNull();
      expect(main?.querySelector(".content-wrapper")).not.toBeNull();
      expect(main?.querySelector("#breadcrumb")).not.toBeNull();
      expect(main?.querySelector("#content")).not.toBeNull();
    });

    it("tree panel has correct initial state", () => {
      const root = document.createElement("div");
      const result = renderAppShell(root);

      expect(result.treePanel.classList.contains("hidden")).toBe(true);
      expect(result.treePanel.querySelector("#tree-search")).not.toBeNull();
      expect(result.treePanel.querySelector(".tree-hide-toggle")).not.toBeNull();
    });

    it("checkbox has correct text and default state", () => {
      const root = document.createElement("div");
      const result = renderAppShell(root);

      expect(result.treeHideToggle.type).toBe("checkbox");
      expect(result.treeHideToggle.checked).toBe(false);
      
      const label = result.treeHideToggle.closest("label");
      expect(label?.textContent).toContain("Mostrar arquivos ocultos");
      expect(label?.textContent).not.toContain("Ocultar arquivos ocultos");
    });

    it("theme select has all theme options", () => {
      const root = document.createElement("div");
      const result = renderAppShell(root);

      const options = Array.from(result.themeSelect.options).map((opt) => opt.value);
      expect(options).toEqual(["light", "sepia", "dark"]);
    });

    it("toolbar has open button and no file/folder dropdown", () => {
      const root = document.createElement("div");
      renderAppShell(root);

      const toolbar = root.querySelector("header.toolbar");
      expect(toolbar?.querySelector("#btn-open")).not.toBeNull();
      expect(toolbar?.querySelector("#open-menu")).toBeNull();
      expect(toolbar?.querySelector("[data-open]")).toBeNull();
    });

    it("content wrapper contains breadcrumb and content", () => {
      const root = document.createElement("div");
      renderAppShell(root);

      const wrapper = root.querySelector(".content-wrapper");
      expect(wrapper).not.toBeNull();
      expect(wrapper?.querySelector("#breadcrumb")).not.toBeNull();
      expect(wrapper?.querySelector("#content")).not.toBeNull();
      expect(wrapper?.querySelector("#content")?.classList.contains("markdown-body")).toBe(true);
      expect(wrapper?.querySelector("#content")?.classList.contains("content")).toBe(true);
    });

    it("returns correct element references", () => {
      const root = document.createElement("div");
      const result = renderAppShell(root);

      expect(result.contentEl.id).toBe("content");
      expect(result.treePanel.id).toBe("tree-panel");
      expect(result.treeResizeHandle.id).toBe("tree-resize-handle");
      expect(result.titleEl.id).toBe("title");
      expect(result.btnOpen.id).toBe("btn-open");
      expect(result.themeSelect.id).toBe("theme-select");
      expect(result.treeSearch.id).toBe("tree-search");
      expect(result.treeHideToggle.id).toBe("tree-hide-patterns");
      expect(result.breadcrumb.id).toBe("breadcrumb");
      expect(result.openModal.id).toBe("open-modal");
      expect(result.openModalFolder.id).toBe("open-modal-folder");
      expect(result.openModalFile.id).toBe("open-modal-file");
      expect(result.openModalCancel.id).toBe("open-modal-cancel");
    });

    it("open modal is hidden by default and has folder, file, and cancel buttons", () => {
      const root = document.createElement("div");
      const result = renderAppShell(root);

      expect(result.openModal.classList.contains("hidden")).toBe(true);
      expect(result.openModal.getAttribute("aria-hidden")).toBe("true");
      expect(result.openModal.querySelector("#open-modal-folder")).not.toBeNull();
      expect(result.openModal.querySelector("#open-modal-file")).not.toBeNull();
      expect(result.openModal.querySelector("#open-modal-cancel")).not.toBeNull();
      expect(result.openModalFolder.textContent).toContain("Abrir pasta");
      expect(result.openModalFile.textContent).toContain("Abrir ficheiro");
      expect(result.openModalCancel.textContent).toContain("Cancelar");
    });

    it("always creates required elements (requireElement never fails in renderAppShell)", () => {
      const root = document.createElement("div");
      const result = renderAppShell(root);

      expect(result.contentEl).toBeDefined();
      expect(result.treePanel).toBeDefined();
      expect(result.breadcrumb).toBeDefined();
    });

    it("can be called multiple times on same root", () => {
      const root = document.createElement("div");
      const result1 = renderAppShell(root);
      const result2 = renderAppShell(root);

      expect(result1.contentEl.id).toBe(result2.contentEl.id);
      expect(result1.treePanel.id).toBe(result2.treePanel.id);
      expect(result2.contentEl).toBeInstanceOf(HTMLElement);
      expect(result2.treePanel).toBeInstanceOf(HTMLElement);
      expect(result2.btnOpen).toBeInstanceOf(HTMLButtonElement);
    });

    it("tree resize handle has correct attributes", () => {
      const root = document.createElement("div");
      const result = renderAppShell(root);

      expect(result.treeResizeHandle.getAttribute("role")).toBe("separator");
      expect(result.treeResizeHandle.getAttribute("aria-label")).toBe("Redimensionar painel");
    });

    it("breadcrumb has correct aria-label", () => {
      const root = document.createElement("div");
      const result = renderAppShell(root);

      expect(result.breadcrumb.getAttribute("aria-label")).toBe("Navegação");
      expect(result.breadcrumb.tagName).toBe("NAV");
    });
  });
});
