# text-to-speech Specification

## Purpose
定义翻译界面与设置页中的文本朗读能力:Edge TTS、系统 `speechSynthesis` 与 OpenAI 兼容 `/audio/speech` 三种 backend 的选择、voice 与语速/音量参数、OpenAI TTS 对既有 Provider 凭据的复用,以及朗读失败、超时与停止的处理方式。
## Requirements

### Requirement: Edge TTS 资源释放

桌面与浏览器 Edge TTS 在合成、音频校验、解码或播放启动失败时 SHALL 关闭本次 AudioContext 并移除取消监听器。播放完成或主动取消亦 SHALL 清理资源，合成完成后 SHALL 清除超时计时器。失败 SHALL 沿用现有错误提示与按钮复位行为，不切换 backend。

#### Scenario: 合成请求失败

- **WHEN** 合成失败或返回无效音频
- **THEN** 已创建的 AudioContext SHALL 关闭，后续朗读 SHALL 可正常开始

### Requirement: 朗读源文本与翻译结果

系统 SHALL 在翻译界面对源文本与翻译结果各提供一个朗读按钮(`SpeakerIcon`),点击后通过 TTS 子系统朗读对应文本。每个朗读按钮 SHALL 持有独立的中止控制:在加载或播放期间再次点击同一按钮 SHALL 停止该次朗读;按钮所在组件卸载时 SHALL 停止该次朗读。系统 SHALL 在所有朗读按钮(含设置页试听按钮)之间保证同一时刻至多一个朗读:开始新的朗读前 SHALL 中止当前正在加载或播放的朗读,并使其按钮图标恢复初始形态。

#### Scenario: 朗读源文本

- **WHEN** 用户点击源文本旁的朗读按钮,源语言为 `en`,文本为 `hello world`
- **THEN** 系统 SHALL 以源语言对应的 TTS 设置朗读该文本
- **AND** 按钮 SHALL 在音频开始播放前显示加载图标,开始播放后显示播放中动画,直到朗读结束

#### Scenario: 新的朗读打断前一个朗读

- **WHEN** 源文本朗读加载中或播放中,用户点击译文朗读按钮
- **THEN** 系统 SHALL 中止源文本的朗读请求与播放
- **AND** 源文本朗读按钮图标 SHALL 恢复初始形态
- **AND** 系统 SHALL 开始译文朗读

#### Scenario: 再次点击同一按钮停止

- **WHEN** 朗读加载中或播放中,用户再次点击同一朗读按钮
- **THEN** 系统 SHALL 中止该次朗读
- **AND** 按钮图标 SHALL 恢复初始形态

### Requirement: TTS Provider 选择

系统 SHALL 支持三种 TTS backend,以 `TTSProvider` 联合 `'edge' | 'system' | 'openai'` 表示:

- `'edge'`:Microsoft Edge TTS
- `'system'`:浏览器/系统原生 `window.speechSynthesis`
- `'openai'`:通过 OpenAI 兼容协议的 `/audio/speech` 端点合成

系统 SHALL 在设置页 TTS 标签中以下拉框允许用户选择当前 TTS provider。读取 settings 时,`tts.provider` 不属于上述三个值(包括旧值 `'EdgeTTS'`、`'WebSpeech'`)SHALL 被规范化为 `'edge'`;旧值不做迁移映射。

#### Scenario: 默认使用 Edge TTS

- **WHEN** 用户首次安装,未修改 TTS 设置
- **THEN** 读取到的 `settings.tts.provider` SHALL 为 `'edge'`

#### Scenario: 切换到系统 TTS

- **WHEN** 用户在设置页把 TTS provider 改为 `'system'`
- **THEN** 后续朗读 SHALL 通过 `window.speechSynthesis` 完成

#### Scenario: 旧 TTS 枚举值不保留

- **WHEN** 持久化 settings 中存在旧值 `tts.provider === 'WebSpeech'` 或 `tts.provider === 'EdgeTTS'`
- **THEN** 读取后的 `settings.tts.provider` SHALL 为 `'edge'`
- **AND** UI 与类型定义 SHALL NOT 暴露旧枚举值

#### Scenario: OpenAI TTS 未完成关联配置

