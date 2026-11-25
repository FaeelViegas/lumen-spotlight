#!/usr/bin/env bash
set -euo pipefail

# Script de compilação de schemas, traduções e empacotamento .zip para extensions.gnome.org
EXT_UUID="lumen-spotlight@faeelviegas.github.io"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
OUT_ZIP="${DIST_DIR}/${EXT_UUID}.shell-extension.zip"

echo "[1/4] Compilando GSettings schemas..."
glib-compile-schemas "${ROOT_DIR}/schemas/"

echo "[2/4] Compilando catálogos de tradução gettext (pt_BR e en)..."
if command -v msgfmt >/dev/null 2>&1; then
    mkdir -p "${ROOT_DIR}/locale/pt_BR/LC_MESSAGES" "${ROOT_DIR}/locale/en/LC_MESSAGES"
    msgfmt "${ROOT_DIR}/po/pt_BR.po" -o "${ROOT_DIR}/locale/pt_BR/LC_MESSAGES/lumen.mo"
    msgfmt "${ROOT_DIR}/po/en.po" -o "${ROOT_DIR}/locale/en/LC_MESSAGES/lumen.mo"
fi

echo "[3/4] Executando testes unitários GJS..."
gjs -m "${ROOT_DIR}/tests/runTests.js"

echo "[4/4] Gerando pacote ${OUT_ZIP} compatível com extensions.gnome.org..."
mkdir -p "${DIST_DIR}"
rm -f "${OUT_ZIP}"
(
    cd "${ROOT_DIR}"
    EXTRA_DIRS=()
    if [ -d "locale" ]; then
        EXTRA_DIRS+=("locale/")
    fi
    zip -r "${OUT_ZIP}" \
        metadata.json \
        extension.js \
        prefs.js \
        stylesheet.css \
        LICENSE \
        README.md \
        schemas/org.gnome.shell.extensions.lumen.gschema.xml \
        src/ \
        po/ \
        "${EXTRA_DIRS[@]}" \
        -x "*/__pycache__/*" "*.pyc" "schemas/gschemas.compiled"
)

echo "✅ Pacote gerado com sucesso em: ${OUT_ZIP}"
