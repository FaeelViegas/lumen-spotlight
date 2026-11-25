UUID := lumen-spotlight@faeelviegas.github.io
EXT_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
ZIP_FILE := dist/$(UUID).shell-extension.zip

.PHONY: help schemas locales test benchmark pack install uninstall prefs clean

help:
	@echo "Lumen Spotlight ($(UUID))"
	@echo ""
	@echo "Targets:"
	@echo "  make schemas    Compile GSettings schemas"
	@echo "  make locales    Compile gettext .mo translations"
	@echo "  make test       Run GJS unit tests"
	@echo "  make benchmark  Run performance benchmark"
	@echo "  make pack       Run tests and build $(ZIP_FILE)"
	@echo "  make install    Build package and install locally via gnome-extensions"
	@echo "  make uninstall  Uninstall local extension"
	@echo "  make prefs      Open extension preferences window"
	@echo "  make clean      Remove build artifacts (dist/, locale/, compiled schemas)"

schemas:
	glib-compile-schemas schemas/

locales:
	@if command -v msgfmt >/dev/null 2>&1; then \
		mkdir -p locale/pt_BR/LC_MESSAGES locale/en/LC_MESSAGES; \
		msgfmt po/pt_BR.po -o locale/pt_BR/LC_MESSAGES/lumen.mo; \
		msgfmt po/en.po -o locale/en/LC_MESSAGES/lumen.mo; \
	fi

test:
	gjs -m tests/runTests.js

benchmark:
	gjs -m tests/benchmark.js

pack:
	chmod +x scripts/pack.sh
	./scripts/pack.sh

install: pack
	gnome-extensions install --force "$(ZIP_FILE)"
	glib-compile-schemas "$(EXT_DIR)/schemas/"
	@echo "Installed to $(EXT_DIR). Enable with: gnome-extensions enable $(UUID)"

uninstall:
	gnome-extensions uninstall "$(UUID)" || rm -rf "$(EXT_DIR)"

prefs:
	gnome-extensions prefs "$(UUID)"

clean:
	rm -rf dist/ locale/ schemas/gschemas.compiled
	find src -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
