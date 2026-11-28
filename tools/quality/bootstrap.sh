#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

for TOOL in crapper dryer mutator; do
    TOOL_DIR="$SCRIPT_DIR/$TOOL"
    VENV_DIR="$TOOL_DIR/.venv"
    python3 -m venv "$VENV_DIR"
    "$VENV_DIR/bin/python" -m pip install --disable-pip-version-check \
        'tree-sitter-language-pack==0.13.0' -e "$TOOL_DIR"
    SITE_PACKAGES=$("$VENV_DIR/bin/python" -c \
        'import sysconfig; print(sysconfig.get_paths()["purelib"])')
    install -m 0644 "$SCRIPT_DIR/sitecustomize.py" \
        "$SITE_PACKAGES/sitecustomize.py"
done
