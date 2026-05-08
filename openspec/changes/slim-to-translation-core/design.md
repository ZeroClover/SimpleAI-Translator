## Context

`nextai-translator` 起源于一个浏览器/桌面端的 LLM 翻译器,但在迭代过程中持续吸收了画词/生词本(Vocabulary)、OCR(Tesseract.js)、写作助手(Writing)、自定义动作(Action: Polishing/Summarize/Analyze/Explain-code)等衍生能力,以及近 20 个互不一致的 LLM Provider 引擎(`abstract-engine.ts` + 14+ 厂商专用文件)。这种横向膨胀带来了几个具体问题:

- `src/common/components/Translator.tsx` 单文件超过 2000 行,包含 OCR、写作、画词、Action 五种以上互相纠缠的代码路径,任何一处修改都需要 regression 全部场景。
- `src/common/translate.ts` 中 `TranslateMode` 已扩展为 `translate | polishing | summarize | analyze | explain-code | big-bang`,Provider 适配层需要为每个模式 + 每个厂商组合编写 prompt 与流式解析逻辑。
- 用户侧:`ISettings` 中已有 `apiKeys / apiURL / azureAPIKeys / miniMaxAPIKey / geminiAPIKey / moonshotAPIKey / deepSeekAPIKey ...` 等十余个互斥字段,只能配置每个厂商一份 key,无法同时挂多个 OpenAI 兼容供应商。
- 维护侧:每出一个新模型/厂商,都倾向于新增专门 engine 文件;但绝大多数厂商实际兼容 OpenAI Chat Completions 协议,这部分代码大量重复。

约束:
- 项目同时面向 Tauri 桌面端、Chromium/Firefox 浏览器扩展、Userscript、Safari Web Extension(`src-safari/`),所有平台共用 `src/common/`,因此核心改动必须在 `src/common/` 内部完成,且兼容浏览器/桌面两套 fetch 路径(`universal-fetch.ts`)。
- 设置存储在 `chrome.storage.local`(扩展)与 Tauri 文件存储中;本变更按新 App 处理,新 schema 首次启动从空 Provider 列表初始化,旧 schema 字段不迁移。
- Edge TTS 与系统 TTS 等"非 LLM"功能保留;Tauri 端的全局热键、剪贴板、悬浮窗口等保留(只去掉 OCR / 写作热键)。

利益相关者:仅维护者与终端用户;无外部 API 契约。

## Goals / Non-Goals

**Goals:**

- 把 `src/common/` 的代码体积与心智负担削减到只服务于"翻译 + 朗读 + 语言检测 + LLM 调用"。
- LLM 调用层只保留 3 种 Provider 协议形态(`openai-chat` / `openai-responses` / `anthropic`)的实现,所有其它"厂商"通过自定义 Endpoint + 协议类型组合实现。
- 用户可为每种协议添加任意份配置(命名 + Endpoint + Key + 模型),并选择默认配置;UI 与存储均原生支持多份配置。
- 按新 App 重写设置 schema,不保留旧 Provider 字段、旧 Provider 映射或 Azure 专用路径。
- 删除已移除功能的所有死代码、依赖、i18n、热键与测试,仓库不留 `// removed` 注释或 `_unused` 标记。

**Non-Goals:**

- 不重新设计翻译 prompt 的目标内容;本变更只把请求与流式解析收敛到三类保留协议。
- 不引入新的 UI 框架或状态管理库(继续使用 baseui + 现有 store)。
- 不实现"自动健康检查 / 自动 fallback"等多供应商高级能力 —— 仅实现"可配置多份 + 选择当前用哪份"。
- 不保留与画词、OCR、写作、Polishing/Summarize/Analyze/Explain-code 相关的兼容入口或迁移其历史数据(IndexedDB 中的生词本会被丢弃,文档中明确告知)。
- 不迁移旧 Provider 配置,包括 OpenAI、Claude、Azure、ChatGPT Web、Kimi、ChatGLM 或任何未识别 Provider;旧字段在新 schema 写回时清理或忽略。
- 不保留远程 Promotion / 推广 / 公告 / API Key 提示位系统;它不属于翻译核心能力。
- 不重写 Edge TTS、系统 TTS、语言检测、i18n、热键框架的保留能力;仅新增 OpenAI TTS,并删除已废弃功能相关入口。

