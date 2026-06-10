## Why

桌面端当前的 Edge TTS 在 Tauri renderer 中直接使用 `edge-tts-universal`，但该路径运行在 WebView 浏览器环境，无法设置 Microsoft Edge TTS 现在要求的自定义 WebSocket headers，导致合成请求无法稳定完成。需要将桌面端 Edge TTS 修复为由原生后端完成网络握手与音频合成，同时保持浏览器扩展和用户脚本目标的现有行为边界。

## What Changes

- 桌面端 `provider === 'edge'` 的朗读与 voice 列表获取改为调用 Tauri command，由 Rust 后端发起 Edge TTS voice-list HTTP 请求和 WebSocket 合成请求。
- Rust 后端实现 `/Volumes/Git/edge-tts` 当前关键协议行为：`TrustedClientToken`、`Sec-MS-GEC` 生成、随机 `muid` cookie、Edge/Chromium 请求头、`speech.config` 与 SSML 消息、二进制音频帧解析、`turn.end` 完成判定、403 clock-skew 校正后重试。
- 桌面端 Edge TTS 音频由后端返回有序 base64 MP3 片段给 renderer，再复用前端播放与停止控制；中止信号必须停止前端播放并取消或忽略后端合成结果。
- Edge TTS 文本输入在桌面端按 UTF-8 byte 长度安全分段，避免拆开多字节字符或 XML entity，并按顺序合成/播放。
- 浏览器扩展、用户脚本和系统 TTS/OpenAI TTS 不改变协议与设置 schema。

## Capabilities

### New Capabilities

### Modified Capabilities
- `text-to-speech`: 桌面端 Edge TTS 必须通过原生 Tauri 后端完成 Microsoft Edge TTS 协议请求，并保持现有朗读、停止、voice 选择、错误提示与超时语义。

## Impact

- Affected code: `src/common/tts/edge-tts.ts`, `src/common/tts/index.ts`, `src/tauri/bindings.ts`, `src-tauri/src/main.rs`, and a new focused Rust module under `src-tauri/src/`.
- Affected dependencies: upgrade `reqwest` to the version required by the chosen WebSocket upgrade adapter, add `reqwest-websocket` plus hashing/base64/random-id helpers such as `sha2`, `base64`, and `uuid`; remove or stop using `edge-tts-universal` on the desktop Edge path if it becomes browser-only.
- Affected systems: Tauri desktop networking/proxy behavior, Edge TTS voice refresh in settings, renderer audio playback lifecycle, Vitest coverage for front-end dispatch, and Rust tests for protocol helpers.
