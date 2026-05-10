## 1. Native Edge TTS Backend Setup

- [x] 1.1 Upgrade `reqwest` to the version required by the selected WebSocket adapter; after the upgrade, regress existing `fetch_stream` behavior for streaming, proxy, basic auth, and no_proxy.
- [x] 1.2 Add `reqwest-websocket` plus the Rust dependencies needed for SHA-256 hashing, base64 encoding, random MUID generation, and URL/request construction.
- [x] 1.3 Verify during implementation that `reqwest-websocket` satisfies Edge TTS without explicit permessage-deflate and preserves or supplies required reserved WebSocket headers such as `Sec-WebSocket-Version`; if not, switch to a lower-level WebSocket stack with real permessage-deflate and explicit proxy handling instead of adding unsupported headers.
- [x] 1.4 Create `src-tauri/src/edge_tts.rs` with focused request/response types, protocol constants, and error conversion helpers.
- [x] 1.5 Register `edge_tts_list_voices` and `edge_tts_synthesize` in `src-tauri/src/main.rs` and Specta command export.

## 2. Edge TTS Protocol Implementation

- [x] 2.1 Build one `reqwest::Client` path for Edge TTS HTTP and WSS that maps the existing desktop proxy config, basic auth, and no-proxy settings.
- [x] 2.2 Implement process-wide clock skew state plus `Sec-MS-GEC`, `Sec-MS-GEC-Version`, randomized `muid` cookie, and one-time 403 clock-skew retry.
- [x] 2.3 Implement the full required WSS and voice-list header sets from the reference implementation, including the Edge extension `Origin` and `Sec-WebSocket-Version`.
- [x] 2.4 Implement text cleanup, XML escaping, and 4096-byte UTF-8 safe splitting without cutting XML entities.
- [x] 2.5 Implement voice-list fetching and map upstream voice records into renderer-compatible voice objects.
- [x] 2.6 Implement WebSocket synthesis: generate separate no-dash UUIDs for URL `ConnectionId` and SSML `X-RequestId`, send fixed-format `speech.config`, send SSML with the trailing `X-Timestamp` `Z`, parse text/binary frames, collect `Path:audio` MP3 chunks, and finish on `Path:turn.end`.
- [x] 2.7 Return ordered base64 MP3 segments plus MIME type instead of concatenating independent MP3 byte streams into one blob.
- [x] 2.8 Implement per-upstream-segment connect and receive/no-audio timeouts, and fail the whole synthesis if any segment fails.

## 3. Renderer Integration

- [x] 3.1 Update `src/common/tts/edge-tts.ts` so desktop Edge TTS synthesis invokes the Tauri command and non-desktop targets keep their current path.
- [x] 3.2 Update desktop Edge voice loading to use the Tauri voice-list command while preserving the existing fallback/default voice behavior.
- [x] 3.3 Convert returned base64 MP3 segments to `ArrayBuffer`s and reuse the existing `AudioContext` playback lifecycle sequentially; call `onFinish` only after the final segment ends, while earlier segment `ended` events only start the next segment.
- [x] 3.4 Remove the old 15-second whole-request timeout from the desktop native Edge path while keeping non-desktop timeout behavior intact.
- [x] 3.5 Ensure aborted or superseded desktop Edge TTS requests do not start playback when their backend result arrives late or between returned segments.
- [x] 3.6 Keep Edge TTS failures on the existing toast/error path without automatically switching to system TTS.
- [x] 3.7 Ensure the desktop bundle does not import the browser `edge-tts-universal` synthesis path after the split.

## 4. Verification

- [ ] 4.1 Add Rust unit tests for `Sec-MS-GEC` generation with a fixed timestamp, clock-skew update, MUID/header construction shape, text cleanup, and safe splitting.
- [ ] 4.2 Add Rust unit tests for WebSocket text and binary frame parsing, including `audio.metadata`, `response`, `turn.start`, `turn.end`, valid `audio/mpeg`, empty no-content terminator frames, invalid non-empty no-content frames, and no-audio completion; construct binary frame fixtures directly as bytes (`2-byte header length + ASCII headers + CRLFCRLF + payload`) without a mock WebSocket server.
- [ ] 4.3 Add a mocked 403-to-clock-skew-to-retry-success test for voice-list and synthesis handshake paths.
- [ ] 4.4 Add a long-text test covering multi-segment synthesis ordering and whole-request failure when one segment times out or returns no audio.
- [ ] 4.5 Add Vitest coverage for desktop Edge TTS command dispatch, base64 segment playback conversion, removal of the desktop 15-second wrapper timeout, voice-list fallback, and late-result cancellation.
- [ ] 4.6 Add a build or import-shape regression check that the desktop Edge path no longer bundles/imports `edge-tts-universal` synthesis code.
- [ ] 4.7 Run `pnpm test` for affected TypeScript tests.
- [ ] 4.8 Run `cargo test` or the Tauri build/test command available in `src-tauri` for the Rust Edge TTS helpers.
- [ ] 4.9 Manually verify desktop Edge TTS voice refresh, voice-list 403 retry, proxy configuration, one short synthesis, long-text synthesis, and stopping while synthesis is still pending in `pnpm dev-tauri`.
