# slim-to-translation-core implementation notes

## 1. Preparation and baseline

### 1.1 Rollback tag

- Branch: `main`
- `git rev-parse HEAD`: `d529dc55c9a5f6b3811c0e3d0d161406ca6cbd19`
- `git rev-parse v-pre-slim`: `d529dc55c9a5f6b3811c0e3d0d161406ca6cbd19`
- Result: `v-pre-slim` already exists and points at the pre-slim baseline.

### 1.2 Dependency reference inventory

- `pnpm why tesseract.js`: direct production dependency `tesseract.js 4.0.2`.
- `rg` references:
  - `package.json:108`, `pnpm-lock.yaml` entries.
  - `src/common/components/Translator.tsx:39`: imports `RecognizeResult` and `createWorker` from `tesseract.js`.
  - `src/common/components/Translator.tsx:540`: `TesseractResult` extends `RecognizeResult`.
  - `src/common/components/Translator.tsx:1488`, `1533`: OCR workers are created.
- `pnpm why react-icons`: direct production dependency `react-icons 5.0.1`; it is used outside deleted Action/OCR paths, so keep it.
- `@react-pdf-viewer/*`: no `pnpm why` output and no source imports found.
- Rust dependency references:
  - `src-tauri/Cargo.toml:44`: `text-diff`, used by `src-tauri/src/writing.rs`.
  - `src-tauri/Cargo.toml:45`: `similar`, used by `src-tauri/src/writing.rs`.
  - `src-tauri/Cargo.toml:52`: `screenshots`, used by `src-tauri/src/ocr.rs`.
  - `src-tauri/Cargo.toml:53`: `image`, used by `src-tauri/src/ocr.rs`; `src-tauri/src/utils.rs` only has a local variable named `image`.

### 1.3 Translator / Settings removal map

`src/common/components/Translator.tsx`:

- Imports for removed features: `9-14`, `19-20`, `39-41`, `52`, `55-56`, `61`, `63`, `66-68`.
- Removed-feature style blocks: `147-252`, `428-478`.
- Action metadata/types: `508-551`.
- Action/Vocabulary state and layout calculations: `600-855`.
- Action-aware translate dependency setup: `924-1068`.
- Vocabulary service interactions: `1023-1025`, `1135-1140`, `1577-1578`, `1600`, `2239-2281`, `2793-2819`.
- OCR state and handlers: `1448-1570`.
- Action mode status and transitions: `1068`, `1249-1397`, `1605`, `1669-1704`, `2344-2425`.
- Header Action UI: `1914-2036`.
- OCR status / upload UI: `2078-2104`, `2229`.
- Footer provider/action metadata display: `2741-2750`.
- Action manager dialog: `2824-2850`.

`src/common/components/Settings.tsx`:

- Action DB import: `38`.
- Per-action model settings block: `1493-1746`.
- Writing tab entry: `2345-2346`.
- Default action / per-action model form: `3247-3250`.
- Writing settings section: `3406-3438`.
- OCR hotkey setting: `3456-3459`.
