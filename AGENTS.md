# Repository Guidelines

## Project Structure & Module Organization
- `src/browser-extension/` hosts extension surfaces (popup, options, background) and manifest tooling.
- `src/tauri/` contains the React renderer for desktop windows, while `src/common/` keeps shared hooks, stores, and translator logic consumed by both targets.
- `src-tauri/` is the Rust/Tauri backend for native commands, updates, and packaging; platform assets live in `src-tauri/resources` and `src-tauri/icons`.
- Supporting content sits in `public/` (static assets), `scripts/` (build helpers), `docs/` (release docs and notes), and `e2e/` (Playwright specs). Build outputs land in `dist/` and long-lived bundles in `release/`.

## Current Code Map
- `src/common/translate.ts` is the single translation entry point. It resolves the provider and model (runtime `providerId`/`model`, then `settings.defaultModel`, then `settings.defaultProviderId`), looks up that Provider + Model's output controls (thinking, `reasoningEffort`, structured output), assembles the prompt, and dispatches through `src/common/engines/index.ts`.
- `src/common/engines/` is protocol-based. Keep runtime engines limited to `protocols/openai-chat.ts`, `protocols/openai-responses.ts`, `protocols/anthropic.ts`, plus `interfaces.ts`, `index.ts`, `model-filter.ts`, and `thinking-filter.ts` (strips inline thinking blocks from streamed output).
- `src/common/components/Settings.tsx` and `src/common/components/ProviderForm.tsx` own LLM Provider management, model refresh, default model selection, per Provider + Model output controls, and OpenAI TTS settings.
- `src/common/openai-api-path.ts` normalizes user-supplied endpoints into protocol URLs.
- `src/common/tts/` owns TTS backends. OpenAI TTS is implemented in `openai-tts.ts` and reuses an existing OpenAI-compatible Provider instead of storing a separate API key.
- `src/browser-extension/manifest.ts` and `src/common/universal-fetch.ts` cover extension permissions and fetch behavior, including optional host permissions for custom endpoints.
- `src-tauri/` keeps native shell behavior such as windows, tray, updates, and packaging; removed global shortcuts, OCR, and writing commands should not be reintroduced.

## Behavior Specs
`openspec/specs/<capability>/spec.md` is the source of truth for product behavior. Before changing a behavior, read the spec that owns it; update that spec in the same change.
- `translation-core`: translation flow, per-protocol request and stream handling (thinking/effort mapping per model family, lowest effort sent when thinking is off, `max_tokens`, refusals, stream termination), prompt assembly, and prompt-injection isolation.
- `llm-provider-config`: ProviderConfig, endpoint normalization, model discovery, and Provider + Model output controls (`thinkingEnabled`, `reasoningEffort`, structured output) with their settings UI.
- `structured-output`: JSON schema payloads per protocol, where the schema goes in the prompt, and validation failures.
- `settings-surface`: which settings fields and panels exist.
- `text-to-speech`: Edge, system, and OpenAI TTS.
- `language-detection`, `app-identity`, `no-telemetry`: source-language detection, product naming and bundle identity, and the no-analytics guarantees.

## Removed Modules
- OCR and screenshot translation have been removed, including Tesseract integration, screenshot windows, OCR hotkeys, and OCR native binaries.
- Writing assistant, writing hotkeys, vocabulary book, custom Action management, and the old polishing/summarize/analyze/explain-code/big-bang modes have been removed.
- Global shortcuts, automatic translation, selection-triggered floating icons, input word-selection triggers, Dock hiding, and auto-hide-on-blur behavior have been removed.
- Telemetry and analytics integrations have been removed, including Sentry, Google Analytics, and Aptabase. Do not add passive analytics or telemetry SDKs.
- Vendor-specific LLM engines and templates have been removed. Do not add Azure, Gemini, MiniMax, DeepSeek, Moonshot, ChatGLM, Cohere, Groq, Cerebras, Kimi, Ollama, or ChatGPT Web as built-in engines; use `openai-chat`, `openai-responses`, or `anthropic` with a user-supplied endpoint.
- Remote promotion banners, promotion storage keys, and promotion analytics have been removed.