## Decisions

### Decision 1:Provider 抽象按"协议形态"建模,而不是按"厂商"

引入新文件结构:

```
src/common/engines/
  index.ts                      # getEngine(providerConfig): IEngine
  interfaces.ts                 # IEngine, ProviderProtocol, ProviderConfig
  protocols/
    openai-chat.ts              # 实现 OpenAI Chat Completions 协议(SSE 流)
    openai-responses.ts         # 实现 OpenAI Responses API(/v1/responses)
    anthropic.ts                # 实现 Anthropic Messages API(SSE)
```

`ProviderConfig` 定义:

```ts
type ProviderProtocol = 'openai-chat' | 'openai-responses' | 'anthropic'

interface ProviderConfig {
  id: string                    // uuid,稳定标识
  name: string                  // 用户可读名,如 "OpenAI 官方"、"自定义兼容服务"
  protocol: ProviderProtocol
  apiKey: string
  endpoint?: string             // 缺省走协议默认官方 endpoint
  model: string                 // 必填,具体模型名
  // 可选高级:
  extraHeaders?: Record<string, string>
}
```

**Rationale**:本 App 只维护协议实现,不维护厂商目录。OpenAI Chat Completions 与 OpenAI Responses 覆盖 OpenAI 官方及用户自定义的同协议兼容服务;Anthropic Messages 需独立协议。Azure、Gemini、DeepSeek、Moonshot、Groq、Ollama 等不再作为 App 内置 endpoint、模板、engine 或迁移目标出现。按协议建模消除了 N×M 的实现矩阵,也避免继续扩张厂商适配代码。

**Alternatives Considered**:

- 保留按厂商抽象,只删除部分文件 —— 拒绝,理由是用户痛点之一就是无法为同一厂商挂多份 Key,且按厂商抽象的代码重复仍存在。
- 引入插件化 Provider 系统,允许第三方 npm 包贡献协议 —— 拒绝,过度设计,本变更目标是精简而非加层。

### Decision 2:`ISettings` 中以 `providers: ProviderConfig[]` 替代散落字段

新 schema(节选):

```ts
interface ISettings {
  providers: ProviderConfig[]
  defaultProviderId: string | null   // 默认翻译用的 provider
  // ...保留:tts, languageDetectionEngine, hotkey, displayWindowHotkey,
  //        defaultTargetLanguage, themeType, i18n, proxy, runAtStartup,
  //        restorePreviousPosition, allowUsingClipboardWhenSelectedTextNotAvailable,
  //        autoTranslate, alwaysShowIcons, autoHideWindowWhenOutOfFocus,
  //        hideTheIconInTheDock, automaticCheckForUpdates, ...
  // 删除:apiKeys, apiURL, apiURLPath, apiModel, provider,
  //       chatgptModel, azure*, miniMax*, gemini*, moonshot*, deepSeek*,
  //       writingTargetLanguage, writingHotkey, writingNewlineHotkey,
  //       ocrHotkey, autoCollect, defaultTranslateMode(收敛为常量 'translate'),
  //       customModelName(并入 ProviderConfig.model)
}
```

**Rationale**:数组结构原生支持多份配置;`defaultProviderId` 字符串化避免数组下标随增删变化;UI 以列表 + 表单管理。

### Decision 3:新 App schema —— 不迁移旧 Provider,旧字段直接删除/忽略

`getSettings()` 与设置写回逻辑只认识新 schema:

- 首次安装或 raw settings 缺失时,初始化 `providers: []` 与 `defaultProviderId: null`。
- 若 raw settings 含旧字段(`apiKeys`、`apiURL`、`provider`、`azureAPIKeys`、`chatgptModel`、`kimi*`、`chatglm*` 等)但不含新 `providers`,系统 SHALL 不创建任何 ProviderConfig。
- 下一次写回 settings 时只写新 schema 字段;旧字段从持久化数据中清理,或在读取层被忽略。
- Azure 不做特殊处理:不迁移 `azureAPIKeys` / `azureAPIURL` / `azureAPIModel`,不保留 `api-key` header 逻辑,不提供 Azure 模板或 endpoint。
- 未识别 Provider 不保留、不兜底为 `openai-chat`,也不要求展示迁移 warning。

