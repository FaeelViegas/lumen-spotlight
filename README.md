# Lumen Spotlight

> **[Leia em Português (pt-BR)](README.pt-BR.md)**

A fast, privacy-first, **macOS Spotlight-inspired launcher and global search engine** built natively for **GNOME Shell 50 (Wayland)** using **GJS (ES Modules)**, **GTK4 / libadwaita**, and a persistent **SQLite FTS5** file indexer.

[![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-50-4A86CF?logo=gnome&logoColor=white)](https://www.gnome.org/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![CI](https://github.com/FaeelViegas/lumen-spotlight/actions/workflows/ci.yml/badge.svg)](https://github.com/FaeelViegas/lumen-spotlight/actions/workflows/ci.yml)

---

## ✨ Features

- **Applications (`.desktop`, Flatpak & Snap)**: Instant fuzzy matching (`< 5 ms`) with source badges and frequency/recency-weighted ranking.
- **Hybrid File & Content Search**: Combines **LocalSearch (Tracker 3)** with a persistent **SQLite FTS5** Python daemon (`src/core/indexerDaemon.py`) updated in real time via `Gio.FileMonitor`.
  - **Inline Filters**: `kind:pdf`, `kind:imagem`, `kind:codigo`, `kind:pasta`, `in:Documentos`, `modified:hoje`, `modified:semana`.
  - **Code File Filtering**: Hides source code & build artifacts (`.py`, `.js`, `.ts`, `.cs`, `.rs`, etc.) from default document searches (configurable in Preferences, overridable anytime with `kind:code`).
- **Side Preview Panel**: Shows file metadata, text/code snippets, images, and smart-truncated paths with a full-path hover tooltip.
- **Safe Scientific Calculator**: Custom recursive-descent math parser (zero `eval()`), supporting `2^10 + sqrt(144)`, `15% of 800`, `15% de 800`, `cos(0) + ln(e)`.
- **Unit & Currency Converter**: Length, mass, volume, temperature, data, speed, area, time (`10 km em milhas`, `100 c em f`, `2 gb em mb`), and currencies (`100 usd em brl`) with offline cache and opt-in live updates.
- **Offline Dictionary & Quick Translation**: Built-in PT-BR ↔ EN lexicon (`def algoritmo`, `tr ephemeral`).
- **Clipboard History (Opt-in)**: Kept strictly in RAM for the current session, automatically excluding password managers (`KeePassXC`, `Bitwarden`, `1Password`, `GNOME Secrets`, `Seahorse`).
- **System Controls & Open Windows**: Lock screen, suspend, restart, power off, logout, toggle Dark Mode / Do Not Disturb / Wi-Fi / Bluetooth, screenshot, and switch across open windows.
- **Web Search Prefixes**: `g <query>` (Google), `ddg <query>` (DuckDuckGo), `yt <query>` (YouTube), `gh <query>` (GitHub), `wiki <query>` (Wikipedia).
- **Emojis & Snippets**: Trigger emojis with `:` (`:rocket`, `:sorriso`) and dynamic snippets with `;` (`;email`, `;data`, `;uuid`).
- **6 Built-in Themes & Live Customization**:
  - `Spotlight Dark` (Default), `Liquid Glass`, `Cristal (Light)`, `Obsidian (OLED)`, `Nord Frost`, `Catppuccin Mocha`.
  - Configure search font size (`13–26 px`), window width (`520–960 px`), corner radius (`8–28 px`), and backdrop blur mode (`Hybrid`, `Always`, `CSS Only`).
- **Visual GTK4 / libadwaita Preferences**: Interactive keyboard shortcut recorder, 1-click presets, native `Gtk.FileDialog` folder picker, 1-click reindex, and visual snippet/web-engine editors.
- **Plugin System**: Load custom ES Module providers from `~/.local/share/lumen/plugins/`.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+Alt+S` *(default, customizable)* | Toggle Lumen Spotlight |
| `↑` / `↓` | Navigate results |
| `Tab` / `Shift+Tab` | Jump between result categories |
| `Enter` | Open app/file or copy calculation/snippet |
| `Ctrl+Enter` | Reveal file or `.desktop` in folder |
| `Ctrl+1` .. `Ctrl+9` | Activate result `1..9` immediately |
| `Ctrl+C` | Copy path, value, or text of selected item |
| `Esc` | Close Lumen Spotlight |

> **Note for Ubuntu users:** If you switch the shortcut to `Super+Space`, Lumen automatically detects conflicts with GNOME's `switch-input-source` binding and offers a 1-click switch to `Alt+Space`.

---

## 🚀 Installation

### Option 1: Build & Install from Source (Recommended)

#### Prerequisites
- **GNOME Shell 50** (Ubuntu 26.04+ or equivalent Wayland/GNOME 50 distro)
- `gjs`, `python3`, `libglib2.0-bin` (`glib-compile-schemas`), `gettext` (`msgfmt`), `zip`, `make`

```bash
git clone https://github.com/FaeelViegas/lumen-spotlight.git
cd lumen-spotlight
make install
```

> **Important on Wayland:** After installing a GNOME Shell extension for the first time, **log out and log back in** so GNOME Shell registers the extension directory, then enable it:
> ```bash
> gnome-extensions enable lumen-spotlight@faeelviegas.github.io
> ```

### Option 2: Install from `.shell-extension.zip` Release

1. Download `lumen-spotlight@faeelviegas.github.io.shell-extension.zip` from [Releases](https://github.com/FaeelViegas/lumen-spotlight/releases).
2. Install it:
   ```bash
   gnome-extensions install --force lumen-spotlight@faeelviegas.github.io.shell-extension.zip
   ```
3. Log out and log back in (on first install), then run:
   ```bash
   gnome-extensions enable lumen-spotlight@faeelviegas.github.io
   ```

### Open Preferences
```bash
gnome-extensions prefs lumen-spotlight@faeelviegas.github.io
```

---

## 🛠️ Development & Testing

```bash
# Run unit tests (32 assertions: ranking, filters, calculator, converter)
make test

# Run performance benchmark (< 50 ms in-memory, < 150 ms SQLite FTS5)
make benchmark

# Build EGO-compatible zip package in dist/
make pack

# Test in an isolated nested Wayland session (GNOME 50 Devkit)
dbus-run-session -- gnome-shell --devkit

# Watch live GNOME Shell logs
journalctl -f -o cat /usr/bin/gnome-shell
```

---

## 📚 Documentation

- [Architecture & Security Model](docs/ARCHITECTURE.md)
- [Plugin Development Guide](docs/PLUGINS.md)
- [Contributing Guidelines](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

---

## 📄 License

Distributed under the **GNU General Public License v3.0**. See [LICENSE](LICENSE) for more information.
