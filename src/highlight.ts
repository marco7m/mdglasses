import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";

let isConfigured = false;

export function configureHighlighting(): void {
  if (isConfigured) return;

  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("shell", bash);
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("html", xml);
  hljs.registerLanguage("xml", xml);

  isConfigured = true;
}

export function applyHighlighting(root: ParentNode): void {
  root.querySelectorAll("pre code").forEach((element) => {
    hljs.highlightElement(element as HTMLElement);
  });
}
