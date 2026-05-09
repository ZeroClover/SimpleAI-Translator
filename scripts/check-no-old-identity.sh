#!/usr/bin/env bash
set -euo pipefail

pattern='yetone|nextai-translator|NextAI Translator|openai-translator|xyz\.yetone'
paths=(
    src
    src-tauri/src
    src-tauri/tauri.conf.json
    src-tauri/capabilities
    package.json
    src/browser-extension/manifest.ts
)

matches=$(
    git grep -n -i -E "$pattern" -- "${paths[@]}" \
        | grep -v -E 'github\.com/nextai-translator/nextai-translator' \
        || true
)

if [[ -n "$matches" ]]; then
    printf 'Old identity references are not allowed outside preserved remote links or release identity fields:\n%s\n' "$matches" >&2
    exit 1
fi

