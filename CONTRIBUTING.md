# Contributing to Lumen Spotlight

Thank you for your interest in contributing to **Lumen Spotlight**!

## Development Setup

### Prerequisites
- Ubuntu 26.04+ or any Linux distribution running **GNOME Shell 50** (Wayland)
- `gjs` (1.88+), `python3` (with `sqlite3`), `glib2` (`glib-compile-schemas`), `gettext` (`msgfmt`), `zip`

### Local Development Workflow

1. Clone the repository:
   ```bash
   git clone https://github.com/FaeelViegas/lumen-spotlight.git
   cd lumen-spotlight
   ```

2. Compile schemas and symlink to your GNOME Shell extensions directory:
   ```bash
   make schemas locales
   mkdir -p ~/.local/share/gnome-shell/extensions
   ln -sfn "$(pwd)" ~/.local/share/gnome-shell/extensions/lumen-spotlight@faeelviegas.github.io
   ```

3. Test in an isolated nested Wayland session (recommended):
   ```bash
   dbus-run-session -- gnome-shell --devkit
   # Fallback if mutter-devkit is not installed:
   dbus-run-session -- gnome-shell --nested --wayland
   ```

4. Monitor GNOME Shell logs in real time:
   ```bash
   journalctl -f -o cat /usr/bin/gnome-shell
   ```

5. Open the Preferences window in isolation:
   ```bash
   make prefs
   ```

## Testing & Verification

Before opening a Pull Request, make sure all checks pass:

```bash
# Strict GSettings schema check
glib-compile-schemas --strict schemas/

# Unit tests
make test

# Performance benchmark (< 50 ms in-memory, < 150 ms SQLite FTS5)
make benchmark

# Build EGO-compatible .zip package
make pack
```

## Coding Guidelines

- **GNOME Shell 50 Compatibility**:
  - Never use deprecated `vertical: true/false` on `St.BoxLayout`; use `orientation: Clutter.Orientation.VERTICAL` / `HORIZONTAL`.
  - Never import `St`, `Clutter`, `Meta`, or `Shell` inside `prefs.js` (must remain isolated to GTK4 / `Adw` / `Gio` / `GLib`).
  - Clean up all signals, timers, subprocesses, and actors inside `disable()` and `destroy()`.
- **Security**:
  - Never use `eval()` or `Function()` on user input.
  - Always pass argument arrays to `Gio.Subprocess.new(...)` instead of spawning a shell.
- **Pull Requests**:
  - Keep changes focused and atomic.
  - Add or update tests in `tests/` when changing ranking, parsing, or conversion logic.
  - Update `CHANGELOG.md` and relevant documentation if adding user-facing features.
