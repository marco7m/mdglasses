#!/usr/bin/env bash
# Install Tauri/GTK/WebKit development dependencies on Ubuntu/Debian.
# Run from project root: bash scripts/install-deps-linux.sh

set -e
sudo apt update
sudo apt install -y \
  build-essential \
  libglib2.0-dev \
  libatk1.0-dev \
  libgdk-pixbuf-2.0-dev \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf

echo "Done. You can now run: npm run tauri build"
