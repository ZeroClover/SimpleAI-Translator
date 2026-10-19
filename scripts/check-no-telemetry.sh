#!/usr/bin/env bash
set -euo pipefail

pattern='sentry|aptabase|googletagmanager|google-analytics|react-ga|@sentry|@aptabase'
paths=(
    src
    src-tauri/src
    src-tauri/capabilities
    src-tauri/gen/schemas
    package.json
    pnpm-lock.yaml
    src-tauri/Cargo.toml
    src-tauri/Cargo.lock
    wxt.config.ts
)

# A path that no longer exists would silently drop out of the check.
for path in "${paths[@]}"; do
    if [[ -z "$(git ls-files -- "$path" | head -n 1)" ]]; then
        printf 'Guarded path is missing or not tracked by git: %s\n' "$path" >&2
        exit 1
    fi
done

if matches=$(git grep -n -i -E "$pattern" -- "${paths[@]}"); then
    printf 'Telemetry references are not allowed in runtime/build files:\n%s\n' "$matches" >&2
    exit 1
fi

