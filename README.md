# mdglasses

A cross-platform desktop Markdown reader built with Tauri.

Open a single `.md` file or a folder as a wiki, navigate notes in a tree, and get live updates when files change on disk.

## Features

- GitHub-like Markdown rendering
- Wiki mode for folders with tree navigation
- Internal Markdown link navigation
- Relative image loading from local files
- Live reload via filesystem watcher
- Code syntax highlighting
- Multiple UI themes
- Safe Markdown rendering (raw HTML disabled)

## Tech Stack

- Frontend: TypeScript + Vite
- Desktop shell: Tauri v2
- Markdown rendering: `comrak` (Rust)
- Highlighting: `highlight.js`

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

## Quick Start

```bash
npm install
npm run tauri dev
```

This starts Vite + Tauri with hot reload.

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

- Use the **Open** button to choose:
  - a single Markdown file
  - a folder (wiki mode)
- In wiki mode:
  - browse `.md` files in the side tree
  - search notes from the tree search box
  - click internal links to navigate between notes

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
