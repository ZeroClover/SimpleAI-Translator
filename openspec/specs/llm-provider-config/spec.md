# llm-provider-config Specification

## Purpose

TBD - created by archiving change slim-to-translation-core. Update Purpose after archive.

## Requirements

### Requirement: 支持的 Provider 协议集合

系统 SHALL 仅支持三种 LLM Provider 协议形态,以 `ProviderProtocol` 枚举表示:`'openai-chat'`、`'openai-responses'`、`'anthropic'`。系统 MUST NOT 提供其它专属协议(Azure / Gemini / MiniMax / DeepSeek / Moonshot / ChatGLM / Cohere / Groq / Cerebras / Kimi / Ollama / ChatGPT 网页版 等)的独立适配代码。

#### Scenario: 协议枚举完整且封闭

-   **WHEN** 任意代码处通过 TypeScript 引用 `ProviderProtocol`
-   **THEN** 该联合类型 SHALL 恰好为 `'openai-chat' | 'openai-responses' | 'anthropic'`,不多不少

#### Scenario: 不存在厂商专属 engine 文件

-   **WHEN** 在 `src/common/engines/` 下查找
-   **THEN** SHALL NOT 存在 `azure.ts` / `gemini.ts` / `minimax.ts` / `deepseek.ts` / `moonshot.ts` / `chatglm.ts` / `cohere.ts` / `groq.ts` / `cerebras.ts` / `kimi.ts` / `ollama.ts` / `chatgpt.ts` 等厂商专属文件

#### Scenario: Azure 不作为特殊协议或特殊 endpoint

-   **WHEN** 用户查看 Provider 协议、设置 UI、endpoint 默认值、模型刷新或请求发送逻辑
-   **THEN** 系统 SHALL NOT 暴露 Azure OpenAI 专用协议、Azure endpoint 模板、Azure API version 字段、`api-key` 鉴权 header 或旧 `azure*` 字段
-   **AND** 如用户确实要使用兼容服务,只能自行以 `openai-chat` 或 `openai-responses` 填写自定义 endpoint 与 Bearer 凭据

### Requirement: ProviderConfig 数据结构

系统 SHALL 把每一份 Provider 配置表示为以下结构:

```ts
interface ProviderConfig {
    id: string // uuid v4,持久且稳定
    name: string // 用户可读名,用于 UI
    protocol: ProviderProtocol
    apiKey: string
    endpoint?: string // 缺省走该协议默认官方 endpoint
    model: string // 模型名
    modelOptions?: string[]
    extraHeaders?: Record<string, string>
}
```

ProviderConfig SHALL 只保存连接与鉴权信息，以及该 Provider 发现到的模型候选列表。系统 SHALL NOT 在 ProviderConfig 中保存模型级 Thinking / Reasoning 设置。

#### Scenario: 创建配置后字段稳定

-   **WHEN** 用户新建一份 ProviderConfig
-   **THEN** 系统 SHALL 为其生成 uuid v4 作为 `id`
-   **AND** `id` SHALL 在该条目后续修改、重命名时保持不变

#### Scenario: 旧配置不保留 Provider 级思考字段

-   **WHEN** 系统读取包含 `thinkingEnabled` / `openaiReasoningEffort` / `anthropicThinkingEffort` 的旧 ProviderConfig
-   **THEN** 归一化后的 ProviderConfig SHALL NOT 包含这些字段

### Requirement: 模型级思考控制数据结构

系统 SHALL 把当前默认模型选择表示为以下结构:

```ts
interface ModelSelection {
    providerId: string
    model: string
    thinkingEnabled?: boolean
    openaiReasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    anthropicThinkingEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}
```

系统 SHALL 把 `thinkingEnabled` 作为唯一启用开关。当 `thinkingEnabled !== true` 时，系统 SHALL 不向任何上游发送 OpenAI reasoning 或 Anthropic thinking 参数，即使 effort 字段存在也必须忽略。字段缺失时 SHALL 按关闭思考处理；`openaiReasoningEffort` 缺失时 SHALL 使用 `'medium'` 作为 UI 默认值；`anthropicThinkingEffort` 缺失时 SHALL 使用 `'high'` 作为 UI 默认值。旧配置或跨版本同步缺失这些字段时 SHALL 以关闭思考作为迁移默认值。

