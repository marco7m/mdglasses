export interface AppElements {
  contentEl: HTMLElement;
  treePanel: HTMLElement;
  treeResizeHandle: HTMLElement;
  titleEl: HTMLElement;
  btnOpen: HTMLButtonElement;
  openMenu: HTMLElement;
  themeSelect: HTMLSelectElement;
  treeSearch: HTMLInputElement;
  treeHideToggle: HTMLInputElement;
  breadcrumb: HTMLElement;
}

function requireElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

export function renderAppShell(root: HTMLDivElement): AppElements {
  root.innerHTML = `
    <header class="toolbar">
      <div class="toolbar-open-wrap">
        <button type="button" id="btn-open" class="btn-open">Abrir</button>
        <div class="dropdown-menu" id="open-menu" aria-hidden="true">
          <button type="button" data-open="file">Ficheiro</button>
          <button type="button" data-open="folder">Pasta</button>
        </div>
      </div>
      <select id="theme-select" aria-label="Tema">
        <option value="light">Claro</option>
        <option value="sepia">Sepia</option>
        <option value="dark">Escuro</option>
        <option value="modern">Modern</option>
        <option value="nordic">Nordic</option>
      </select>
      <span id="title" class="title"></span>
    </header>
    <main class="main">
      <aside id="tree-panel" class="tree-panel hidden">
        <input type="text" id="tree-search" class="tree-search" placeholder="Buscar arquivos..." aria-label="Buscar arquivos">
        <label class="tree-hide-toggle">
          <input type="checkbox" id="tree-hide-patterns">
          <span>Mostrar arquivos ocultos</span>
        </label>
      </aside>
      <div id="tree-resize-handle" class="tree-resize-handle" role="separator" aria-label="Redimensionar painel"></div>
      <div class="content-wrapper">
        <nav id="breadcrumb" class="breadcrumb" aria-label="Navegação"></nav>
        <article id="content" class="markdown-body content"></article>
      </div>
    </main>
  `;

  return {
    contentEl: requireElement<HTMLElement>(root, "#content"),
    treePanel: requireElement<HTMLElement>(root, "#tree-panel"),
    treeResizeHandle: requireElement<HTMLElement>(root, "#tree-resize-handle"),
    titleEl: requireElement<HTMLElement>(root, "#title"),
    btnOpen: requireElement<HTMLButtonElement>(root, "#btn-open"),
    openMenu: requireElement<HTMLElement>(root, "#open-menu"),
    themeSelect: requireElement<HTMLSelectElement>(root, "#theme-select"),
    treeSearch: requireElement<HTMLInputElement>(root, "#tree-search"),
    treeHideToggle: requireElement<HTMLInputElement>(root, "#tree-hide-patterns"),
    breadcrumb: requireElement<HTMLElement>(root, "#breadcrumb"),
  };
}
