# Changelog

## 1.0.0 - 2026-05-09

### BREAKING

-   Removed OCR, screenshot translation, writing assistant, vocabulary book, custom Action management, promotion banners, and the old polishing, summarize, analyze, explain-code, and big-bang modes.
-   Replaced vendor-specific provider settings with protocol-based LLM Providers: `openai-chat`, `openai-responses`, and `anthropic`.
-   Removed built-in vendor adapters and templates for Azure, Gemini, MiniMax, DeepSeek, Moonshot, ChatGLM, Cohere, Groq, Cerebras, Kimi, Ollama, ChatGPT Web, and related legacy providers.
-   Old provider settings are not migrated. Existing `apiKeys`, `apiURL`, `provider`, `azure*`, and other legacy fields are ignored and removed on the next settings write.
-   Old history, vocabulary, and Action data are not migrated. Translation history now stores only source text, translated text, language pair, provider id, model, and timestamps.
-   Browser extension host permissions were reduced. Custom endpoints now require optional host permission approval at runtime.

### Added

-   Added multi-provider configuration for OpenAI Chat Completions compatible APIs, OpenAI Responses compatible APIs, and Anthropic Messages compatible APIs.
-   Added dynamic model refresh and filtering for translation models.
-   Added OpenAI-compatible TTS through `/audio/speech`, reusing an existing OpenAI-compatible Provider.
-   Added TTS model filtering for `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts`, and matching dated snapshots.

### Rollback

This release does not provide runtime rollback for the removed settings schema. To use the pre-slim source tree, check out the `v-pre-slim` tag:

https://github.com/nextai-translator/nextai-translator/tree/v-pre-slim