#### Scenario: 关闭开关优先于模型级 effort 字段

-   **WHEN** ModelSelection 设置了 `thinkingEnabled: false` 与 `openaiReasoningEffort: 'high'`
-   **THEN** OpenAI 请求 SHALL NOT 包含 `reasoning_effort` 或 `reasoning`
-   **WHEN** ModelSelection 设置了 `thinkingEnabled: false` 与 `anthropicThinkingEffort: 'max'`
-   **THEN** Anthropic 请求 SHALL NOT 包含 `thinking` 或 `output_config.effort`

### Requirement: 同一协议允许任意多份配置

系统 SHALL 允许用户为 `'openai-chat'` / `'openai-responses'` / `'anthropic'` 中的任意一种或多种,各自添加任意数量(>=0)的 ProviderConfig 条目。系统 MUST NOT 限制每种协议最多一份。

#### Scenario: 多份 OpenAI Chat 兼容配置

-   **WHEN** 用户依次添加三份 `protocol: 'openai-chat'` 的配置(分别名为"OpenAI 官方"、"兼容服务 A"、"本地兼容服务"),各自 endpoint 与 key 不同
-   **THEN** 三份配置 SHALL 同时存在于 `settings.providers`
-   **AND** 用户 SHALL 能在翻译界面下拉中选择其中任意一份

#### Scenario: 仅添加单一协议也合法

-   **WHEN** 用户仅添加 1 份 `protocol: 'anthropic'` 的配置,其它两种协议为空
-   **THEN** 系统 SHALL 正常工作并以该 Anthropic 配置作为默认

### Requirement: 默认 Provider 选择

系统 SHALL 通过 `settings.defaultProviderId: string | null` 标识默认翻译所使用的 ProviderConfig。系统 SHALL 把用户在主界面下拉中的临时选择写入运行时状态,但 NOT 修改 `defaultProviderId`(除非用户在设置中显式更改)。

#### Scenario: 删除当前默认 Provider 时回退

-   **WHEN** 用户删除一条 ProviderConfig,且其 `id === settings.defaultProviderId`
-   **AND** `settings.providers` 删除后非空
-   **THEN** 系统 SHALL 把 `defaultProviderId` 设为 `settings.providers[0].id`

#### Scenario: 删除最后一条 Provider

-   **WHEN** 用户删除最后一条 ProviderConfig
-   **THEN** 系统 SHALL 把 `defaultProviderId` 设为 `null`
-   **AND** 主界面翻译按钮 SHALL 处于禁用状态并提示"请先在设置中添加 LLM Provider"

#### Scenario: 临时切换不污染默认

-   **WHEN** 用户在主界面下拉中临时选择非默认配置完成一次翻译
-   **THEN** `settings.defaultProviderId` SHALL 保持原值
-   **AND** 下次打开主界面时 SHALL 仍回到原默认配置

### Requirement: 默认 Endpoint 与自定义 Endpoint

系统 SHALL 在 `endpoint` 留空时,按 `protocol` 使用以下默认值:

-   `openai-chat` → `https://api.openai.com/v1`
-   `openai-responses` → `https://api.openai.com/v1`
-   `anthropic` → `https://api.anthropic.com`

系统 SHALL 在 `endpoint` 非空时,使用用户提供的 base URL,允许指向任意兼容该协议的第三方供应商。
系统 MUST NOT 内置第三方厂商 endpoint 模板或按厂商预填模型;除 OpenAI / Anthropic 官方默认值外,所有自定义 endpoint 都由用户手动输入。

#### Scenario: 留空使用官方默认

-   **WHEN** ProviderConfig 的 `endpoint` 为 `undefined` 或空字符串,`protocol` 为 `'openai-chat'`
-   **THEN** 实际请求 SHALL 发往 `https://api.openai.com/v1/chat/completions`