- **WHEN** 用户在设置页把 TTS provider 改为 `'openai'`,但 `settings.tts.openai.providerId` 或 `model` 为空
- **THEN** 设置页 SHALL 在 OpenAI TTS 配置区显示内联错误"请选择关联的 LLM Provider 与 TTS 模型。"
- **AND** 主界面朗读按钮 SHALL 保持可点击
- **AND** 若此时点击朗读,系统 SHALL 把 `settings.tts.provider` 回退为 `'edge'`、通过 toast 说明具体原因并提示已回退到 Edge TTS,且该次点击 SHALL NOT 播放音频:未关联 Provider 时提示"No Provider is linked to OpenAI TTS. Switched to Edge TTS.",未选择模型时提示"No OpenAI TTS model is selected. Switched to Edge TTS."(英文为 i18n key,按界面语言显示译文)

### Requirement: 每语言 voice 与全局参数

系统 SHALL 在 TTS provider 为 `'edge'` 或 `'system'` 时允许用户为每种语言独立配置 voice(`settings.tts.voices` 中的 `{ lang, voice }` 条目);未配置或 voice 为空时,Edge TTS SHALL 使用该语言的内置默认 voice,系统 TTS SHALL 使用匹配该语言的首个可用 voice。系统 SHALL 提供全局 `rate` 滑块(1–20,默认 10,朗读时按 `rate / 10` 作为倍速)与 `volume` 滑块(0–100,默认 100);变更后 SHALL 对后续朗读生效。`rate` 对三种 backend 均生效;`volume` 仅对 Edge TTS 与系统 TTS 生效。OpenAI TTS 不使用每语言 voice,改用 `settings.tts.openai.voice`。

#### Scenario: 为日语指定 voice

- **WHEN** 用户在设置页对 `ja` 语言选择某具体 voice
- **THEN** `settings.tts.voices` SHALL 含一条 `{ lang: 'ja', voice: <voiceURI> }`
- **AND** 后续日语 Edge TTS 或系统 TTS 朗读 SHALL 使用该 voice

#### Scenario: 调整音量

- **WHEN** 用户把音量从 100 调到 50,TTS provider 为 `'edge'` 或 `'system'`
- **THEN** 下一次朗读 SHALL 以 50% 音量播放
- **AND** 已经在播放的当次朗读不要求实时跟随

#### Scenario: OpenAI TTS 隐藏每语言 voice 配置

- **WHEN** TTS provider 为 `'openai'`
- **THEN** 设置页 SHALL 显示 OpenAI TTS 配置区而非每语言 voice 列表

### Requirement: Edge TTS 错误回退

系统 SHALL 在 Edge TTS 请求失败(网络错误、上游错误、无音频或解析失败)时让朗读调用以错误结束:通过 toast 显示错误信息(以 `Edge TTS:` 开头,上游错误未带该前缀时 SHALL 补上)、调用 `onFinish`、把错误写入控制台,并使朗读按钮恢复到非播放状态。浏览器扩展、用户脚本与桌面端 SHALL 采用同一路径。系统 SHALL NOT 在 Edge TTS 失败时自动切换到 system TTS 或其它 provider。用户已停止该次朗读(中止信号已触发)后才到达的失败 SHALL 静默结束,SHALL NOT 显示 toast。

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

### Requirement: TTS 与已删除功能解耦

TTS 模块对外暴露的 API MUST NOT 引用 `Vocabulary`、`Action`、`writingTargetLanguage` 等已删除概念;TTS 的调用入口 SHALL 仅来自朗读按钮组件。

#### Scenario: TTS 入口仅来自翻译界面与设置页试听

- **WHEN** 在 `src/common/tts/` 之外检索 `doSpeak(` / `SpeakerIcon` 的调用方
- **THEN** 合法调用方 SHALL 仅为 `SpeakerIcon` 本身、`Translator.tsx`(源文本与译文朗读按钮)与 `Settings.tsx`(voice 试听按钮)
- **AND** SHALL NOT 存在来自已删除模块的调用

### Requirement: OpenAI TTS 复用 Provider 凭据

系统 SHALL 在 `settings.tts.provider === 'openai'` 时,通过 `settings.tts.openai.providerId` 引用一份既有 ProviderConfig,从该条目读取 `endpoint`、`apiKey`、`extraHeaders` 用于 TTS 请求。系统 MUST NOT 在 TTS 设置中存储 endpoint 或 apiKey。引用的 Provider 不存在或其 `protocol === 'anthropic'` 时视为失效引用。

#### Scenario: 引用已有 Provider 完成朗读

