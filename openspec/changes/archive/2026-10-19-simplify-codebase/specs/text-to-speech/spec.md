## MODIFIED Requirements

### Requirement: Edge TTS 错误回退

系统 SHALL 在 Edge TTS 请求失败(网络错误、上游错误、无音频或解析失败)时让朗读调用以错误结束:通过 toast 显示错误信息(以 `Edge TTS:` 开头,上游错误未带该前缀时 SHALL 补上)、调用 `onFinish`、把错误写入控制台,并使朗读按钮恢复到非播放状态。浏览器扩展与桌面端 SHALL 采用同一路径。系统 SHALL NOT 在 Edge TTS 失败时自动切换到 system TTS 或其它 provider。用户已停止该次朗读(中止信号已触发)后才到达的失败 SHALL 静默结束,SHALL NOT 显示 toast。

#### Scenario: Edge TTS 不可达

- **WHEN** Edge TTS 服务返回错误、超时或未返回音频
- **THEN** 该次朗读调用 SHALL 以错误结束
- **AND** 系统 SHALL 通过 toast 显示以 `Edge TTS:` 开头的错误信息
- **AND** 朗读按钮 SHALL 恢复到非播放状态
- **AND** 系统 SHALL NOT 通过 `window.speechSynthesis` 朗读该文本

#### Scenario: 停止后到达的 Edge TTS 失败

- **WHEN** 用户在 Edge TTS 合成返回前停止朗读,随后合成请求失败
- **THEN** 系统 SHALL NOT 显示 toast
- **AND** 系统 SHALL NOT 播放音频


### Requirement: TTS 静默失败上限

系统 SHALL 对网络型 TTS 请求设置超时,超时后 SHALL 视为失败并按对应 backend 的错误路径处理:浏览器扩展中的 Edge TTS SHALL 对整次合成设置 15 秒超时;OpenAI TTS SHALL 对每个 `/audio/speech` 片段请求设置 15 秒超时。系统 TTS(`speechSynthesis`)不设超时。对桌面端 Edge TTS 原生合成,renderer MUST NOT 套用 15 秒整次合成超时;原生后端 SHALL 对每个上游片段的 WebSocket 升级请求与握手各设置 10 秒连接超时,并在等待每个 WebSocket 帧时设置 60 秒接收超时,任一片段超时 SHALL 使整次合成失败。

#### Scenario: 朗读请求超时

- **WHEN** 浏览器扩展中的一次 Edge TTS 合成超过 15 秒未返回音频,或一次 OpenAI TTS 片段请求超过 15 秒未完成
- **THEN** 系统 SHALL 结束该请求并按对应 backend 的错误路径处理
- **AND** 按钮 SHALL 恢复到非播放状态

#### Scenario: 桌面端长文本不被前端超时提前终止

- **WHEN** 桌面端 Edge TTS 朗读长文本并拆分为多个上游片段
- **THEN** renderer SHALL 等待 Tauri 合成命令完成或失败
- **AND** 每个上游片段 SHALL 由后端 10 秒连接超时与 60 秒帧接收超时控制
- **AND** renderer SHALL NOT 因整次合成超过 15 秒而直接报错

