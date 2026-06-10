# SimpleAI Translator

<p align="center">
    <br> English | <a href="README-CN.md">中文</a>
</p>

SimpleAI Translator is a cross-platform translator for browser extensions and desktop. Version 1.0 refocuses the app on translation, language detection, translation history, and text-to-speech.

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

SimpleAI Translator 1.0 supports provider configuration by protocol, not by vendor template. The supported protocols are:

-   `openai-chat`: OpenAI Chat Completions compatible APIs.
-   `openai-responses`: OpenAI Responses API compatible APIs.
-   `anthropic`: Anthropic Messages API compatible APIs.

You can add multiple providers for the same protocol, give each provider a name, set one provider as the default, and temporarily switch providers from the translation window. When the endpoint is blank, the app uses the official OpenAI or Anthropic endpoint for the selected protocol. For any compatible third-party service, enter its endpoint and model manually.

The provider form can refresh available models from the provider API. Chat and translation model lists are filtered to hide embedding, realtime, audio, transcription, moderation, TTS, image, video, and search-specific models. The model field also accepts free-form text, so private model aliases and providers without a `/models` endpoint remain usable.

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

### Windows

1. Download the `.exe` installer from the [Latest Release](https://github.com/ZeroClover/SimpleAI-Translator/releases/latest) page.
2. Double-click the installer.
3. If Windows shows a warning, choose `More Info` -> `Run Anyway`.

### macOS

1. Download the `.dmg` for your CPU from the [Latest Release](https://github.com/ZeroClover/SimpleAI-Translator/releases/latest) page.
2. Open the `.dmg` and move `SimpleAI Translator` to `Applications`.

If macOS reports that the app cannot be opened because the developer cannot be verified, open `Settings` -> `Privacy & Security`, choose `Still Open`, then confirm `Open`.

If Apple Silicon macOS reports that the app is damaged, run:

```sh
sudo xattr -d com.apple.quarantine /Applications/SimpleAI\ Translator.app
```

### Browser Extension

Install the extension from your browser store:

<p align="center">
  <a target="_blank" href="https://chrome.google.com/webstore/detail/nextai-translator/ogjibjphoadhljaoicdnjnmgokohngcc">
    <img src="https://img.shields.io/chrome-web-store/v/ogjibjphoadhljaoicdnjnmgokohngcc?label=Chrome%20Web%20Store&style=for-the-badge&color=blue&logo=google-chrome&logoColor=white" />
  </a>
  <a target="_blank" href="https://addons.mozilla.org/en-US/firefox/addon/nextai-translator/">
    <img src="https://img.shields.io/amo/v/nextai-translator?label=Firefox%20Add-on&style=for-the-badge&color=orange&logo=firefox&logoColor=white" />
  </a>
</p>

After installation, open settings, add an LLM Provider, set the default provider, and refresh the current page.

## Desktop Clip Extensions

For details, see [Desktop Clip Extension](./CLIP-EXTENSIONS.md).

## Development

Install dependencies with:

```sh
pnpm install
```

Common commands:

-   `pnpm dev-chromium`: start the Chromium extension dev build.
-   `pnpm dev-tauri`: start the Tauri desktop app.
-   `pnpm build-browser-extension`: build Chromium and Firefox extension bundles.
-   `pnpm build-tauri`: build the desktop app.
-   `pnpm lint`: run ESLint.
-   `pnpm exec vitest run`: run unit tests once.
-   `pnpm test:e2e`: run Playwright tests.

## License

[LICENSE](./LICENSE)
