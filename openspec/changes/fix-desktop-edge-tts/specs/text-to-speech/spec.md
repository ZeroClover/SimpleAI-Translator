## ADDED Requirements

### Requirement: 桌面端 Edge TTS 原生合成

桌面端在 `settings.tts.provider === 'edge'` 时 SHALL 通过 Tauri 原生后端完成 Microsoft Edge TTS 合成请求,而不是在 Tauri WebView renderer 中直接建立 Edge TTS WebSocket。原生后端 MUST 发送 Edge TTS 所需的 `TrustedClientToken`、`Sec-MS-GEC`、`Sec-MS-GEC-Version`、Edge/Chromium 请求头和随机 `muid` cookie,并 MUST 使用 `audio-24khz-48kbitrate-mono-mp3` 作为 `speech.config` output format,从 WebSocket 音频帧收集 MP3 音频返回给 renderer 播放。

#### Scenario: 桌面端成功朗读 Edge TTS

- **WHEN** 用户在桌面端选择 `provider === 'edge'` 并点击译文朗读按钮,文本为 `Hello`
- **THEN** renderer SHALL 调用 Tauri Edge TTS 合成命令
- **AND** 原生后端 SHALL 使用 Microsoft Edge TTS 协议完成合成
- **AND** renderer SHALL 解码返回的 MP3 音频并播放
- **AND** 朗读按钮 SHALL 在播放期间保持"停止"形态直到播放结束或用户停止

#### Scenario: 桌面端发送必备协议头

- **WHEN** 桌面端后端建立 Edge TTS WebSocket
- **THEN** 请求 SHALL 包含 `Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold`
- **AND** 请求 SHALL 包含 `Pragma: no-cache`、`Cache-Control: no-cache`、`Sec-WebSocket-Version: 13`、Edge/Chromium `User-Agent` 与随机 `muid` cookie
- **AND** `speech.config` SHALL 请求 `audio-24khz-48kbitrate-mono-mp3`

#### Scenario: 桌面端不使用 renderer WebSocket 合成

- **WHEN** App 运行在 Tauri 桌面端且用户使用 Edge TTS
- **THEN** 系统 SHALL NOT 通过 Tauri WebView 的 `WebSocket` API 直接连接 Edge TTS 合成服务
- **AND** 系统 SHALL NOT 依赖 renderer 能设置自定义 WebSocket headers

### Requirement: 桌面端 Edge TTS voice 列表

桌面端在设置页加载 Edge TTS voices 时 SHALL 通过 Tauri 原生后端请求 Microsoft Edge TTS voice list。返回给 renderer 的 voice 数据 MUST 至少包含可显示名称、locale 和可保存的 voice 标识,并 MUST 与现有 `settings.tts.voices` 的 per-language voice 保存方式兼容。

#### Scenario: 设置页加载桌面端 Edge voices

- **WHEN** 用户在桌面端打开 TTS 设置且当前 Provider 为 `edge`
- **THEN** 设置页 SHALL 调用 Tauri Edge TTS voice-list 命令
- **AND** voice 列表 SHALL 使用上游返回的 locale 作为 `lang`
- **AND** 用户选择某个 voice 后,后续对应语言的 Edge TTS 朗读 SHALL 使用该 voice 标识

#### Scenario: 桌面端 Edge voices 加载失败回退

- **WHEN** 桌面端 Edge TTS voice-list 命令因网络错误、403 重试失败或协议错误失败
- **THEN** 设置页 SHALL 保留现有内置默认 voice 列表回退
- **AND** 设置页 SHALL NOT 阻止用户继续保存 TTS 设置

### Requirement: Edge TTS 协议鉴权与 clock-skew 重试

桌面端 Edge TTS 原生后端 SHALL 按 Microsoft Edge TTS 当前协议生成 `Sec-MS-GEC`。clock skew SHALL 存储为进程内共享状态。当 voice-list 或合成请求因 403 响应失败且响应包含可解析的 `Date` header 时,后端 SHALL 根据服务端时间校正本次进程内 clock skew 并重试一次。

#### Scenario: 403 后按服务端时间重试

- **WHEN** Edge TTS voice-list 或合成请求返回 403
- **AND** 响应 headers 中包含可解析的 `Date`
- **THEN** 后端 SHALL 根据该 `Date` 调整 `Sec-MS-GEC` 生成时使用的时间偏移
- **AND** 后端 SHALL 重试同一请求一次

#### Scenario: 403 无法校正

- **WHEN** Edge TTS voice-list 或合成请求返回 403
- **AND** 响应 headers 中没有可解析的 `Date`
- **THEN** 后端 SHALL 将该请求视为失败
- **AND** renderer SHALL 通过现有 Edge TTS 错误提示路径恢复朗读按钮状态

### Requirement: 桌面端 Edge TTS 协议帧处理

桌面端 Edge TTS 原生后端 SHALL 按 Edge TTS WebSocket 协议解析 text 与 binary frame。后端 MUST 忽略预期 text path `response` 与 `turn.start`,MUST 在 `turn.end` 完成当前片段,MUST 只接受 `Path:audio` 的 binary 音频帧。若当前片段到达 `turn.end` 但未收到任何音频帧,后端 SHALL 返回 no-audio 错误。

#### Scenario: 忽略预期 text path

- **WHEN** Edge TTS WebSocket 返回 text frame 且 `Path` 为 `response` 或 `turn.start`
- **THEN** 后端 SHALL 忽略该 frame
- **AND** 合成流程 SHALL 继续等待音频或 `turn.end`

