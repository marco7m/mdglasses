# mdglasses

A cross-platform desktop Markdown reader built with Tauri. Open a single `.md` file or a folder as a wiki, navigate notes in a tree, and get live updates when files change on disk.

## Screenshots

| Modo wiki (árvore) | Tema sepia | Tema escuro |
|--------------------|------------|-------------|
| <img src="docs/screenshots/folder-tree.png" alt="Modo wiki" width="360" /> | <img src="docs/screenshots/sepia-theme.png" alt="Tema sepia" width="360" /> | <img src="docs/screenshots/dark-theme.png" alt="Tema escuro" width="360" /> |

## Features

- GitHub-like Markdown rendering
- Wiki mode for folders with tree navigation
- Single **Open** button: choose a folder (wiki) or cancel and choose a file
- Internal Markdown link navigation (including Obsidian-style `[[wikilinks]]`)
- Relative image loading from local files
- Live reload via filesystem watcher
- Code syntax highlighting with copy-to-clipboard on code blocks
- Multiple UI themes (light, sepia, dark)
- Safe Markdown rendering (raw HTML disabled)

## Quick Start

```bash
npm install
npm run tauri dev
```

This starts Vite + Tauri with hot reload.

## Prerequisites

- Node.js 18+ and npm
- Rust stable toolchain
- Platform dependencies for Tauri:
  - Linux (Ubuntu/Debian): WebKitGTK/GTK development packages
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools (C++) + WebView2

Linux helper script:

```bash
bash scripts/install-deps-linux.sh
```

## Development Commands

```bash
npm run dev          # Vite only (browser)
npm run tauri dev    # Full desktop app in dev mode
npm run tauri:dev    # Linux fallback (forces X11 + disables WebKit compositing)
npm test             # Frontend tests (Vitest)
npm run test:rust    # Rust tests
```

## Build

```bash
npm run tauri build
```

Build artifacts are generated under:

- `src-tauri/target/release/mdglasses` (binary)
- `src-tauri/target/release/bundle/` (installer packages like `.deb`/`.rpm`)

In some CI environments, you may need:

```bash
CI=false npm run tauri build
```

## Run Release Binary Locally

```bash
bash scripts/run-release.sh
```

This script builds the frontend, links `dist/` to the expected release location, and runs the compiled app.

## Usage

- Click **Abrir** (Open): the **folder picker** appears first. Select a folder to open it as a wiki (tree of `.md` files). To open a single file instead, cancel the folder picker and then choose a Markdown file in the file picker.
- In wiki mode: browse `.md` files in the side tree, search from the tree search box, and click internal links (or `[[wikilinks]]`) to navigate. Use the breadcrumb to jump back. Back/forward buttons and keyboard shortcuts (Alt+Left/Right) work for history.
- Code blocks show a **Copy** button on the top-right edge.

## Tech Stack

- Frontend: TypeScript + Vite
- Desktop shell: Tauri v2
- Markdown rendering: `comrak` (Rust)
- Highlighting: `highlight.js`

## Troubleshooting

Linux blank/white window issue (WebKitGTK on some Wayland setups):

```bash
npm run tauri:dev
```

If port `1420` is already in use:

```bash
lsof -ti:1420 | xargs -r kill
```

## Security Notes

- Markdown is rendered in safe mode (`comrak` with `unsafe_ = false`)
- Raw HTML/scripts from Markdown are not executed
- Local assets are resolved through Tauri's asset protocol

## License

Dual-licensed under **MIT OR Apache-2.0** (as declared in `src-tauri/Cargo.toml`).
