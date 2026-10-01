# SimpleAI Translator

<p align="center">
    <br> English | <a href="README-CN.md">中文</a>
</p>

SimpleAI Translator is a cross-platform translator for browser extensions and desktop. It focuses on translation, language detection, translation history, and text-to-speech.

## Features

1. Streaming text translation.
2. Local and remote language detection.
3. Source and target language selection with a configurable default target language.
4. One-click copy for translation results.
5. Translation history with provider and model metadata.
6. Text-to-speech for source text and translation results.
7. Edge TTS, system speech synthesis, and OpenAI-compatible TTS.
8. Browser extension and Tauri desktop apps for Windows, macOS, and Linux.

## LLM Providers

Providers are configured by protocol, not by vendor template. The supported protocols are:

-   `openai-chat`: OpenAI Chat Completions compatible APIs.
-   `openai-responses`: OpenAI Responses API compatible APIs.
-   `anthropic`: Anthropic Messages API compatible APIs.

You can add multiple providers for the same protocol, give each provider a name, and choose the default model from all configured providers. The model picker in the translation window switches the model too, and the choice is saved as the new default.

When the endpoint is blank, the app uses the official endpoint for the selected protocol: `https://api.openai.com/v1` for `openai-chat` and `openai-responses`, and `https://api.anthropic.com` for `anthropic`. For any compatible third-party service, enter its base URL; a full request URL such as `.../chat/completions` is also accepted, and versioned base paths such as `/v1beta/openai` are kept as entered. The provider form's `Advanced` section accepts extra request headers as JSON.

Example configurations:

| Service       | Protocol                             | Endpoint                                                   | Example models                    |
| ------------- | ------------------------------------ | ---------------------------------------------------------- | --------------------------------- |
| OpenAI        | `openai-responses` or `openai-chat`  | blank                                                      | `gpt-5.6-sol`, `gpt-6-luna`       |
| Anthropic     | `anthropic`                          | blank                                                      | `claude-sonnet-5-5`, `claude-opus-5-5` |
| Google Gemini | `openai-chat`                        | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.8-flash`                |

Gemini's OpenAI-compatible API has no `/responses` endpoint, so use `openai-chat` for it.

The `Refresh` button next to each provider loads available models from the provider API. Chat and translation model lists are filtered to hide embedding, realtime, audio, transcription, moderation, TTS, image, video, and search-specific models. The model field also accepts free-form text, so private model aliases and providers without a `/models` endpoint remain usable.

The settings below the default model are stored per provider and model:

-   `Thinking Enabled` and `Thinking Effort` (`Low`, `Medium`, or `High`; default `Medium`). When thinking is off, models that always reason run at their lowest effort. OpenAI reasoning models work best with the `openai-responses` protocol.
-   `Use Structured Output` requests a JSON result through the provider's structured output API. `Strict JSON Schema` is on by default; on the OpenAI protocols, turning it off falls back to JSON Object mode for older or third-party models that do not support strict schemas.

## Text-to-Speech

The TTS settings support three backends:

-   `edge`: Microsoft Edge TTS.
-   `system`: the browser or operating system speech synthesis engine.
-   `openai`: OpenAI-compatible `/audio/speech`.

OpenAI TTS reuses an existing `openai-chat` or `openai-responses` provider. It does not store a separate TTS endpoint or API key. The TTS model picker filters results to `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts`, and `gpt-4o-mini-tts-YYYY-MM-DD`, while still allowing manual model entry.

## Breaking Changes in 1.0

Version 1.0 changes the desktop Bundle ID to `io.zeroclover.app.simpleai-translator` and treats the app as a fresh install. Old provider settings and old history data are not migrated; add an LLM Provider in settings before translating.

Version 1.0 removes OCR, writing assistant, vocabulary book, custom actions, promotion banners, sponsor prompts, telemetry, global shortcuts, automatic translation, and selection-triggered floating icons.

If you need the previous feature set, use the `v-pre-slim` source tag:

https://github.com/nextai-translator/nextai-translator/tree/v-pre-slim

## Installation

Download installers and packages from the [Latest Release](https://github.com/ZeroClover/SimpleAI-Translator/releases/latest) page.

### Windows

1. Download the `.exe` installer (x64).
2. Double-click the installer.
3. If Windows SmartScreen shows a warning, choose `More Info` -> `Run Anyway`.

### macOS

1. Download the `.dmg` for your CPU: `aarch64` for Apple Silicon or `x64` for Intel.
2. Open the `.dmg` and move `SimpleAI Translator` to `Applications`.

Release builds are signed with a Developer ID certificate and notarized by Apple.

### Linux

Download the `.deb` package or the `.AppImage` (x86_64). `SHA256SUMS-linux.txt` lists their SHA-256 checksums.

### Browser Extension

Each release includes browser extension packages and a userscript:

-   `SimpleAI-Translator-chromium-extension-<version>.zip`: unzip it, open `chrome://extensions`, enable `Developer mode`, then choose `Load unpacked` and select the unzipped folder.
-   `SimpleAI-Translator-firefox-extension-<version>.xpi`: the package is not signed by Mozilla. Load it from `about:debugging` -> `This Firefox` -> `Load Temporary Add-on`, or install it permanently in Firefox Developer Edition or Nightly with `xpinstall.signatures.required` set to `false`.
-   `SimpleAI-Translator-<version>.user.js`: install it with a userscript manager such as Tampermonkey or Violentmonkey.

After installation, open settings, add an LLM Provider, select a default model, and refresh the current page.

## Desktop Clip Extensions

For details, see [Desktop Clip Extension](./CLIP-EXTENSIONS.md).

## Development

Install dependencies with:

```sh
pnpm install
```

Common commands:

-   `pnpm dev-chromium`: start the Chromium extension dev build.
-   `pnpm dev-firefox`: build the Firefox extension in watch mode.
-   `pnpm dev-tauri`: start the Tauri desktop app.
-   `pnpm build-browser-extension`: build Chromium and Firefox extension bundles.
-   `pnpm build-userscript`: build the userscript.
-   `pnpm build-tauri`: build the desktop app.
-   `pnpm lint`: run ESLint.
-   `pnpm test`: run unit tests once.
-   `pnpm test:e2e`: run Playwright tests.

## License

[LICENSE](./LICENSE)
