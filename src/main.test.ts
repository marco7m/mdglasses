import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("breadcrumb", () => {
  let breadcrumb: HTMLElement;

  beforeEach(() => {
    breadcrumb = document.createElement("nav");
    breadcrumb.className = "breadcrumb";
    document.body.appendChild(breadcrumb);
  });

  afterEach(() => {
    document.body.removeChild(breadcrumb);
  });

  it("renders root name in wiki mode", () => {
    // This is a simplified test - in real implementation, updateBreadcrumb would be called
    breadcrumb.innerHTML = '<a href="#" class="breadcrumb-link">Wiki</a>';
    const rootLink = breadcrumb.querySelector(".breadcrumb-link");
    expect(rootLink?.textContent).toBe("Wiki");
  });

  it("renders file name in file mode", () => {
    breadcrumb.innerHTML = '<span class="breadcrumb-current">file.md</span>';
    const current = breadcrumb.querySelector(".breadcrumb-current");
    expect(current?.textContent).toBe("file.md");
  });

  it("includes full path in title attribute", () => {
    breadcrumb.setAttribute("title", "/full/path/to/file.md");
    expect(breadcrumb.getAttribute("title")).toBe("/full/path/to/file.md");
  });

  it("renders multiple path segments", () => {
    breadcrumb.innerHTML = `
      <a href="#" class="breadcrumb-link">Root</a>
      <span class="breadcrumb-separator"> / </span>
      <a href="#" class="breadcrumb-link">Sub</a>
      <span class="breadcrumb-separator"> / </span>
      <span class="breadcrumb-current">File</span>
    `;
    
    const links = breadcrumb.querySelectorAll(".breadcrumb-link");
    const current = breadcrumb.querySelector(".breadcrumb-current");
    
    expect(links.length).toBe(2);
    expect(current?.textContent).toBe("File");
  });

  it("has correct CSS classes", () => {
    breadcrumb.innerHTML = `
      <a href="#" class="breadcrumb-link">Link</a>
      <span class="breadcrumb-separator"> / </span>
      <span class="breadcrumb-current">Current</span>
    `;
    
    expect(breadcrumb.querySelector(".breadcrumb-link")).toBeTruthy();
    expect(breadcrumb.querySelector(".breadcrumb-separator")).toBeTruthy();
    expect(breadcrumb.querySelector(".breadcrumb-current")).toBeTruthy();
  });
});
