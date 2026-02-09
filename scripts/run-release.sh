#!/usr/bin/env bash
# Run the release binary so the frontend is found.
# The app resolves frontendDist (../dist) relative to the executable path:
# executable is at src-tauri/target/release/mdglasses, so ../dist = target/dist.
# We symlink src-tauri/target/dist -> project dist so the binary finds the frontend.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm run build
mkdir -p src-tauri/target
ln -sfn "$ROOT/dist" src-tauri/target/dist
cd src-tauri
# WebKit2GTK on Linux often shows a blank window; this disables compositing mode so content renders.
export WEBKIT_DISABLE_COMPOSITING_MODE=1
exec ./target/release/mdglasses