#### Scenario: 自定义 Endpoint 接入第三方

-   **WHEN** 用户填入 `endpoint: 'https://api.deepseek.com/v1'`,`protocol: 'openai-chat'`
-   **THEN** 实际请求 SHALL 发往 `https://api.deepseek.com/v1/chat/completions`
-   **AND** 鉴权 header `Authorization: Bearer <apiKey>` SHALL 与 OpenAI Chat 协议一致

#### Scenario: Endpoint 路径归一化

-   **WHEN** 用户填入 `endpoint: 'https://api.example.com/v1/chat/completions'`(含完整子路径)
-   **THEN** 系统 SHALL 检测并归一化,不重复拼接 `/chat/completions`

#### Scenario: 不提供第三方模板

-   **WHEN** 用户打开新增 Provider 表单
-   **THEN** UI SHALL 只提供协议选择与官方默认 endpoint 提示
-   **AND** SHALL NOT 提供 "Azure"、"DeepSeek"、"Moonshot"、"Groq"、"Ollama" 等第三方模板下拉或一键预填项

### Requirement: 通过 API 动态发现可用模型

系统 SHALL 为每个 `ProviderProtocol` 实现一个 `listModels(providerConfig): Promise<string[]>`,在 Provider 表单中点击"刷新模型"按钮时调用,返回该 endpoint + apiKey 凭据下可用的模型 id 列表。系统 SHALL 在 UI 中以 Combobox 形式渲染过滤后的模型列表,允许用户:从下拉中选择;在下拉无结果或选择"自定义"时手填字符串保存。

#### Scenario: 刷新 OpenAI Chat 模型列表

-   **WHEN** 用户在 `protocol === 'openai-chat'` 的表单中填好 endpoint 与 apiKey 后点击"刷新模型"
-   **THEN** 系统 SHALL 发起 `GET {endpoint}/models`,鉴权 header `Authorization: Bearer <apiKey>`
-   **AND** 解析响应 `data: [{ id, ... }]` 取 `id` 列表
-   **AND** 经 `filterChatModels` 过滤后渲染到 Combobox 下拉

#### Scenario: 刷新 OpenAI Responses 模型列表

-   **WHEN** 用户在 `protocol === 'openai-responses'` 的表单中刷新模型
-   **THEN** 系统 SHALL 调用同一 `GET {endpoint}/models` 端点
-   **AND** 应用相同的 `filterChatModels` 过滤(Responses 也是对话能力模型集合)

#### Scenario: 刷新 Anthropic 模型列表

-   **WHEN** 用户在 `protocol === 'anthropic'` 的表单中刷新模型
-   **THEN** 系统 SHALL 发起 `GET {endpoint}/v1/models`,鉴权 `x-api-key: <apiKey>` 与 `anthropic-version: 2023-06-01` header
-   **AND** 解析 `data: [{ id, ... }]` 取 `id`,经 `filterChatModels` 过滤后渲染

#### Scenario: 刷新失败降级为纯文本输入

-   **WHEN** `listModels` 抛出网络错误、超时、4xx/5xx,或响应不含 `data` 数组
-   **THEN** 系统 SHALL 通过 toast 显示如"无法获取模型列表,请手动填写模型名"
-   **AND** Combobox SHALL 退化为接受任意字符串的输入框
-   **AND** 用户 SHALL 仍能键入并保存模型名

#### Scenario: 第三方供应商无 /models 端点

-   **WHEN** 用户填入第三方兼容供应商的 endpoint,该端点返回 404 / 405
-   **THEN** 系统 SHALL 与"刷新失败"路径一致地处理(toast + 退化为输入框)
-   **AND** SHALL NOT 阻止用户保存 ProviderConfig

#### Scenario: 手填的模型名优先生效

-   **WHEN** 用户从下拉选择 `gpt-4o-mini` 后又把输入框内容改为 `my-internal-alias-2026`
-   **THEN** 保存后 `ProviderConfig.model` SHALL 为 `'my-internal-alias-2026'`
-   **AND** 翻译请求 SHALL 使用该模型名

### Requirement: 模型过滤规则(对话/翻译用)