- **WHEN** `settings.providers` 含一条 id 为 `p1` 的 `protocol === 'openai-chat'` 配置(endpoint `https://api.openai.com/v1`,apiKey `sk-xxx`)
- **AND** `settings.tts` 为 `{ provider: 'openai', openai: { providerId: 'p1', model: 'tts-1', voice: 'alloy' } }`
- **AND** 用户点击译文朗读按钮,文本为 `Hello`
- **THEN** 系统 SHALL 发起 `POST https://api.openai.com/v1/audio/speech`,鉴权 `Authorization: Bearer sk-xxx`,并附加该 Provider 的 `extraHeaders`
- **AND** 请求体 SHALL 包含 `{ model: 'tts-1', voice: 'alloy', input: 'Hello', response_format: 'mp3', speed: <由 rate 映射> }`
- **AND** 响应音频 SHALL 通过 `Audio` 元素播放

#### Scenario: 仅允许引用 OpenAI 系 Provider

- **WHEN** 用户在 OpenAI TTS 设置中打开"关联 Provider"下拉
- **THEN** 下拉列表 SHALL 仅包含 `protocol === 'openai-chat'` 或 `protocol === 'openai-responses'` 的条目
- **AND** `protocol === 'anthropic'` 的条目 SHALL NOT 出现

#### Scenario: 引用的 Provider 已被删除

- **WHEN** 用户先把 TTS 设为 `openai` + `providerId: 'p1'`,随后在 Providers 列表中删除 `p1`
- **THEN** 读取 settings 时 SHALL 把 `settings.tts.provider` 规范化为 `'edge'`
- **AND** 保存一份 `tts.provider === 'openai'` 但引用失效的设置时,系统 SHALL 以 `'edge'` 保存并通过 toast 提示"The Provider linked to OpenAI TTS was deleted. Switched to Edge TTS."(i18n key;若该 Provider 仍存在但使用 Anthropic 协议,则提示下方 Anthropic 场景的文案)
- **AND** 以 OpenAI TTS 朗读时若引用的 Provider 不存在,系统 SHALL 把 provider 回退为 `'edge'` 并通过 toast 给出同一提示

#### Scenario: 引用的 Provider 使用 Anthropic 协议

- **WHEN** `settings.tts.openai.providerId` 指向一条 `protocol === 'anthropic'` 的 ProviderConfig,用户以 OpenAI TTS 朗读
- **THEN** 系统 SHALL 把 `settings.tts.provider` 回退为 `'edge'`
- **AND** toast SHALL 提示"The Provider linked to OpenAI TTS uses the Anthropic protocol, which does not support speech. Switched to Edge TTS."(i18n key)
- **AND** SHALL NOT 提示 Provider 已被删除

#### Scenario: 自定义 Endpoint 接入第三方

- **WHEN** 用户引用的 ProviderConfig 的 `endpoint` 指向某第三方 OpenAI 兼容供应商
- **THEN** TTS 请求 SHALL 发往该 endpoint 的 `/audio/speech` 子路径
- **AND** 路径归一化 SHALL 使用 `openai-api-path` 中的 `normalizeAPIEndpoint` 规则(已含版本段时不重复拼接 `/v1`,已以 `/audio/speech` 等已知后缀结尾时不重复拼接)

### Requirement: OpenAI TTS 模型选择与发现

系统 SHALL 在 OpenAI TTS 设置中提供可手填的"TTS 模型"选择框与"刷新"按钮。刷新时 SHALL 通过所引用 Provider 的 engine `listModels()` 拉取模型,经 `filterTTSModels` 白名单过滤后按模型名排序作为候选。白名单 SHALL 仅匹配 `tts-1`、`tts-1-hd`、`gpt-4o-mini-tts` 与 `gpt-4o-mini-tts-YYYY-MM-DD` 同系列 snapshot(大小写不敏感),SHALL NOT 匹配 `gpt-4o-tts`。刷新得到候选且当前未选模型时,系统 SHALL 自动选中第一个候选。

#### Scenario: 白名单过滤

- **WHEN** 拉取得到 `['gpt-4o', 'gpt-4o-mini', 'tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15', 'gpt-4o-tts', 'whisper-1', 'text-embedding-3-small']`
- **THEN** `filterTTSModels` SHALL 返回 `['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15']`(顺序与原列表一致)

#### Scenario: 第三方 Provider 不暴露 TTS 模型

- **WHEN** 用户引用的 Provider 的模型列表过滤后为空
- **THEN** 系统 SHALL 通过 toast 提示"No TTS model was found for this Provider. You can enter a model manually."(i18n key)
- **AND** 用户 SHALL 仍能手填模型名并保存