**Rationale**:该变更定位为新 App,不是兼容升级。保留旧字段或旧 Provider 映射会把被删除的厂商概念继续留在数据层、UI 与测试中,削弱"只保留三类协议"的目标。

**Risk → Mitigation**:首次启动无 Provider 时主翻译按钮禁用,设置页提供添加 Provider 的引导;release notes 明确说明旧配置不会迁移。

### Decision 4:`TranslateMode` 收敛为常量 `'translate'`,而非保留 enum

直接删除 `TranslateMode` 类型与所有 `mode === 'polishing'` / `'summarize'` / `'analyze'` / `'explain-code'` / `'big-bang'` 分支。`translate.ts` 主入口签名简化为 `translate(query: TranslateQuery)`,`TranslateQuery` 不再含 `mode` 字段,也不再含 `articlePrompt`、`writing`、`selectedWord`(`selectedWord` 单独保留用于"单词模式"展示,见 Decision 5)。

**Rationale**:把"模式"概念彻底从公共类型中拿掉,避免后续被反复重新引入;调用方就一种用法。

### Decision 5:保留"单词模式"作为翻译核心能力的子分支

`isAWord(langCode, text)` 检测保留 —— 当输入为单字/单词时,翻译结果包含发音、释义、例句等富信息(prompt 已支持)。这属于"翻译"能力的自然延伸,不属于被删除的画词/生词本。生词本 UI(收藏成卡片、复习等)仍删除。

### Decision 6:依赖清理清单(明确版本)

- 删除:`tesseract.js`(OCR 唯一用途)、`@react-pdf-viewer/*`(若仅用于 OCR 结果展示,核查)、`react-icons` 中仅 IconPicker 使用的图标集(核查)。
- 保留:`baseui`、`styletron-*`、`@floating-ui/dom`、`@tauri-apps/*`、`uuid`、`common-tags`、TTS 相关(`@aws-sdk` 不存在则忽略)、`@sentry/react`、`@aptabase/tauri`。
- 重新评估:`react-hotkeys-hook`(用于全局热键,保留)、`tinykeys`(若有,按需保留)。

实现时通过 `pnpm why <pkg>` 与 `grep` 双重确认后再删依赖。

### Decision 7:Action / ActionManager 系统整体移除

`src/common/internal-services/action.ts` + `src/common/services/action.ts` + `ActionManager.tsx` + `ActionForm.tsx` + `IconPicker.tsx`(若仅 Action 用)整体删除。`builtinActionModes`(constants.ts)整体删除。`db.ts` 中 `Action` 表删除;若 `HistoryItem` 引用了 `actionName` 字段,改为存储 `providerId` + `model` 即可。

**Rationale**:Action 系统的存在意义就是让用户挂多种 prompt(润色/总结/解释代码…),这正是被本次精简删除的能力。

### Decision 8:模型列表通过 API 动态发现 + 黑名单式过滤

`ProviderConfig.model` 字段保留为字符串,但 UI 中输入控件升级为带"刷新"按钮的 Combobox:

- 用户填好 `endpoint` + `apiKey` 后点击"刷新模型",前端按协议调用:
  - `openai-chat` / `openai-responses` → `GET {endpoint}/models`,鉴权 `Authorization: Bearer <apiKey>`,解析 OpenAI 官方模型列表响应中的 `data[].id`。
  - `anthropic` → `GET {endpoint}/v1/models`,鉴权 `x-api-key: <apiKey>` + `anthropic-version: 2023-06-01`,解析 Anthropic 模型列表响应中的 `data[].id`。
- 拿到 `data: [{ id, ... }]` 后,在前端用 `filterChatModels(ids)` 过滤掉与对话/翻译无关的模型,然后渲染到下拉。
- Combobox 同时允许手填:若拉取失败、第三方供应商未实现 `/models`、或用户想用过滤后看不到的内部别名,直接键入字符串保存即可。

`filterChatModels` 采用**黑名单**而非白名单(避免漏掉新模型):

