# text-to-speech Specification

## Purpose
TBD - created by archiving change slim-to-translation-core. Update Purpose after archive.
## Requirements
### Requirement: 朗读源文本与翻译结果

系统 SHALL 在翻译界面对源文本与翻译结果各提供一个朗读按钮,点击后通过 TTS 子系统朗读对应文本。系统 SHALL 同一时刻仅播放一段 TTS;触发新的朗读时 MUST 先停止前一段。

#### Scenario: 朗读源文本

- **WHEN** 用户点击源文本旁的朗读按钮,源语言为 `en`,文本为 `hello world`
- **THEN** 系统 SHALL 以源语言对应的 TTS voice 朗读该文本
- **AND** 按钮图标 SHALL 切换为"停止"形态直到朗读结束

#### Scenario: 切换到朗读译文打断前一段

- **WHEN** 源文本朗读进行中,用户点击译文朗读按钮
- **THEN** 系统 SHALL 立即停止源文本朗读
- **AND** 开始播放译文的 TTS

#### Scenario: 再次点击同一按钮停止

- **WHEN** 朗读进行中,用户再次点击同一朗读按钮
- **THEN** 系统 SHALL 立即停止 TTS 播放
- **AND** 按钮图标 SHALL 恢复初始形态

### Requirement: TTS Provider 选择

系统 SHALL 支持三种 TTS backend,以 `TTSProvider` 联合 `'edge' | 'system' | 'openai'` 表示:

- `'edge'`:Microsoft Edge TTS
- `'system'`:浏览器/系统原生 `window.speechSynthesis`
- `'openai'`:通过 OpenAI 兼容协议的 `/audio/speech` 端点合成

系统 SHALL 在设置页允许用户选择当前 TTS provider。
系统 MUST NOT 在公开 settings schema 中继续使用旧枚举值 `'EdgeTTS'` 或 `'WebSpeech'`;本变更按新 App 处理,旧值不迁移。

#### Scenario: 默认使用 Edge TTS

- **WHEN** 用户首次安装,未修改 TTS 设置
- **THEN** `settings.tts.provider` SHALL 默认为 `'edge'`

#### Scenario: 切换到系统 TTS

- **WHEN** 用户在设置页把 TTS provider 改为 `'system'`
- **THEN** 后续朗读 SHALL 通过 `window.speechSynthesis` 完成

#### Scenario: 旧 TTS 枚举值不保留

- **WHEN** 持久化 settings 中存在旧值 `tts.provider === 'WebSpeech'` 或 `tts.provider === 'EdgeTTS'`
- **THEN** 新 schema 读取后 SHALL 使用默认 `'edge'` 或用户后续显式选择的新枚举值
- **AND** SHALL NOT 在 UI 或类型定义中暴露旧枚举值

#### Scenario: 切换到 OpenAI TTS 但未完成关联配置

- **WHEN** 用户在设置页把 TTS provider 改为 `'openai'`,但尚未选择 `settings.tts.openai.providerId` 与 `model`
- **THEN** 系统 SHALL 在设置页内显示内联错误"请选择关联的 LLM Provider 与 TTS 模型"
- **AND** 主界面朗读按钮 SHALL 禁用并 tooltip 提示同样信息

### Requirement: 每语言 voice 与全局参数

系统 SHALL 允许用户为每种语言独立配置 voice;SHALL 提供全局 `volume` 与 `rate` 控件;变更后 MUST 立即对后续朗读生效。

#### Scenario: 为日语指定 voice

- **WHEN** 用户在设置页对 `ja` 语言选择某具体 voice 名
- **THEN** `settings.tts.voices` SHALL 含一条 `{ lang: 'ja', voice: <name> }`
- **AND** 后续日语朗读 SHALL 使用该 voice

#### Scenario: 调整音量

- **WHEN** 用户把音量从 100% 调到 50%
- **THEN** 下一次朗读 SHALL 以 50% 音量播放
- **AND** 已经在播放的当次朗读不要求实时跟随(由实现决定,但 MUST 不报错)

### Requirement: Edge TTS 错误回退

系统 SHALL 在 Edge TTS 请求失败(网络错误、上游 5xx、解析失败)时通过 toast 给出可读错误提示,SHALL NOT 静默失败,SHALL NOT 自动切换到 system TTS。

#### Scenario: Edge TTS 不可达

- **WHEN** Edge TTS 服务返回错误或超时
- **THEN** 系统 SHALL 通过 toast 显示如"Edge TTS 不可用,请检查网络或在设置中切换到系统 TTS"
- **AND** 朗读按钮 SHALL 恢复到非播放状态

