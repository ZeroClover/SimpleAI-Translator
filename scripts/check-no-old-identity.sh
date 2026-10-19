#!/usr/bin/env bash
set -euo pipefail

pattern='yetone|nextai-translator|NextAI Translator|openai-translator|xyz\.yetone'
paths=(
    src
    src-tauri/src
    src-tauri/tauri.conf.json
    src-tauri/capabilities
    package.json
    wxt.config.ts
)

# A path that no longer exists would silently drop out of the check.
for path in "${paths[@]}"; do
    if [[ -z "$(git ls-files -- "$path" | head -n 1)" ]]; then
        printf 'Guarded path is missing or not tracked by git: %s\n' "$path" >&2
        exit 1
    fi
done

matches=$(
    git grep -n -i -E "$pattern" -- "${paths[@]}" \
        | grep -v -E 'github\.com/nextai-translator/nextai-translator' \
        || true
)

if [[ -n "$matches" ]]; then
    printf 'Old identity references are not allowed outside preserved remote links or release identity fields:\n%s\n' "$matches" >&2
    exit 1
fi

