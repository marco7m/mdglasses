import { showError } from "../../ui/notifications";

const COPIED_DURATION_MS = 1500;

/**
 * Wraps each `.markdown-body pre` in a container and adds a copy button.
 * Call after content is set and highlighting is applied.
 */
export function injectCodeBlockCopyButtons(root: ParentNode): void {
  const pres = root.querySelectorAll(".markdown-body pre");
  pres.forEach((pre) => {
    if (!(pre instanceof HTMLElement)) return;
    if (pre.closest(".code-block-wrapper")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "code-block-wrapper";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "code-block-copy-btn";
    button.setAttribute("aria-label", "Copy code");
    button.textContent = "Copy";

    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);
    wrapper.appendChild(button);

    button.addEventListener("click", async () => {
      const code = pre.querySelector("code");
      const text = code?.textContent ?? code?.innerText ?? "";
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          button.textContent = "Copied!";
          setTimeout(() => {
            button.textContent = "Copy";
          }, COPIED_DURATION_MS);
        } else {
          showError("Copy not available", 3000);
        }
      } catch {
        showError("Failed to copy", 3000);
      }
    });
  });
}