```ts
const CHAT_BLOCKLIST: RegExp[] = [
  /(^|[-/])(text-)?embedding($|[-/])/i,        // text-embedding-3-small, *-embedding-*
  /(^|[-/])realtime($|-)/i,                     // gpt-realtime, gpt-4o-realtime-preview
  /(^|[-/])audio($|-)/i,                        // gpt-audio, gpt-4o-audio-preview
  /^whisper(-|$)/i,                             // whisper-1
  /(^|[-/])transcribe($|-)/i,                   // gpt-4o-transcribe
  /(^|[-/])moderation($|-)/i,                   // omni-moderation-latest, text-moderation-*
  /^tts(-|$)/i,                                 // tts-1, tts-1-hd
  /-tts($|-)/i,                                 // gpt-4o-mini-tts
  /^dall-e/i,                                   // dall-e-2, dall-e-3
  /^gpt-image/i,                                // gpt-image-1
  /(^|[-/])sora($|-)/i,                         // video generation
  /-search-(preview|api)/i,                     // 专用搜索模型
  /(^|-)image($|-)/i,                           // *-image-*
]
```

`filterTTSModels` 反之采用**白名单**(集合明确):

```ts
const TTS_ALLOWLIST: RegExp[] = [
  /^tts-1(-hd)?$/i,
  /^gpt-4o-mini-tts(?:-[0-9]{4}-[0-9]{2}-[0-9]{2})?$/i,
]
```

**Rationale**:

- 用 API 拉模型避免了维护一份硬编码模型枚举(模型迭代极快);
- 黑名单形态在新厂商发布新对话模型时自动可用,白名单形态用于 TTS 这类集合稳定的场景;
- 仍允许手填,保证自托管 / 私有部署 / 内部代号等场景不被拒。

**Alternatives Considered**:

- 维护硬编码 `openaiModels.ts` —— 拒绝,长期维护成本过高,且无法照顾第三方兼容供应商。
- 让用户自己从厂商 dashboard 复制模型 id —— 拒绝,体验差;但作为 Combobox 兜底输入仍存在。

**Risk → Mitigation**:第三方 `/models` 端点缺失或返回格式不兼容 → UI 在拉取失败时降级为纯输入框,并展示错误 toast;不阻塞用户保存。

### Decision 9:OpenAI TTS backend 复用 ProviderConfig

`TTSProvider` 联合扩展为 `'edge' | 'system' | 'openai'`。`settings.tts` 扩展:

```ts
interface TTSSettings {
  provider?: TTSProvider                  // 'edge' | 'system' | 'openai'
  voices?: { lang: LangCode; voice: string }[]
  volume?: number
  rate?: number
  openai?: {
    providerId: string                    // 引用 settings.providers[i].id
    model: string                          // 'tts-1' | 'tts-1-hd' | 'gpt-4o-mini-tts' | 同系列 snapshot | 自定义
    voice: string | { id: string }          // built-in voice 或 OpenAI custom voice id
    format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'  // 默认 'mp3'
    instructions?: string                   // 仅对 gpt-4o-mini-tts 同系列模型开放;tts-1/tts-1-hd 不发送
  }
}
```

**Rationale**:

- 不让用户重复填一份 endpoint + apiKey,直接选已有 Provider 即可;
- 仅允许引用 `protocol === 'openai-chat' | 'openai-responses'` 的条目(它们的 `/audio/speech` 端点共享同一鉴权);Anthropic 条目在下拉中被禁用并提示"OpenAI TTS 不可使用 Anthropic 凭据"。
- TTS 模型也走 `listModels` 拉取并经 `filterTTSModels` 白名单过滤,选择面收敛到 `tts-1` / `tts-1-hd` / `gpt-4o-mini-tts` / `gpt-4o-mini-tts-YYYY-MM-DD`。
- 内置 voice 列表按 OpenAI 官方 speech API 保持为 `alloy / ash / ballad / coral / echo / fable / onyx / nova / sage / shimmer / verse / marin / cedar`,并允许自定义 voice 字符串或 `{ id }` 引用。

**调用契约**:`POST {endpoint}/audio/speech`,请求体 `{ model, voice, input, response_format, speed?, instructions? }`,返回二进制音频流。OpenAI 官方要求单次 `input` 最长 4096 字符;长文本应按句子/段落拆分为 <=4096 字符片段顺序请求并连续播放。`rate` 映射为官方 `speed` 时 clamp 到 `0.25..4.0`。前端 `openai-tts.ts` 解 stream 为 `Blob` 后用 `HTMLAudioElement` 播放。

