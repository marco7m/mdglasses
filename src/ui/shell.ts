export interface AppElements {
  contentEl: HTMLElement;
  treePanel: HTMLElement;
  treeResizeHandle: HTMLElement;
  titleEl: HTMLElement;
  btnBack: HTMLButtonElement;
  btnForward: HTMLButtonElement;
  btnOpen: HTMLButtonElement;
  themeSelect: HTMLSelectElement;
  treeSearch: HTMLInputElement;
  treeHideToggle: HTMLInputElement;
  breadcrumb: HTMLElement;
  openModal: HTMLElement;
  openModalFolder: HTMLButtonElement;
  openModalFile: HTMLButtonElement;
  openModalCancel: HTMLButtonElement;
}

function requireElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

export function renderAppShell(root: HTMLDivElement): AppElements {
  root.innerHTML = `
    <header class="toolbar">
      <div class="toolbar-nav">
        <button type="button" id="btn-back" class="btn-nav" aria-label="Voltar" disabled>
          <span aria-hidden="true">←</span>
        </button>
        <button type="button" id="btn-forward" class="btn-nav" aria-label="Avançar" disabled>
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <div class="toolbar-open-wrap">
        <button type="button" id="btn-open" class="btn-open">Abrir</button>
      </div>
      <select id="theme-select" aria-label="Tema">
        <option value="light">Claro</option>
        <option value="sepia">Sepia</option>
        <option value="dark">Escuro</option>
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
    <div id="open-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="open-modal-title" aria-hidden="true">
      <div class="modal-overlay"></div>
      <div class="modal-box">
        <h2 id="open-modal-title" class="modal-title">Abrir</h2>
        <div class="modal-actions">
          <button type="button" id="open-modal-folder" class="btn-open-modal" aria-label="Abrir pasta">Abrir pasta</button>
          <button type="button" id="open-modal-file" class="btn-open-modal" aria-label="Abrir ficheiro">Abrir ficheiro</button>
          <button type="button" id="open-modal-cancel" class="btn-open-modal btn-cancel" aria-label="Cancelar">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  return {
    contentEl: requireElement<HTMLElement>(root, "#content"),
    treePanel: requireElement<HTMLElement>(root, "#tree-panel"),
    treeResizeHandle: requireElement<HTMLElement>(root, "#tree-resize-handle"),
    titleEl: requireElement<HTMLElement>(root, "#title"),
    btnBack: requireElement<HTMLButtonElement>(root, "#btn-back"),
    btnForward: requireElement<HTMLButtonElement>(root, "#btn-forward"),
    btnOpen: requireElement<HTMLButtonElement>(root, "#btn-open"),
    themeSelect: requireElement<HTMLSelectElement>(root, "#theme-select"),
    treeSearch: requireElement<HTMLInputElement>(root, "#tree-search"),
    treeHideToggle: requireElement<HTMLInputElement>(root, "#tree-hide-patterns"),
    breadcrumb: requireElement<HTMLElement>(root, "#breadcrumb"),
    openModal: requireElement<HTMLElement>(root, "#open-modal"),
    openModalFolder: requireElement<HTMLButtonElement>(root, "#open-modal-folder"),
    openModalFile: requireElement<HTMLButtonElement>(root, "#open-modal-file"),
    openModalCancel: requireElement<HTMLButtonElement>(root, "#open-modal-cancel"),
  };
}