系统 SHALL 提供 `filterChatModels(ids: string[]): string[]` 工具函数,从模型 id 列表中**剔除**与对话/翻译能力无关的模型。系统 MUST 至少剔除以下类别(以正则或等价匹配实现,大小写不敏感):

-   嵌入(embedding):匹配 `(^|[-/])(text-)?embedding($|[-/])`,例如 `text-embedding-3-small`、`*-embedding-*`
-   实时语音(realtime):匹配 `(^|[-/])realtime($|-)`,例如 `gpt-realtime`、`gpt-4o-realtime-preview`
-   音频(audio):匹配 `(^|[-/])audio($|-)`,例如 `gpt-audio`、`gpt-4o-audio-preview`
-   转录(transcription):匹配 `^whisper(-|$)` 或 `(^|[-/])transcribe($|-)`,例如 `whisper-1`、`gpt-4o-transcribe`
-   审核(moderation):匹配 `(^|[-/])moderation($|-)`,例如 `omni-moderation-latest`、`text-moderation-latest`
-   TTS:匹配 `^tts(-|$)` 或 `-tts($|-)`,例如 `tts-1`、`tts-1-hd`、`gpt-4o-mini-tts`
-   图像生成:匹配 `^dall-e` 或 `^gpt-image`,例如 `dall-e-3`、`gpt-image-1`
-   视频生成:匹配 `(^|[-/])sora($|-)`,例如 `sora-2`
-   专用搜索:匹配 `-search-(preview|api)`,例如 `gpt-4o-search-preview`

系统 SHALL 采用**黑名单**而非白名单策略,使新发布的对话模型默认即可显示;系统 MUST NOT 因模型 id 不在已知列表中就将其过滤。

#### Scenario: 标准 OpenAI 列表过滤

-   **WHEN** 输入 `['gpt-4o', 'gpt-4o-mini', 'gpt-4o-realtime-preview', 'text-embedding-3-small', 'whisper-1', 'tts-1', 'dall-e-3', 'omni-moderation-latest', 'o3-mini']`
-   **THEN** `filterChatModels` SHALL 返回 `['gpt-4o', 'gpt-4o-mini', 'o3-mini']`(顺序与原列表一致)

#### Scenario: 未知前缀的新模型保留

-   **WHEN** 输入包含 `'sonoma-translator-2099'`(未在任何黑名单分类中)
-   **THEN** 该 id SHALL 出现在返回结果中

#### Scenario: 大小写不敏感

-   **WHEN** 输入 `['Whisper-Large-V3', 'TTS-1-HD', 'GPT-4O']`
-   **THEN** 返回 SHALL 仅含 `'GPT-4O'`

### Requirement: 模型字段必填

系统 SHALL 要求每份 ProviderConfig 的 `model` 字段为非空字符串;系统 SHALL 在保存表单前校验,空值时 SHALL 阻止保存并给出可读错误。

#### Scenario: 保存空模型阻止

-   **WHEN** 用户在 Provider 表单中清空 model 后点击保存
-   **THEN** 系统 SHALL 阻止保存
-   **AND** 在 model 字段下方显示"模型名不能为空"提示

### Requirement: Provider 表单的模型 Combobox 行为

系统 SHALL 在 Provider 新增/编辑表单中以 Combobox 渲染"模型"字段,组件 MUST 同时支持下拉选择(展示来自 `listModels` + `filterChatModels` 的结果)与自由文本输入。表单首次打开且 `endpoint`、`apiKey` 完整时 SHOULD 自动触发一次刷新;否则在用户点击"刷新模型"时触发。

#### Scenario: 首次打开自动拉取

-   **WHEN** 用户新增 `openai-chat` ProviderConfig,表单中 endpoint(或官方默认 endpoint)与 apiKey 均填好
-   **THEN** 离开 apiKey 输入框(blur)时 SHALL 自动触发一次模型刷新

#### Scenario: 编辑已有配置不重复刷新

