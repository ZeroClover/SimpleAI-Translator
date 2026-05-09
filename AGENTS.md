# Repository Guidelines

## Project Structure & Module Organization
- `src/browser-extension/` hosts extension surfaces (popup, options, background) and manifest tooling.
- `src/tauri/` contains the React renderer for desktop windows, while `src/common/` keeps shared hooks, stores, and translator logic consumed by both targets.
- `src-tauri/` is the Rust/Tauri backend for native commands, updates, and packaging; platform assets live in `src-tauri/resources` and `src-tauri/icons`.
- Supporting content sits in `public/` (static assets), `scripts/` (build helpers), `docs/` (provider guides), and `e2e/` (Playwright specs). Build outputs land in `dist/` and long-lived bundles in `release/`.

## Current Code Map
- `src/common/translate.ts` is the single translation entry point; it resolves `settings.defaultProviderId` or a runtime `providerId`, then dispatches through `src/common/engines/index.ts`.
- `src/common/engines/` is protocol-based. Keep runtime engines limited to `protocols/openai-chat.ts`, `protocols/openai-responses.ts`, `protocols/anthropic.ts`, plus `interfaces.ts`, `index.ts`, and `model-filter.ts`.
- `src/common/components/Settings.tsx` and `src/common/components/ProviderForm.tsx` own LLM Provider management, model refresh, default Provider selection, and OpenAI TTS settings.
- `src/common/tts/` owns TTS backends. OpenAI TTS is implemented in `openai-tts.ts` and reuses an existing OpenAI-compatible Provider instead of storing a separate API key.
- `src/browser-extension/manifest.ts` and `src/common/universal-fetch.ts` cover extension permissions and fetch behavior, including optional host permissions for custom endpoints.
- `src-tauri/` keeps native shell behavior such as windows, tray, updates, and packaging; removed global shortcuts, OCR, and writing commands should not be reintroduced.

## Removed Modules
- OCR and screenshot translation have been removed, including Tesseract integration, screenshot windows, OCR hotkeys, and OCR native binaries.
- Writing assistant, writing hotkeys, vocabulary book, custom Action management, and the old polishing/summarize/analyze/explain-code/big-bang modes have been removed.
- Global shortcuts, automatic translation, selection-triggered floating icons, input word-selection triggers, Dock hiding, and auto-hide-on-blur behavior have been removed.
- Telemetry and analytics integrations have been removed, including Sentry, Google Analytics, and Aptabase. Do not add passive analytics or telemetry SDKs.
- Vendor-specific LLM engines and templates have been removed. Do not add Azure, Gemini, MiniMax, DeepSeek, Moonshot, ChatGLM, Cohere, Groq, Cerebras, Kimi, Ollama, or ChatGPT Web as built-in engines; use `openai-chat`, `openai-responses`, or `anthropic` with a user-supplied endpoint.
- Remote promotion banners, promotion storage keys, and promotion analytics have been removed.

## Build, Test, and Development Commands
Install dependencies with `pnpm install` (package manager is pinned in `package.json`).
- `pnpm dev-chromium` starts the extension in Vite with HMR; `pnpm dev-tauri` boots the desktop shell with Tauri devtools.
- `pnpm build-browser-extension`, `pnpm build-tauri`, and `pnpm build-userscript` produce distributable bundles; use `pnpm clean` to reset `dist/` before packaging.
- `pnpm test` runs Vitest suites and `pnpm test:e2e` executes Playwright specs in `e2e/`.
- `pnpm lint`, `pnpm lint:fix`, and `pnpm format` keep ESLint and Prettier satisfied across TS/JS/CSS/MD files.

## Coding Style & Naming Conventions
TypeScript + React 18 (with Styletron) is the primary stack. Keep 4-space indentation, single quotes, and trailing commas—Prettier enforces this, so format before pushing. Components stay in `PascalCase`, hooks/utilities in `camelCase`, and constants in `SCREAMING_SNAKE_CASE`. Reuse helpers from `src/common` instead of duplicating logic, and keep staged files lint-clean to satisfy the pre-commit hook.

## Testing Guidelines
Unit tests live next to the code (`__tests__/foo.test.ts` or `foo.spec.ts`) and run with Vitest. Mock remote APIs and keep snapshots deterministic, especially around translation results. Update Playwright specs in `e2e/*.spec.ts` when UI flows change, and verify `pnpm test` plus `pnpm test:e2e` before requesting review.

## Commit & Pull Request Guidelines
Follow the lightweight conventional pattern seen in history (`fix:`, `feat:`, `chore:`) with concise, imperative summaries and optional scope (e.g., `fix: handle streaming fallback`). Reference related issues in parentheses `(#1234)` when helpful. PRs should describe the change, attach screenshots or GIFs for UI work, list verification commands, and call out platform coverage across Chrome, Firefox, and Tauri targets. Request review after lint/tests pass and diffs are free of secrets.

## Security & Configuration Tips
Never commit API keys or user artifacts; rely on runtime configuration via the in-app settings or local `.env` files ignored by git. When adding providers, document required environment keys under `docs/` and guard sensitive defaults behind toggles in `src/common`.

## Overthinking and excessive thoroughness

When you're deciding how to approach a problem, choose an approach and commit to it. Avoid revisiting decisions unless you encounter new information that directly contradicts your reasoning. If you're weighing two approaches, pick one and see it through. You can always course-correct later if the chosen approach fails.

After receiving tool results, carefully reflect on their quality and determine optimal next steps before proceeding. Use your thinking to plan and iterate based on this new information, and then take the best next action.

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

<investigate_before_answering>
Never speculate about code you have not opened. If the user references a specific file, you MUST read the file before answering. Make sure to investigate and read relevant files BEFORE answering questions about the codebase. Never make any claims about code before investigating unless you are certain of the correct answer - give grounded and hallucination-free answers.
</investigate_before_answering>