#### Scenario: 模型列表拉取失败

- **WHEN** 刷新 TTS 模型时 `listModels()` 抛出错误
- **THEN** 系统 SHALL 通过 toast 提示"Unable to fetch TTS model list. Please enter the model name manually."(i18n key)

#### Scenario: 模型未填

- **WHEN** 用户把 TTS 切到 `openai` 但未填模型
- **THEN** 设置页 SHALL 显示内联错误"请选择关联的 LLM Provider 与 TTS 模型。",但不阻止保存
- **AND** 以 OpenAI TTS 朗读时 SHALL 按"OpenAI TTS 未完成关联配置"场景回退到 Edge TTS,toast SHALL 提示未选择模型而非 Provider 已被删除

### Requirement: OpenAI TTS Voice 与音频格式

系统 SHALL 提供可手填的 voice 选择框,内置选项按所选模型由 `getOpenAITTSVoices(model)` 给出:`tts-1`、`tts-1-hd`(大小写不敏感)仅为 `alloy / ash / coral / echo / fable / onyx / nova / sage / shimmer`;`gpt-4o-mini-tts` 系列及其它模型名为上述 9 个加 `ballad / verse / marin / cedar`。voice 未设置时 SHALL 默认 `alloy`,朗读请求 SHALL 发送 `voice: 'alloy'`。用户键入的值以 `voice_` 开头时 SHALL 以 `{ id: <值> }` 形式存储并原样发送(OpenAI custom voice 引用),其它值 SHALL 以字符串存储并原样发送。系统 SHALL 提供音频格式选择,默认 `'mp3'`,可选 `'opus' / 'aac' / 'flac' / 'wav' / 'pcm'`,并作为 `response_format` 发送。

#### Scenario: tts-1 不提供新版 voice

- **WHEN** 用户选择的 OpenAI TTS 模型为 `tts-1` 或 `tts-1-hd`
- **THEN** voice 内置选项 SHALL NOT 包含 `ballad`、`verse`、`marin`、`cedar`

#### Scenario: voice 未设置

- **WHEN** `settings.tts.openai.voice` 为空,用户以 OpenAI TTS 朗读
- **THEN** 请求体 SHALL 含 `voice: 'alloy'`

#### Scenario: 切换 voice 立即生效

- **WHEN** 用户把 voice 从 `alloy` 改为 `nova` 后保存
- **THEN** 下一次 OpenAI TTS 请求 SHALL 在请求体中传 `voice: 'nova'`

#### Scenario: 自定义 voice 名

- **WHEN** 用户键入下拉中不存在的 voice 名 `custom-voice-x` 并保存
- **THEN** 系统 SHALL 接受该值并在请求体中以字符串原样传递

#### Scenario: 自定义 voice id 对象

- **WHEN** 用户键入 OpenAI custom voice id `voice_1234`
- **THEN** 系统 SHALL 以 `{ id: 'voice_1234' }` 形式存储
- **AND** 请求体 SHALL 传 `voice: { id: 'voice_1234' }`

#### Scenario: 默认音频格式

- **WHEN** 用户未修改音频格式
- **THEN** 请求体 SHALL 含 `response_format: 'mp3'`

### Requirement: OpenAI TTS 输入长度、语速与模型指令

对 OpenAI TTS,系统 SHALL 按模型确定单段输入上限:`gpt-4o-mini-tts` 与 `gpt-4o-mini-tts-YYYY-MM-DD` 为 1500 字符(该系列输入上限为 2000 token,按 CJK 约 1 字符 1 token 保守取值),`tts-1`、`tts-1-hd` 及其它模型为 4096 字符。若朗读文本超过该上限,系统 SHALL 优先按句末标点(`.!?。！？`)与换行拆分为多个不超过上限的片段,单个句子超过上限时 SHALL 按上限硬切;系统 SHALL 按顺序逐段请求并在上一段播放结束后播放下一段。系统 SHALL 把全局 `rate` 按 `rate / 10` 映射为 OpenAI `speed`,并 clamp 到 `0.25..4.0`。`settings.tts.openai.instructions` 为可选字段(设置页不提供输入控件);仅当其非空且模型匹配 `gpt-4o-mini-tts` 或 `gpt-4o-mini-tts-YYYY-MM-DD` 时 SHALL 发送 `instructions`,对 `tts-1`、`tts-1-hd` 及其它模型 MUST NOT 发送。