#### Scenario: binary 终止帧

- **WHEN** Edge TTS WebSocket 返回 binary frame 且 `Path:audio`
- **AND** 该 frame 没有 `Content-Type` 且 data 为空
- **THEN** 后端 SHALL 忽略该 frame

#### Scenario: binary 协议异常

- **WHEN** Edge TTS WebSocket 返回 binary frame 且 `Path` 不是 `audio`
- **OR** 返回没有 `Content-Type` 但 data 非空的 binary frame
- **OR** 返回 `Content-Type: audio/mpeg` 但 data 为空的 binary frame
- **THEN** 后端 SHALL 将该片段视为协议错误
- **AND** renderer SHALL 通过现有 Edge TTS 错误提示路径恢复朗读按钮状态

### Requirement: 桌面端 Edge TTS 输入清理与分段

桌面端 Edge TTS 原生后端 SHALL 在发送 SSML 前移除 Edge TTS 不支持的控制字符,对文本进行 XML 转义,并按 UTF-8 byte 长度拆分为不超过 4096 bytes 的片段。分段 MUST NOT 截断多字节 UTF-8 字符,且 MUST NOT 在 XML entity 中间截断。后端 SHALL 返回有序 MP3 片段,renderer SHALL 按片段顺序逐段解码并播放。

#### Scenario: 长文本安全分段合成

- **WHEN** 用户在桌面端用 Edge TTS 朗读超过 4096 bytes 的中英混合文本
- **THEN** 后端 SHALL 将文本拆分为多个不超过 4096 bytes 的 SSML 请求片段
- **AND** 每个片段 SHALL 是合法 UTF-8 文本
- **AND** 每个片段 SHALL NOT 在 XML entity 中间截断
- **AND** renderer SHALL 按原文本顺序播放合成后的音频

#### Scenario: 多段合成中任一片段失败

- **WHEN** 桌面端 Edge TTS 长文本被拆分为多个片段
- **AND** 任一片段发生网络错误、协议错误、no-audio 或接收超时
- **THEN** 后端 SHALL 将整次合成视为失败
- **AND** renderer SHALL NOT 播放已合成的半成品片段
- **AND** renderer SHALL 通过现有 Edge TTS 错误提示路径恢复朗读按钮状态

### Requirement: 桌面端 Edge TTS 错误分类

桌面端 Edge TTS 原生后端 SHALL 将失败归类为 network、auth、protocol、timeout 或 no-audio 中的一类,renderer SHALL 将这些失败映射到现有 Edge TTS 可读错误提示,且 SHALL NOT 自动切换到 system TTS。

#### Scenario: 后端返回错误分类

- **WHEN** 桌面端 Edge TTS 后端返回 network、auth、protocol、timeout 或 no-audio 错误
- **THEN** renderer SHALL 显示 Edge TTS 不可用相关 toast
- **AND** 朗读按钮 SHALL 恢复到非播放状态
- **AND** 系统 SHALL NOT 自动切换到 system TTS

### Requirement: 桌面端 Edge TTS 取消语义

桌面端 Edge TTS 合成结果返回前,如果用户停止朗读或触发新的朗读,renderer SHALL 标记该次请求为已取消。已取消请求后续返回音频时,renderer MUST NOT 开始播放该音频,并 MUST 保持按钮状态与当前朗读请求一致。后端 MAY 继续完成已发出的合成命令;该行为不得影响 renderer 的取消语义。

#### Scenario: 合成完成前取消

- **WHEN** 用户点击 Edge TTS 朗读后在音频返回前再次点击停止
- **THEN** renderer SHALL 立即恢复该按钮的非播放状态
- **AND** 如果后端稍后返回该次请求的音频,renderer SHALL 忽略该音频
- **AND** 系统 SHALL NOT 在用户停止后开始播放已取消请求的音频

#### Scenario: 分段播放期间取消

- **WHEN** 桌面端 Edge TTS 已开始播放多个返回片段中的第一个片段
- **AND** 用户点击停止
- **THEN** renderer SHALL 停止当前片段播放
- **AND** renderer SHALL NOT 播放后续片段

## MODIFIED Requirements

### Requirement: TTS 静默失败上限

系统 SHALL 对单次朗读请求设置合理超时;超时后 SHALL 视为失败并按上文错误提示路径处理。对非桌面端 Edge TTS、system TTS、OpenAI TTS,可继续使用现有整次请求超时策略。对桌面端 Edge TTS 原生合成,renderer MUST NOT 套用旧的 15 秒整次合成超时;后端 SHALL 对每个上游片段设置连接超时与接收/no-audio 超时,任一片段超时 SHALL 使整次合成失败。

#### Scenario: 朗读请求超时

- **WHEN** 一次 TTS 请求超过该 backend 的超时上限未返回可播放音频
- **THEN** 系统 SHALL 取消或结束该请求并通过 toast 报错
- **AND** 按钮 SHALL 恢复到非播放状态

#### Scenario: 桌面端长文本不被旧前端超时提前终止

- **WHEN** 桌面端 Edge TTS 朗读长文本并拆分为多个上游片段
- **THEN** renderer SHALL 等待 Tauri 合成命令完成或失败
- **AND** 每个上游片段 SHALL 由后端连接超时与接收/no-audio 超时控制
- **AND** renderer SHALL NOT 因整次合成超过 15 秒而直接报错