-   **WHEN** 用户打开一份已保存的 ProviderConfig 进入编辑态
-   **THEN** Combobox 默认 SHALL 仅显示当前已保存的 `model` 字符串作为已选值,不自动调用 `listModels`
-   **AND** 用户点击"刷新模型"后才发起请求

### Requirement: 设置 UI:Provider 列表管理

系统 SHALL 在设置页提供"LLM Providers"区块,用户在此可以:

-   看到 `settings.providers` 中所有条目(显示 name、protocol、endpoint 摘要、是否为默认)
-   新增一份配置(选择协议 → 填写表单)
-   编辑/重命名/删除任意条目
-   把任意条目设为默认

#### Scenario: 设为默认

-   **WHEN** 用户在某条 Provider 行点击"设为默认"
-   **THEN** `settings.defaultProviderId` SHALL 被更新为该条 id
-   **AND** 该条目 SHALL 在 UI 上显示"默认"徽标

#### Scenario: 新增表单不含厂商模板

-   **WHEN** 用户在新增表单中选择协议 `openai-chat`
-   **THEN** 表单 SHALL 显示 OpenAI 官方 endpoint 作为默认行为说明
-   **AND** SHALL NOT 显示 DeepSeek、Moonshot、Groq、Azure、Ollama 等第三方厂商模板
-   **AND** 用户 SHALL 可手动填写任意兼容 endpoint 与模型名

### Requirement: 主界面运行时切换

系统 SHALL 在主翻译界面提供 Provider 下拉控件,内容为 `settings.providers` 全部条目,选中后立即生效但不写回 `defaultProviderId`。

#### Scenario: 翻译用临时选定的 Provider

-   **WHEN** 用户在主界面把下拉从"OpenAI 官方"切到"兼容服务 A"并触发一次翻译
-   **THEN** 该次 `translate` 调用 SHALL 使用"兼容服务 A"配置的 endpoint/key/model
-   **AND** 该次写入 history 的 `providerId` SHALL 为"兼容服务 A"条目的 id

### Requirement: 新 App schema 初始化与旧字段清理

系统 SHALL 按新 App 处理 settings。首次读取缺省 settings 时 SHALL 初始化 `providers: []` 与 `defaultProviderId: null`。若持久化数据中存在旧字段(`apiKeys` / `apiURL` / `provider` / `azureAPIKeys` / `miniMaxAPIKey` / `geminiAPIKey` / `moonshotAPIKey` / `deepSeekAPIKey` 等),系统 MUST NOT 将其转换为 ProviderConfig;下次写回 settings 时 SHALL 只写新 schema 字段,从而删除或忽略旧字段。

#### Scenario: 新安装初始化为空 Provider 列表

-   **WHEN** 用户首次安装并读取 settings
-   **THEN** `settings.providers` SHALL 为 `[]`
-   **AND** `settings.defaultProviderId` SHALL 为 `null`
-   **AND** 主界面翻译按钮 SHALL 禁用并提示用户先添加 LLM Provider

#### Scenario: 旧 OpenAI 字段不迁移

-   **WHEN** 持久化 settings 中只有旧字段 `provider === 'OpenAI'`,`apiKeys === 'sk-xxx'`,`apiModel === 'gpt-4o'`
-   **THEN** 读取后的 `settings.providers` SHALL 仍为 `[]`
-   **AND** 系统 SHALL NOT 创建 OpenAI ProviderConfig
-   **AND** 下次保存 settings 时 SHALL NOT 写回 `provider` / `apiKeys` / `apiModel`

#### Scenario: 旧 Azure 字段不迁移

-   **WHEN** 持久化 settings 中包含 `provider === 'Azure'` 或任意 `azure*` 字段
-   **THEN** 读取后的 `settings.providers` SHALL 仍为 `[]`
-   **AND** 系统 SHALL NOT 创建 `openai-chat` ProviderConfig
-   **AND** 下次保存 settings 时 SHALL NOT 写回任何 `azure*` 字段

#### Scenario: 未识别 Provider 直接丢弃

-   **WHEN** 持久化 settings 中 `provider === 'SomeLegacyProvider'`
-   **THEN** 系统 SHALL NOT 为其创建 ProviderConfig
-   **AND** SHALL NOT 尝试按 OpenAI 兼容协议兜底

