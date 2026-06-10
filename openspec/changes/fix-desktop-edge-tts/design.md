## Context

The current Edge TTS implementation lives in `src/common/tts/edge-tts.ts` and imports `EdgeTTS` / `listVoices` from `edge-tts-universal`. That module is shared by extension, userscript, and Tauri renderer targets. On desktop, it still executes inside the Tauri WebView, so the Edge TTS WebSocket handshake is constrained by browser WebSocket APIs.

`edge-tts-universal@1.4.0` documents the current limitation directly: direct browser usage only works in Microsoft Edge because the service now requires custom WebSocket headers such as `Sec-WebSocket-Version`. Server-side runtimes are unaffected because they can set the full request headers.

The `/Volumes/Git/edge-tts` implementation avoids that problem by owning the whole protocol request from a non-browser runtime. Its relevant behavior is:

- voice list and synthesis use `speech.platform.bing.com/consumer/speech/synthesize/readaloud`;
- each voice-list and WebSocket URL includes `TrustedClientToken`, `Sec-MS-GEC`, and `Sec-MS-GEC-Version`;
- requests include Edge/Chromium-like headers plus a randomized `muid` cookie;
- 403 responses can be caused by local clock skew, so the client adjusts from the server `Date` header and retries;
- synthesis sends `speech.config` followed by SSML, parses text and binary frames, collects `Path:audio` chunks, and finishes on `Path:turn.end`;
- input text is cleaned, XML-escaped, and split by UTF-8 byte length before synthesis.

## Goals / Non-Goals

**Goals:**

- Make desktop Edge TTS work in Tauri without relying on renderer WebSocket header support.
- Keep the public TTS provider schema as `'edge' | 'system' | 'openai'`.
- Preserve existing UI behavior: same settings, per-language voice selection, rate/volume controls, stop button behavior, timeout/error handling, and no silent fallback to system TTS.
- Keep browser extension and userscript behavior unchanged unless they already use the shared fallback logic.
- Use a focused Rust module that mirrors only the Edge TTS protocol needed by this app.

**Non-Goals:**

- Do not add a new built-in TTS provider or separate Edge API key setting.
- Do not reintroduce removed OCR, writing, shortcuts, floating icon, or analytics behavior.
- Do not embed Python or shell out to `/Volumes/Git/edge-tts` at runtime.
- Do not implement subtitle/word-boundary UI; only audio playback and voice listing are in scope.

## Decisions

### Move desktop Edge TTS network calls to Tauri commands

Add a native module such as `src-tauri/src/edge_tts.rs` with Specta-exported commands:

- `edge_tts_list_voices() -> Result<Vec<EdgeTtsVoice>, String>`
- `edge_tts_synthesize(request: EdgeTtsSynthesizeRequest) -> Result<EdgeTtsSynthesizeResult, String>`

`EdgeTtsVoice` should expose the minimum backend shape `{ shortName: string, friendlyName: string, locale: string }`; the renderer maps that into the existing `SpeechSynthesisVoice`-like `{ name, lang, voiceURI }` view. `EdgeTtsSynthesizeRequest` should be `{ text: string, voice: string, rate: string, volume: string, pitch?: string }`, where `rate`/`volume` are already Edge protocol strings such as `+20%` or `-20%` and `pitch` defaults to `+0Hz`. Keep the existing renderer-side numeric-to-Edge-string conversion; Rust should pass these units through instead of recalculating them.

Use `reqwest-websocket` for synthesis so the WebSocket handshake is still built from a `reqwest::RequestBuilder`. This keeps proxy, timeout, TLS, and header handling on the same client stack used for HTTP voice-list requests. The project currently uses `reqwest 0.11.24`; implementation should upgrade `reqwest` to the version required by the selected `reqwest-websocket` release and update existing `fetch.rs` call sites as needed. Do not model this as "native reqwest WebSocket"; `reqwest-websocket` is an explicit adapter over `reqwest`.

`EdgeTtsSynthesizeResult` should return `mimeType: "audio/mpeg"` plus an ordered list of base64 MP3 segments. Returning base64 avoids serializing large `Vec<u8>` values as JSON number arrays. Returning segments instead of byte-concatenating independent MP3 files avoids relying on decoder support for concatenated MP3 streams.

Alternative considered: keep `edge-tts-universal` in the renderer and adjust imports. This does not solve the desktop failure because the root limitation is browser WebSocket header control.

Alternative considered: use `tokio-tungstenite` directly. It can build requests with custom headers, but proxy support would require a separate HTTP CONNECT tunnel implementation instead of reusing `reqwest::Proxy`. Keep that as a fallback only if `reqwest-websocket` cannot satisfy the Edge TTS handshake.

### Keep the renderer as the playback owner

The renderer should still own `AudioContext`, stop handling, `onStartSpeaking`, and `onFinish`. On desktop, `src/common/tts/edge-tts.ts` detects `isDesktopApp()` and invokes the native synthesize command, converts each base64 MP3 segment to an `ArrayBuffer`, then decodes and plays the segments sequentially. `fetchEdgeVoices()` should use the same target split: desktop calls the Tauri voice-list command, while extension/userscript targets keep using `listVoices`. If the desktop voice-list command fails, keep the existing renderer fallback based on `languageToDefaultVoice`; do not make the backend fabricate fallback voices. If the abort signal fires before the backend result returns or between segments, the renderer must ignore remaining audio and must not start the next segment.

Alternative considered: play audio in Rust/native APIs. That would duplicate playback state and make cross-platform stop behavior harder to align with the existing TTS buttons.

### Port the minimal Edge TTS protocol from `/Volumes/Git/edge-tts`

The Rust module should implement the protocol helpers directly:

