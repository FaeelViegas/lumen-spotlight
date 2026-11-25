# Changelog

All notable changes to **Lumen Spotlight** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Reorganized repository structure to the project root for clean public distribution on GitHub.
- Updated extension UUID to `lumen-spotlight@faeelviegas.github.io` and repository metadata URLs.
- Added English (`README.md`) and Brazilian Portuguese (`README.pt-BR.md`) documentation, `LICENSE` (GPL-3.0), `CONTRIBUTING.md`, `Makefile`, `docs/`, and GitHub Actions CI.

## [1.1.0] - 2026-10-20

### Added
- **6 Visual Themes**: `Spotlight Dark` (default), `Liquid Glass`, `Cristal (Light)`, `Obsidian (OLED)`, `Nord Frost`, and `Catppuccin Mocha`.
- **Customizable Typography & Dimensions**: Live preferences for search bar font size (`13–26 px`), window width (`520–960 px`), and corner radius (`8–28 px`).
- **Visual Preferences UI**: Interactive keyboard shortcut recorder, 1-click shortcut presets, native `Gtk.FileDialog` folder picker, 1-click reindex button, and expandable snippet/web-engine editors.
- **Programming File Filter**: Option `hide-code-files` (enabled by default) with configurable extension exclusion list, overridable inline via `kind:code`.
- **Preview Path Truncation + Hover Tooltip**: Smart middle truncation for long Flatpak/file paths with animated full-path tooltip on hover.

### Fixed
- **Wayland Overlay Freeze on `Alt+Tab`**: Completely detaches `_backdrop` from `Main.layoutManager` on hide, with safety timeout and focus/overview observers.
- **Enter Key Activation**: Captures `Return`, `KP_Enter`, and `ISO_Enter` directly on `Clutter.Text` and during capture phase.
- **Document Search Accuracy**: Breadth-first (BFS) file indexing prioritizing user document folders (`~/Documentos`, `~/Downloads`, `~/Área de trabalho`, `~/Imagens`) and tighter fuzzy matching thresholds to eliminate false positives.
- **GTK4 Preferences Crash**: Fixed `Gtk.ShortcutLabel` `disabled_text` property naming.
- **Preview Panel Clipping**: Synchronized column widths and aligned labels so right-edge text never clips.

## [1.0.0] - 2026-10-19

### Added
- Initial release targeting **GNOME Shell 50 (Wayland)**.
- 11 built-in providers: Apps, Files (SQLite FTS5 + LocalSearch), Scientific Calculator, Unit/Currency Converter, PT-BR ↔ EN Dictionary, Opt-in Clipboard History, System Actions, Open Windows, Web Search prefixes, Emojis (`:`), and Snippets (`;`).
- External ES Module plugin loader (`~/.local/share/lumen/plugins/`).
- GJS unit test suite and performance benchmark.