**Risk → Mitigation**:

- 第三方 OpenAI 兼容供应商可能不实现 `/audio/speech` → 拉取模型时白名单为空 → UI 提示"该 Provider 凭据下未找到 TTS 模型,请改用 Edge / System 或更换 Provider"。
- 引用的 Provider 被删除 → `settings.tts.openai.providerId` 失效 → 下次保存设置或下次朗读时,系统检测到 dangling 引用,自动把 TTS provider 回退到 `'edge'` 并 toast 提示。

**Alternatives Considered**:把 TTS 也建模成 `TTSProviderConfig[]` 列表 —— 拒绝,过度设计;TTS 选型相对稳定,单选即可。

### Decision 10:浏览器扩展权限改为最小固定权限 + 自定义 endpoint 运行时授权

当前 `src/browser-extension/manifest.ts` 固定声明大量旧 Provider host permissions,并在 background 里用 `webRequest` 捕获 ChatGPT Arkose、Kimi、ChatGLM token。新 App SHALL:

- 从 `permissions` 删除 `webRequest`,删除所有 token-capture listener 与相关 storage key。
- 从固定 `host_permissions` 删除 Azure、ChatGPT Web、Kimi、ChatGLM、Moonshot、DeepSeek、Cohere、MiniMax 等旧厂商域名。
- 固定 host permissions 仅保留保留功能必须访问的官方域名,例如 OpenAI、Anthropic、Edge TTS、Sentry/analytics(若仍保留遥测)、语言检测远端域名(若保留远端检测)。
- 对用户输入的自定义 endpoint,在浏览器扩展中先检查是否已有 origin permission;没有时在用户点击"刷新模型"/"保存并测试"等明确手势内调用 `permissions.request({ origins: [origin + '/*'] })`。
- Chrome MV3 SHALL 在 manifest 中声明 `optional_host_permissions`,使用 `https://*/*` 与必要的 `http://*/*` 覆盖运行时发现的 endpoint;Firefox/Safari 若 API 行为不同,实现层提供等价能力或在 UI 中说明当前平台不支持该 endpoint。

**Rationale**:自定义 endpoint 与固定厂商 host permissions 是互斥的产品模型。保留旧 host 列表会继续泄漏已删除 Provider 的存在,而运行时授权能让扩展只在用户实际使用某个 origin 时请求权限。

### Decision 11:Tauri / Rust 删除范围与前端窗口映射同步收敛

删除 OCR / 写作 / Action 时必须跨 Rust、Tauri 前端与 capability 同步清理:

- Rust:删除 `src-tauri/src/ocr.rs`、`src-tauri/src/writing.rs`;从 `main.rs` 移除 `mod ocr` / `mod writing`、invoke handlers、`cut_image` / `screenshot` / `start_ocr` / `finish_ocr` / `writing_command` / `finish_writing` / `write_to_input` 等命令;从 `tray.rs` 移除 OCR 菜单;从 `windows.rs` 移除 `ACTION_MANAGER_WIN_NAME`、`SCREENSHOT_WIN_NAME` 与对应 show/get 函数。
- 前端:删除 `src/tauri/windows/ActionManagerWindow.tsx`、`ScreenshotWindow.tsx`;从 `src/tauri/App.tsx` window map、`bindings.ts`、`utils.ts`、`TranslatorWindow.tsx` 移除 action_manager / screenshot / OCR / writing 入口。
- 配置与资源:从 `src-tauri/capabilities/migrated.json` 删除 `action_manager` / `screenshot`;删除 `src-tauri/resources/bin/ocr_apple` 与 `ocr_intel`;从 `Cargo.toml` 移除仅用于 OCR/写作的 `screenshots`、`image`、`text-diff`、`similar` 等依赖(若 grep 证明无其它用途)。

**Rationale**:仅删除 React 入口会留下可调用的 native 命令与额外二进制资源,既不符合精简目标,也扩大了桌面端攻击面。

### Decision 12:历史记录(History)保留但简化

`TranslationHistory.tsx` + `internal-services/history.ts` + `services/history.ts` 保留;`HistoryItem` schema 简化:

