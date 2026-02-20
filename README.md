# mdglasses

Leitor de Markdown desktop, multiplataforma, feito com Tauri.  
Abra um arquivo `.md` isolado ou uma pasta inteira em modo wiki, com navegação em árvore, links internos e atualização automática quando os arquivos mudam em disco.

## Screenshots

<p align="center">
  <img src="docs/screenshots/folder-tree.png" alt="Modo wiki com árvore de arquivos" width="280" />
  <img src="docs/screenshots/sepia-theme.png" alt="Tema sepia" width="280" />
  <img src="docs/screenshots/dark-theme.png" alt="Tema escuro" width="280" />
</p>

## Principais recursos

- Renderização de Markdown com estilo similar ao GitHub
- Modo wiki para pastas com navegação por árvore
- Um único botão **Abrir** para escolher pasta (wiki) ou arquivo `.md`
- Navegação por links Markdown e `[[wikilinks]]` (estilo Obsidian)
- Carregamento de imagens relativas locais
- Recarregamento automático via watcher de arquivos
- Destaque de sintaxe em blocos de código + botão **Copiar**
- Temas de interface: claro, sepia e escuro
- Renderização segura (HTML bruto desabilitado)

## Requisitos

- Node.js 18+ e npm
- Rust (toolchain stable)
- Dependências de plataforma do Tauri:
  - Linux (Ubuntu/Debian): pacotes de desenvolvimento WebKitGTK/GTK
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools (C++) + WebView2

No Linux, você pode usar o helper:

```bash
bash scripts/install-deps-linux.sh
```

## Início rápido

```bash
npm install
npm run tauri dev
```

Esse comando sobe Vite + Tauri com hot reload.

## Comandos úteis

```bash
npm run dev          # Frontend no navegador (Vite)
npm run tauri dev    # App desktop completo em modo desenvolvimento
npm run tauri:dev    # Fallback Linux (força X11 + desativa compositing)
npm test             # Testes frontend (Vitest)
npm run test:rust    # Testes Rust
```

## Build

```bash
npm run tauri build
```

Artefatos principais:

- Binário: `src-tauri/target/release/mdglasses`
- Pacotes instaláveis: `src-tauri/target/release/bundle/` (`.deb`, `.rpm`, etc.)

Em alguns ambientes de CI, pode ser necessário:

```bash
CI=false npm run tauri build
```

## Executar binário de release localmente

```bash
bash scripts/run-release.sh
```

O script gera o frontend, vincula `dist/` ao local esperado pela release e abre o app compilado.

## Como usar

1. Clique em **Abrir**.
2. Primeiro aparece o seletor de pasta:
   - Se selecionar uma pasta, o app abre em modo wiki (árvore de arquivos `.md`).
   - Se cancelar, abre o seletor de arquivo para escolher um Markdown único.
3. No modo wiki, use a busca da árvore, breadcrumb, links internos e histórico (Alt+Left / Alt+Right).
4. Em blocos de código, use o botão **Copiar** no canto superior direito.

## Stack técnica

- Frontend: TypeScript + Vite
- Desktop: Tauri v2
- Renderização Markdown: `comrak` (Rust)
- Highlight de código: `highlight.js`

## Troubleshooting

Janela branca no Linux (alguns setups Wayland/WebKitGTK):

```bash
npm run tauri:dev
```

Porta `1420` já em uso:

```bash
lsof -ti:1420 | xargs -r kill
```

## Segurança

- Markdown em modo seguro (`comrak` com `unsafe_ = false`)
- HTML/scripts do conteúdo Markdown não são executados
- Assets locais resolvidos pelo protocolo de assets do Tauri

## Licença

Licensed under **MIT** — see [LICENSE](LICENSE).