#### Scenario: 长文本分段合成

- **WHEN** 用户以 `tts-1` 模型朗读 9000 字符文本
- **THEN** 系统 SHALL 拆分为多个 `input.length <= 4096` 的请求
- **AND** SHALL 按原文顺序连续播放音频

#### Scenario: gpt-4o-mini-tts 按 token 上限分段

- **WHEN** 用户以 `gpt-4o-mini-tts` 模型朗读 4000 个汉字
- **THEN** 系统 SHALL 拆分为多个 `input.length <= 1500` 的请求

#### Scenario: rate 映射到 speed

- **WHEN** `settings.tts.rate` 映射后的倍速超出 `0.25..4.0`
- **THEN** OpenAI TTS 请求中的 `speed` SHALL 被限制在 `0.25..4.0`

#### Scenario: tts-1 不发送 instructions

- **WHEN** `settings.tts.openai.model === 'tts-1'` 且 settings 中存在 instructions
- **THEN** 请求体 SHALL NOT 包含 `instructions`

#### Scenario: gpt-4o-mini-tts 发送 instructions

- **WHEN** `settings.tts.openai.model === 'gpt-4o-mini-tts'` 且 instructions 为 `Speak clearly`
- **THEN** 请求体 SHALL 包含 `instructions: 'Speak clearly'`

### Requirement: OpenAI TTS 错误回退

系统 SHALL 在 OpenAI TTS 请求失败(网络错误、HTTP 4xx/5xx、请求超时、音频播放失败)时通过 toast 给出可读错误并使朗读按钮恢复非播放态,SHALL NOT 因请求失败自动切换到 Edge / system TTS。用户主动停止朗读(中止信号已触发)导致的请求中断 SHALL 静默结束,SHALL NOT 显示 toast;片段请求超时 SHALL 提示"OpenAI TTS request timed out. Please try again later."(i18n key)。按 HTTP 状态的提示文案(均为 i18n key)SHALL 为:401/403 → "OpenAI TTS authentication failed. Check the linked Provider in settings.";404 → "The OpenAI TTS endpoint does not implement /audio/speech. Check the linked Provider in settings.";其它 4xx → "The OpenAI TTS request was rejected. Check the linked Provider in settings.";5xx → "The OpenAI TTS service is temporarily unavailable. Please try again later.";音频播放失败 → "OpenAI TTS audio playback failed.";无法识别的失败 → "OpenAI TTS request failed."。OpenAI TTS 的所有用户可见提示 SHALL 通过 i18n key 输出,SHALL NOT 在代码中硬编码任一语言的文案。(配置缺失或引用失效时的回退见"OpenAI TTS 复用 Provider 凭据"。)

#### Scenario: 鉴权失败

- **WHEN** 引用 Provider 的 apiKey 无效,服务端返回 401
- **THEN** toast SHALL 提示"OpenAI TTS authentication failed. Check the linked Provider in settings."(i18n key)
- **AND** 朗读按钮 SHALL 恢复非播放态
- **AND** `settings.tts.provider` SHALL 保持 `'openai'`

#### Scenario: Endpoint 不支持 speech

- **WHEN** 服务端对 `/audio/speech` 返回 404
- **THEN** toast SHALL 提示"The OpenAI TTS endpoint does not implement /audio/speech. Check the linked Provider in settings."(i18n key)

#### Scenario: 请求进行中用户停止

- **WHEN** OpenAI TTS 片段请求尚未返回,用户点击停止
- **THEN** 系统 SHALL 中止该请求
- **AND** 系统 SHALL NOT 显示 toast
- **AND** 系统 SHALL NOT 播放音频

### Requirement: TTS 静默失败上限

系统 SHALL 对网络型 TTS 请求设置超时,超时后 SHALL 视为失败并按对应 backend 的错误路径处理:浏览器扩展与用户脚本中的 Edge TTS SHALL 对整次合成设置 15 秒超时;OpenAI TTS SHALL 对每个 `/audio/speech` 片段请求设置 15 秒超时。系统 TTS(`speechSynthesis`)不设超时。

#### Scenario: 朗读请求超时

- **WHEN** 浏览器扩展中的一次 Edge TTS 合成超过 15 秒未返回音频,或一次 OpenAI TTS 片段请求超过 15 秒未完成
- **THEN** 系统 SHALL 结束该请求并按对应 backend 的错误路径处理
- **AND** 按钮 SHALL 恢复到非播放状态