### Requirement: TTS 与已删除功能解耦

系统 SHALL 移除 TTS 在画词、写作助手、Action 等场景中的入口与回调;TTS 模块对外暴露的 API 接口 MUST NOT 引用 `Vocabulary`、`Action`、`writingTargetLanguage` 等概念。

#### Scenario: TTS 入口仅来自翻译界面

- **WHEN** 在代码库中检索 `speak(` 或等价 TTS 入口的调用方
- **THEN** 仅 `Translator.tsx`(及其子组件 `SpeakerIcon` / `SpeakerMotion`)与历史记录(`TranslationHistory.tsx`)SHALL 是合法调用方
- **AND** SHALL NOT 存在来自已删除模块的调用

### Requirement: OpenAI TTS 复用 Provider 凭据

系统 SHALL 在 `settings.tts.provider === 'openai'` 时,通过 `settings.tts.openai.providerId` 引用一份既有 ProviderConfig,从该条目读取 `endpoint`、`apiKey`、`extraHeaders` 用于 TTS 请求。系统 MUST NOT 在 TTS 设置中重复存储 endpoint 或 apiKey。

#### Scenario: 引用已有 Provider 完成朗读

- **WHEN** `settings.providers` 含一条 id 为 `p1` 的 `protocol === 'openai-chat'` 配置(endpoint `https://api.openai.com/v1`,apiKey `sk-xxx`)
- **AND** `settings.tts === { provider: 'openai', openai: { providerId: 'p1', model: 'tts-1', voice: 'alloy' } }`
- **AND** 用户点击译文朗读按钮,文本为 `Hello`
- **THEN** 系统 SHALL 发起 `POST https://api.openai.com/v1/audio/speech`,鉴权 `Authorization: Bearer sk-xxx`
- **AND** 请求体 SHALL 至少包含 `{ model: 'tts-1', voice: 'alloy', input: 'Hello' }`
- **AND** 响应音频 SHALL 被解码并通过 `<audio>` 播放

#### Scenario: 仅允许引用 OpenAI 系 Provider

- **WHEN** 用户在 OpenAI TTS 设置中打开"关联 Provider"下拉
- **THEN** 下拉列表 SHALL 仅包含 `protocol === 'openai-chat'` 或 `protocol === 'openai-responses'` 的条目
- **AND** `protocol === 'anthropic'` 的条目 SHALL 不出现(或显示但禁用,带提示"OpenAI TTS 不可使用 Anthropic 凭据")

#### Scenario: 引用的 Provider 已被删除

- **WHEN** 用户先把 TTS 设为 `openai` + `providerId: 'p1'`,随后在 Providers 列表中删除 `p1`
- **THEN** 系统在下次保存设置或下次朗读前 SHALL 检测到 dangling 引用
- **AND** SHALL 把 `settings.tts.provider` 自动回退为 `'edge'`
- **AND** 通过 toast 提示"原 OpenAI TTS 关联的 Provider 已被删除,已回退到 Edge TTS"

#### Scenario: 自定义 Endpoint 接入第三方

- **WHEN** 用户引用的 ProviderConfig 的 `endpoint` 指向某第三方 OpenAI 兼容供应商
- **THEN** TTS 请求 SHALL 发往该 endpoint 的 `/audio/speech` 子路径
- **AND** 路径归一化 SHALL 与 `openai-api-path` 中既有规则一致(不重复拼接)

### Requirement: OpenAI TTS 模型选择与发现

系统 SHALL 在 OpenAI TTS 设置中提供"模型"Combobox,通过 `listModels(referencedProviderConfig)` 拉取候选并经 `filterTTSModels` 白名单过滤。白名单 MUST 匹配且仅默认匹配 `tts-1`、`tts-1-hd`、`gpt-4o-mini-tts` 与 `gpt-4o-mini-tts-YYYY-MM-DD` 同系列 snapshot(大小写不敏感);系统 SHALL NOT 默认匹配 `gpt-4o-tts`。系统 SHALL 同时允许用户手填模型名作为兜底。

#### Scenario: 白名单过滤

- **WHEN** 拉取得到 `['gpt-4o', 'gpt-4o-mini', 'tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15', 'gpt-4o-tts', 'whisper-1', 'text-embedding-3-small']`
- **THEN** `filterTTSModels` SHALL 返回 `['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15']`(顺序与原列表一致)

#### Scenario: 第三方 Provider 不暴露 TTS 模型