#### Scenario: 已是新 schema 保持不变

-   **WHEN** settings 已含 `providers` 数组(无论空与否)
-   **THEN** 读取逻辑 SHALL 保留该数组与 `defaultProviderId`
-   **AND** SHALL NOT 读取旧 Provider 字段覆盖新 schema

### Requirement: 浏览器扩展自定义 Endpoint 权限

系统 SHALL 在浏览器扩展环境中以最小固定 host permission 运行。系统 MUST 删除旧 `webRequest` 权限与 ChatGPT Arkose / Kimi / ChatGLM token 捕获逻辑。对于用户配置的自定义 endpoint,系统 SHALL 在用户明确触发模型刷新、保存并测试或首次翻译前请求该 endpoint origin 的可选 host permission;若用户拒绝授权,系统 SHALL 阻止该次网络请求并显示可读错误。

#### Scenario: 自定义 endpoint 首次请求授权

-   **WHEN** 用户在 Chromium 扩展中配置 `endpoint: 'https://api.example.com/v1'` 并点击"刷新模型"
-   **THEN** 系统 SHALL 从 endpoint 计算 origin `https://api.example.com/*`
-   **AND** 若扩展尚无该 origin 权限,SHALL 在该点击手势内调用 `permissions.request({ origins: ['https://api.example.com/*'] })`
-   **AND** 授权通过后才发起 `GET https://api.example.com/v1/models`

#### Scenario: 用户拒绝自定义 endpoint 权限

-   **WHEN** `permissions.request` 返回未授权
-   **THEN** 系统 SHALL NOT 发起模型刷新或翻译请求
-   **AND** UI SHALL 提示"浏览器未授予该 Endpoint 的访问权限"

#### Scenario: 旧 webRequest token 捕获已移除

-   **WHEN** 在 `src/browser-extension/background` 中检索 `webRequest`、`Arkose`、`keyKimiAccessToken`、`keyChatGLMAccessToken`
-   **THEN** SHALL NOT 存在相关监听器或 token 存储逻辑

### Requirement: 模型思考控制表单

系统 SHALL 在 Provider 表单之外、模型选择区域中提供“启用思考(Thinking)”开关。系统 SHALL 根据当前模型所引用 Provider 的 `protocol` 显示对应的 provider-specific effort 控件:

-   `openai-chat` / `openai-responses`: 显示 OpenAI Reasoning Effort，下拉选项为 None、Minimal、Low、Medium、High、Extra High，并保存到当前 ModelSelection 的 `openaiReasoningEffort`。
-   `anthropic`: 显示 Anthropic Thinking Effort，下拉选项为 Low、Medium、High、Extra High、Max，并保存到当前 ModelSelection 的 `anthropicThinkingEffort`。

系统 SHALL 始终保留用户配置的模型级 effort 字段，但只有 `thinkingEnabled === true` 时才会发送到上游。表单 SHALL 显示简短说明，告知用户该配置是否生效取决于所选模型和兼容端点；OpenAI reasoning 推荐使用 `openai-responses` 协议。

#### Scenario: 允许调整 OpenAI reasoning effort

-   **WHEN** 当前模型引用的 Provider 为 `protocol === 'openai-responses'` 或 `protocol === 'openai-chat'`
-   **THEN** 系统 SHALL 提供 `thinkingEnabled` 开关与 OpenAI Reasoning Effort 控件
-   **AND** 保存后 SHALL 正确更新当前 ModelSelection 的 `thinkingEnabled` 与 `openaiReasoningEffort`

#### Scenario: 允许调整 Anthropic thinking effort

-   **WHEN** 当前模型引用的 Provider 为 `protocol === 'anthropic'`
-   **THEN** 系统 SHALL 提供 `thinkingEnabled` 开关与 Anthropic Thinking Effort 控件
-   **AND** 保存后 SHALL 正确更新当前 ModelSelection 的 `thinkingEnabled` 与 `anthropicThinkingEffort`