```ts
interface HistoryItem {
  id: string
  createdAt: number
  fromLang: LangCode
  toLang: LangCode
  sourceText: string
  translatedText: string
  providerId: string   // 引用当时使用的 provider 配置
  model: string
}
```

旧 history 数据不迁移(IndexedDB 表 drop & recreate);release notes 中说明。

### Decision 13:Promotion 远程提示位系统完全移除

当前 `src/common/services/promotion.ts` 会从 `https://raw.githubusercontent.com/nextai-translator/nextai-translator-configs/main/promotions.json` 拉取远程配置,并在 `Translator.tsx` 与 `Settings.tsx` 中显示 OpenAI API Key 相关提示、设置页顶部 banner、未读提示点、disclaimer 弹窗和配置文档链接。新 App SHALL 完全删除该系统:

- 删除 `src/common/services/promotion.ts`。
- 删除 `src/common/hooks/usePromotionShowed.ts`、`usePromotionNeverDisplay.ts`,并从全局 state 中删除 `promotionShowedMap` / `promotionNeverDisplayMap`。
- 从 `Translator.tsx` 删除 promotion SWR 拉取、定时刷新、focus 刷新、设置入口提示点、`headerPromotionID` / `openaiAPIKeyPromotionID` 传递。
- 从 `Settings.tsx` 删除 header promotion、OpenAI API Key promotion、disclaimer promotion modal、`promotion_view` / `promotion_clicked` / `promotion_disclaimer_view` 统计事件。
- 从浏览器扩展删除 `optionsPageOpenaiAPIKeyPromotionIDKey` / `optionsPageHeaderPromotionIDKey` 及 background `openOptionsPage` 中的 promotion id storage 传递。
- 删除所有 promotion 相关 i18n、样式、测试和存储 key;新 App 不再请求远程 promotions JSON。

**Rationale**:Promotion 是远程可变内容展示系统,与"翻译 + 朗读 + 语言检测 + LLM API"无关,且现有实现强绑定旧 OpenAI 单 Provider 设置页。完全删除可以减少远程配置依赖、设置页复杂度与额外状态。

## Official References Folded Into This Design

- OpenAI Models API: `GET /v1/models`,响应按 `data[].id` 提取模型 id。
- OpenAI Chat Completions API: `POST /v1/chat/completions`,`stream: true` 时按 SSE `choices[].delta.content` 与 `[DONE]` 解析。
- OpenAI Responses API: `POST /v1/responses`,`stream: true` 时按 Responses streaming events 解析 `response.output_text.delta`、`response.completed` 与错误事件。
- OpenAI Speech API: `POST /v1/audio/speech`,模型集合为 `tts-1`、`tts-1-hd`、`gpt-4o-mini-tts` 与同系列 snapshot;built-in voices、`response_format`、`speed`、`instructions` 与 4096 字符输入限制按官方 speech reference 实现。
- Anthropic Models API: `GET /v1/models`,要求 `x-api-key` 与 `anthropic-version: 2023-06-01`,响应按 `data[].id` 提取模型 id。
- Anthropic Messages streaming:按 SSE `content_block_delta` / `message_stop` / `error` 等事件解析,未知事件需安全忽略。
- Chrome Extensions Permissions API:自定义 endpoint origin 使用 `optional_host_permissions` 与 `permissions.request()` 在用户手势内申请。

## Risks / Trade-offs