- **WHEN** 用户引用的第三方 Provider 的 `/models` 返回的列表过滤后为空
- **THEN** Combobox SHALL 显示空状态并提示"该 Provider 凭据下未发现 TTS 模型,可手填或更换 Provider"
- **AND** 用户 SHALL 仍能手填字符串保存

#### Scenario: 模型必填

- **WHEN** 用户把 TTS 切到 `openai` 但未填模型
- **THEN** 设置 SHALL 拒绝保存或保存后在主界面禁用朗读
- **AND** 提示"请选择 TTS 模型"

### Requirement: OpenAI TTS Voice 与音频格式

系统 SHALL 提供 voice 下拉,内置选项 MUST 包含 OpenAI 公开的标准 voice:`alloy / ash / ballad / coral / echo / fable / onyx / nova / sage / shimmer / verse / marin / cedar`,并允许用户自定义键入字符串或 `{ id: string }` custom voice 引用以兼容 OpenAI 自定义 voice 与第三方扩展。系统 SHALL 提供音频格式选择,默认 `'mp3'`,可选 `'opus' / 'aac' / 'flac' / 'wav' / 'pcm'`。

#### Scenario: 切换 voice 立即生效

- **WHEN** 用户把 voice 从 `alloy` 改为 `nova` 后保存
- **THEN** 下一次 OpenAI TTS 请求 SHALL 在请求体中传 `voice: 'nova'`

#### Scenario: 自定义 voice 名

- **WHEN** 用户键入下拉中不存在的 voice 名 `custom-voice-x` 并保存
- **THEN** 系统 SHALL 接受该值并在请求体中原样传递

#### Scenario: 自定义 voice id 对象

- **WHEN** 用户选择或输入 OpenAI custom voice id `voice_1234`
- **THEN** 系统 SHALL 允许以 `{ id: 'voice_1234' }` 形式存储或发送该 voice
- **AND** 请求体 SHALL 保持 OpenAI speech API 接受的 voice shape

#### Scenario: 默认音频格式

- **WHEN** 用户未修改音频格式
- **THEN** 请求体 SHALL 含 `response_format: 'mp3'`

### Requirement: OpenAI TTS 输入长度、语速与模型指令

系统 SHALL 遵守 OpenAI speech API 的单次 `input` 长度限制。对 OpenAI TTS,若朗读文本超过 4096 字符,系统 SHALL 按句子或段落拆分为多个不超过 4096 字符的片段,按顺序请求并连续播放。系统 SHALL 把全局 `rate` 映射为 OpenAI `speed`,并 clamp 到 `0.25..4.0`。系统 MAY 为 `gpt-4o-mini-tts` 同系列模型暴露可选 `instructions`;当模型为 `tts-1` 或 `tts-1-hd` 时 MUST NOT 发送 `instructions`。

#### Scenario: 长文本分段合成

- **WHEN** 用户用 OpenAI TTS 朗读 9000 字符文本
- **THEN** 系统 SHALL 拆分为多个 `input.length <= 4096` 的请求
- **AND** SHALL 按原文顺序连续播放音频

#### Scenario: rate 映射到 speed

- **WHEN** `settings.tts.rate` 被设置为超出 OpenAI 支持范围的值
- **THEN** OpenAI TTS 请求中的 `speed` SHALL 被限制在 `0.25..4.0`

#### Scenario: tts-1 不发送 instructions

- **WHEN** `settings.tts.openai.model === 'tts-1'` 且用户配置了 instructions
- **THEN** 请求体 SHALL NOT 包含 `instructions`

### Requirement: OpenAI TTS 错误回退

系统 SHALL 在 OpenAI TTS 请求失败(网络错误、4xx/5xx、音频解码失败)时通过 toast 给出可读错误,SHALL NOT 静默失败,SHALL NOT 自动切换到 Edge / system TTS(对照 Edge TTS 错误处理保持一致)。

#### Scenario: 鉴权失败

- **WHEN** 引用 Provider 的 apiKey 无效,服务端返回 401
- **THEN** toast SHALL 提示"OpenAI TTS 鉴权失败,请在设置中检查关联的 Provider 配置"
- **AND** 朗读按钮 SHALL 恢复非播放态

### Requirement: TTS 静默失败上限

系统 SHALL 对单次朗读请求设置合理超时(例如 15 秒);超时后 SHALL 视为失败并按上文错误提示路径处理。

#### Scenario: 朗读请求超时

- **WHEN** 一次 Edge TTS 请求超过 15 秒未返回任何音频数据
- **THEN** 系统 SHALL 取消该请求并通过 toast 报错
- **AND** 按钮 SHALL 恢复到非播放状态