- constants for `BASE_URL`, `TRUSTED_CLIENT_TOKEN`, `VOICE_LIST`, `WSS_URL`, Chromium version, and Edge-style headers;
- WSS headers must include at least `Pragma: no-cache`, `Cache-Control: no-cache`, `Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold`, `Sec-WebSocket-Version: 13`, Edge-style `User-Agent`, `Accept-Encoding`, `Accept-Language`, and `Cookie: muid=<random>;`;
- voice-list headers must include at least `Authority: speech.platform.bing.com`, `Sec-CH-UA`, `Sec-CH-UA-Mobile: ?0`, `Accept: */*`, `Sec-Fetch-Site: none`, `Sec-Fetch-Mode: cors`, `Sec-Fetch-Dest: empty`, Edge-style `User-Agent`, `Accept-Encoding`, `Accept-Language`, and `Cookie: muid=<random>;`;
- `Sec-MS-GEC` generation using Windows file-time ticks rounded down to 5 minutes and SHA-256 uppercase hex;
- process-wide clock skew stored in Rust as an atomic or mutex-protected offset, updated only after a 403 response with a parseable `Date` header;
- fresh randomized uppercase MUID cookie per outbound HTTP request and per WebSocket handshake;
- RFC 2616 server date parsing for 403 clock-skew correction and one retry;
- safe text cleaning, XML escaping, and 4096-byte UTF-8 splitting with XML entity protection;
- WebSocket URL construction with a fresh no-dash UUID `ConnectionId` query parameter per WebSocket connection;
- fixed `speech.config` output format `audio-24khz-48kbitrate-mono-mp3`;
- SSML request headers with a fresh no-dash UUID `X-RequestId` per SSML request and `X-Timestamp:{timestamp}Z`; keep the trailing `Z` behavior from the reference implementation;
- text-frame header parsing, binary-frame header parsing, audio chunk collection, and `turn.end` completion;
- ignore expected text paths `response` and `turn.start`; accept `audio.metadata` text frames and skip their data because this change does not surface word/sentence boundary UI;
- binary audio validation: `Path` must be `audio`; `Content-Type` must be `audio/mpeg` or absent; absent `Content-Type` with empty data is a terminator to ignore; absent `Content-Type` with non-empty data is a protocol error; empty `audio/mpeg` data is a protocol error;
- `NoAudioReceived` handling when a segment reaches `turn.end` without any audio frame.

Do not manually advertise `Sec-WebSocket-Extensions: permessage-deflate` unless the chosen WebSocket stack also negotiates and decodes that extension. The Python reference uses `compress=15`, but a Rust client that sends the extension without implementation support would be incorrect. During implementation, verify the Edge TTS handshake without explicit per-message deflate; if upstream requires compression, switch the WebSocket stack to one with real permessage-deflate support rather than only adding the header.

Alternative considered: depend on another JavaScript Edge TTS package in the renderer. That keeps the same browser limitation and adds license/runtime uncertainty without addressing the protocol mismatch.

### Respect existing desktop proxy configuration

The voice-list HTTP client and WebSocket connector should use the existing desktop proxy settings when configured. The current `fetch_stream` command already reads `config.proxy`; the Edge TTS module should share that source and construct a `reqwest::Client` with `Proxy::all`, basic auth, and `NoProxy` mapping when configured. Using `reqwest-websocket` keeps the WSS upgrade on that same client, so proxy behavior does not require a separate CONNECT tunnel path.

Alternative considered: ignore proxy settings for Edge TTS. That would make the fix fail for users who need a proxy specifically to reach Microsoft speech endpoints.

### Keep browser-target Edge behavior isolated

The existing `edge-tts-universal` dependency may remain for non-desktop targets if it still serves the extension/userscript path. Desktop code should not import a browser-only Edge TTS implementation for synthesis or voice listing.

Alternative considered: remove `edge-tts-universal` immediately. That is only safe if no non-desktop target still needs it, so dependency cleanup should follow actual import usage after the desktop split.

## Risks / Trade-offs

- Edge TTS is an unofficial Microsoft endpoint and can change again → keep protocol constants and helpers isolated in one Rust module with focused tests for token generation, splitting, and frame parsing.
- Returning full MP3 segments after synthesis means playback starts after all segments are collected → this matches current renderer behavior, which already waits for `synthesize()` to return a Blob. If first-audio latency becomes a measured problem, add a streaming event path later.
- A cancelled renderer request may continue in the backend until the command completes → the renderer must ignore late results; an abort command can be added later only if repeated long-running requests become a measured problem.
- Renderer error presentation can stay simple → the renderer may use a single Edge TTS unavailable toast for `network`/`auth`/`protocol`/`timeout`/`no-audio`, or it may use different copy per class. Both satisfy this change as long as failures are visible and do not auto-switch providers.
- The old renderer-side 15s `Promise.race` would incorrectly fail long desktop synthesis → desktop native synthesis should rely on backend per-upstream-segment timeouts instead: connect timeout around 10s and receive/no-audio timeout around 60s per segment, matching the reference implementation's shape. Non-desktop code can keep the existing timeout path.
- Rust WebSocket compression support may differ from `aiohttp` → verify the no-extension handshake; if it fails, choose a WebSocket implementation with actual permessage-deflate support instead of adding an unsupported header.
- `reqwest-websocket` prepares the WebSocket upgrade from a `reqwest::RequestBuilder`, but its treatment of reserved WebSocket headers must be verified in a desktop smoke test. `Sec-WebSocket-Version: 13` is expected for RFC 6455 clients, but if the adapter strips or rejects a header Edge TTS requires, fall back to a lower-level WebSocket stack with explicit CONNECT/proxy handling.
- Clock-skew correction depends on the upstream `Date` header → if the header is missing or unparsable, surface the failure through the existing Edge TTS error path.