## Build, Test, and Development Commands
Install dependencies with `pnpm install` (package manager is pinned in `package.json`).
- `pnpm dev-chromium` / `pnpm dev-firefox` start the extension in Vite with HMR; `pnpm dev-tauri` boots the desktop shell with Tauri devtools.
- `pnpm build-browser-extension`, `pnpm build-tauri` (or `pnpm build-tauri-no-updater`), and `pnpm build-userscript` produce distributable bundles; use `pnpm clean` to reset `dist/` before packaging.
- `pnpm test` runs Vitest suites and `pnpm test:e2e` executes Playwright specs in `e2e/`.
- `pnpm lint` / `pnpm lint:fix` run ESLint on `src/**/*.{ts,tsx}`; `pnpm format` runs Prettier on `src/`.
- `pnpm check:no-telemetry` and `pnpm check:no-old-identity` are the grep guards behind the `no-telemetry` and `app-identity` specs.

## Coding Style & Naming Conventions
TypeScript + React 18 is the primary stack, with Base Web (`baseui-sd`) on Styletron plus `react-jss` for component styles. Keep 4-space indentation, single quotes, and trailing commas—Prettier enforces this, so format before pushing. Components stay in `PascalCase`, hooks/utilities in `camelCase`, and constants in `SCREAMING_SNAKE_CASE`. Reuse helpers from `src/common` instead of duplicating logic, and keep staged files lint-clean: the `simple-git-hooks` pre-commit hook runs `lint-staged` (ESLint + Prettier).

## Testing Guidelines
Unit tests live next to the code as `foo.spec.ts` and run with Vitest. Mock remote APIs and keep snapshots deterministic, especially around translation results. Update Playwright specs in `e2e/*.spec.ts` when UI flows change, and verify `pnpm test` plus `pnpm test:e2e` before requesting review.

## Commit & Pull Request Guidelines
Follow the lightweight conventional pattern seen in history (`fix:`, `feat:`, `chore:`) with concise, imperative summaries and optional scope (e.g., `fix: handle streaming fallback`). Reference related issues in parentheses `(#1234)` when helpful. PRs should describe the change, attach screenshots or GIFs for UI work, list verification commands, and call out platform coverage across Chrome, Firefox, and Tauri targets. Request review after lint/tests pass and diffs are free of secrets.

## Release Notes
- Before preparing a release, annotated version tag, or release notes, read `.codex/skills/release-notes/SKILL.md`.
- Keep reviewed user-facing notes in `docs/releases/<version>.md`; do not generate them from commit subjects. The annotated tag, GitHub Release body, and updater `latest.json.notes` must use the same content.

## Security & Configuration Tips
Never commit API keys or user artifacts. API keys are entered by the user in the in-app Provider settings and stored with the app settings; the app ships no built-in keys and reads none from environment variables.

## Scope and simplicity

Avoid over-engineering. Only make changes that are directly requested or clearly necessary. Keep solutions simple and focused:

- Scope: Don't add features, refactor code, or make "improvements" beyond what was asked. A bug fix doesn't need surrounding code cleaned up. A simple feature doesn't need extra configurability.

- Documentation: Don't add docstrings, comments, or type annotations to code you didn't change. Only add comments where the logic isn't self-evident.

- Defensive coding: Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs).

- Abstractions: Don't create helpers, utilities, or abstractions for one-time operations. Don't design for hypothetical future requirements. The right amount of complexity is the minimum needed for the current task.

## Reduce file creation in agentic coding

If you create any temporary new files, scripts, or helper files for iteration, clean up these files by removing them at the end of the task.

## Avoid focusing on passing tests and hard-coding

Please write a high-quality, general-purpose solution using the standard tools available. Do not create helper scripts or workarounds to accomplish the task more efficiently. Implement a solution that works correctly for all valid inputs, not just the test cases. Do not hard-code values or create solutions that only work for specific test inputs. Instead, implement the actual logic that solves the problem generally.

Focus on understanding the problem requirements and implementing the correct algorithm. Tests are there to verify correctness, not to define the solution. Provide a principled implementation that follows best practices and software design principles.

If the task is unreasonable or infeasible, or if any of the tests are incorrect, please inform me rather than working around them. The solution should be robust, maintainable, and extendable.

Read the files a question refers to before answering, and base claims about the code on what you read.