- **[Risk] 用户依赖被删功能** → Mitigation:在 release notes 与 README 中清楚列出移除项与替代方案(润色/总结等都可在外部 ChatGPT/Claude 客户端中完成,本工具回归翻译单职责);保留旧版本 git tag 供需要的用户自行 build。
- **[Risk] 用户打开新版本后没有可用 Provider** → Mitigation:这是有意的 BREAKING 行为;主界面禁用翻译并直达 Provider 设置表单,release notes 明确"不迁移旧 Provider,包括 Azure"。
- **[Risk] `Translator.tsx` 大文件重构出 regression** → Mitigation:分阶段重构 —— 先在保持外部行为的前提下抽出 OCR / 写作 / Action 模块到独立 hooks,然后整体删除这些模块文件;每一步配合现有 `__tests__` 验证。
- **[Risk] 第三方供应商 endpoint 路径差异(`/v1/chat/completions` vs 自带 `/chat/completions`)** → Mitigation:沿用现有 `openai-api-path.ts` 的归一化逻辑;`ProviderConfig.endpoint` 接受 base URL,内部 join `/chat/completions` 等子路径;为 Responses API 与 Anthropic 各写归一化单测。
- **[Risk] OpenAI Responses 与 Chat Completions 在流式格式上的差异** → Mitigation:两个独立 protocol 文件分别实现,不强行复用;通过 `IEngine` 接口对外统一为 `streamTranslate(query)`。
- **[Trade-off] 失去"开箱即用"的 Gemini/MiniMax/Azure/DeepSeek 等专属界面** → 用户需自行填 endpoint;本变更不提供厂商模板,避免把被删除的厂商目录换一种形式保留下来。

## Rollout Plan

1. **第 0 步**:在 main 分支打 tag `v-pre-slim` 留作源码回退基线。
2. **第 1 步(类型 + 新 schema)**:在 `src/common/types.ts` 新增 `ProviderConfig` / `ProviderProtocol`,重写 `ISettings` 为新结构,删除旧 Provider 字段类型定义;`getSettings` 缺省返回 `providers: []` 与 `defaultProviderId: null`。
3. **第 2 步(新 protocol 引擎)**:新增 `engines/protocols/openai-chat.ts`、`openai-responses.ts`、`anthropic.ts` 与新的 `getEngine(providerConfig)` 入口;每个协议实现统一 `IEngine.streamTranslate(query)` + `IEngine.listModels()`;新增 `engines/model-filter.ts` 暴露 `filterChatModels` / `filterTTSModels`。
4. **第 3 步(`translate.ts` 调用切换)**:`translate.ts` 内部改用新 `getEngine(providerConfig)`,通过 `defaultProviderId` 取配置;同时移除 `TranslateMode` 非 translate 分支与 `big-bang` 重载。
5. **第 4 步(UI 切换)**:`Settings.tsx` 替换为 Provider 列表 UI;Provider 表单"模型"字段实现为带"刷新"按钮的 Combobox(调用 `listModels` + `filterChatModels`,失败时降级为纯文本输入);`Translator.tsx` 替换 provider 选择控件为下拉(列出 `providers` 中所有条目)。不提供 DeepSeek/Moonshot/Azure 等厂商模板。新增 OpenAI TTS 设置区域:Provider 引用下拉 + 模型 Combobox(`filterTTSModels` 白名单)+ voice/format/speed 选择。
6. **第 5 步(平台权限与 fetch)**:浏览器扩展移除 `webRequest` 与旧固定 host permissions,只保留官方 OpenAI/Anthropic/Edge TTS 等必要 host,并为自定义 endpoint 实现 optional host permission 请求;Tauri 与 userscript 走各自 fetch 能力。
7. **第 6 步(功能删除)**:删除 OCR / 写作 / 画词 / Action 相关文件、组件、hooks、热键、依赖、i18n 键、测试,并同步删除 Tauri Rust 命令、窗口、capabilities 与 OCR 二进制资源。
8. **第 7 步(旧 provider engines 删除)**:删除 `engines/{azure,cerebras,chatglm,chatgpt,claude,cohere,deepseek,gemini,groq,kimi,minimax,moonshot,ollama,openai}.ts` 与旧 `getEngine` 入口;`abstract-openai.ts` 重写为 `protocols/openai-chat.ts`(或就地改名 + 简化)。
9. **第 8 步(清理 + 文档)**:`pnpm prune`-style 检查未引用代码;更新 README、CHANGELOG;e2e 测试(`e2e/`)删/改对应用例。
10. **第 9 步(发布)**:major 版本号 +1;release notes 明确 BREAKING 项、删除项、无旧 Provider 迁移、以及源码回退 tag。

**Rollback**:本变更为 BREAKING 且涉及 schema 删字段,不提供运行时回滚;仅支持版本回退(切回 `v-pre-slim` tag)。

## Open Questions

- 是否提供"导入/导出 providers JSON"功能以便多设备同步?当前倾向于不做(超出本次范围),记录为后续 follow-up。
