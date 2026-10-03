# llm-provider-config Specification

## Purpose

定义 LLM Provider 的协议集合、ProviderConfig / 默认模型 / Provider + Model 输出控制的数据结构与归一化规则，以及设置页中 Provider 管理、模型发现与模型选择、浏览器扩展自定义 endpoint 授权等行为。

## Requirements

### Requirement: 支持的 Provider 协议集合

系统 SHALL 仅支持三种 LLM Provider 协议形态,以 `ProviderProtocol` 枚举表示:`'openai-chat'`、`'openai-responses'`、`'anthropic'`。系统 MUST NOT 提供其它专属协议(Azure / Gemini / MiniMax / DeepSeek / Moonshot / ChatGLM / Cohere / Groq / Cerebras / Kimi / Ollama / ChatGPT 网页版 等)的独立适配代码。`getEngine` SHALL 只按这三种协议分派到 `src/common/engines/protocols/` 下对应的 engine。

#### Scenario: 协议枚举完整且封闭

-   **WHEN** 任意代码处通过 TypeScript 引用 `ProviderProtocol`
-   **THEN** 该联合类型 SHALL 恰好为 `'openai-chat' | 'openai-responses' | 'anthropic'`,不多不少

#### Scenario: 不存在厂商专属 engine 文件

-   **WHEN** 在 `src/common/engines/` 下查找
-   **THEN** SHALL NOT 存在 `azure.ts` / `gemini.ts` / `minimax.ts` / `deepseek.ts` / `moonshot.ts` / `chatglm.ts` / `cohere.ts` / `groq.ts` / `cerebras.ts` / `kimi.ts` / `ollama.ts` / `chatgpt.ts` 等厂商专属文件
-   **AND** `protocols/` 下 SHALL 只有 `openai-chat.ts`、`openai-responses.ts`、`anthropic.ts` 三个协议实现

#### Scenario: Azure 不作为特殊协议或特殊 endpoint

-   **WHEN** 用户查看 Provider 协议、设置 UI、endpoint 默认值、模型刷新或请求发送逻辑
-   **THEN** 系统 SHALL NOT 暴露 Azure OpenAI 专用协议、Azure endpoint 模板、Azure API version 字段、`api-key` 鉴权 header 或旧 `azure*` 字段
-   **AND** 如用户确实要使用兼容服务,只能自行以 `openai-chat` 或 `openai-responses` 填写自定义 endpoint 与 Bearer 凭据(必要时通过 `extraHeaders` 追加 header)

### Requirement: ProviderConfig 数据结构

系统 SHALL 把每一份 Provider 配置表示为以下结构:

```ts
interface ProviderConfig {
    id: string // uuid v4,持久且稳定
    name: string // 用户可读名,用于 UI
    protocol: ProviderProtocol
    apiKey: string
    endpoint?: string // 缺省走该协议默认官方 endpoint
    model: string // 该 Provider 的回退模型名,可为空字符串
    modelOptions?: string[] // 最近一次刷新得到的模型候选列表
    extraHeaders?: Record<string, string> // 追加到每个请求的自定义 header
}
```

ProviderConfig SHALL 只保存连接与鉴权信息、回退模型名以及该 Provider 发现到的模型候选列表。系统 SHALL NOT 在 ProviderConfig 中保存模型级 Thinking / Reasoning 设置或 Structured Output 设置。归一化时系统 SHALL 只保留上述字段,`modelOptions` 中非字符串或空白项 SHALL 被丢弃,`model` 不是字符串时 SHALL 回退为 `modelOptions[0]` 或空字符串。

`model` 只在两种情况下被写入:编辑表单保存时沿用原值(新建时为空字符串),以及刷新模型时若当前为空则取刷新结果的第一项。用户在设置页或主界面选择的模型 SHALL 记录在 `settings.defaultModel` 中,而不是回写 `ProviderConfig.model`。

#### Scenario: 创建配置后字段稳定

-   **WHEN** 用户新建一份 ProviderConfig
-   **THEN** 系统 SHALL 为其生成 uuid v4 作为 `id`
-   **AND** `id` SHALL 在该条目后续修改、重命名时保持不变

#### Scenario: 旧配置不保留 Provider 级思考与输出字段

-   **WHEN** 系统读取包含 `thinkingEnabled` / `reasoningEffort` / `openaiReasoningEffort` / `anthropicThinkingEffort` / `useStructuredOutput` 等额外字段的旧 ProviderConfig
-   **THEN** 归一化后的 ProviderConfig SHALL NOT 包含这些字段

#### Scenario: 旧默认模型不保留模型级思考控制

-   **WHEN** 系统读取包含 `thinkingEnabled` / `reasoningEffort` / `openaiReasoningEffort` / `anthropicThinkingEffort` 的旧 ModelSelection
-   **THEN** 归一化后的 ModelSelection SHALL NOT 包含这些字段

### Requirement: 模型级思考控制数据结构

系统 SHALL 把当前默认模型选择表示为以下结构:

```ts
interface ModelSelection {
    providerId: string
    model: string
}
```

ModelSelection SHALL 只标识默认 Provider 与模型名。系统 SHALL NOT 在 ModelSelection 中保存 `thinkingEnabled`、`reasoningEffort`、`useStructuredOutput` 或 `useStrictSchema`。模型级输出控制 SHALL 存储在 ProviderModelOutputControls 中，并通过完全匹配的 `providerId + model` 组合解析。

#### Scenario: ModelSelection 不承载输出控制

-   **WHEN** 系统归一化 settings.defaultModel
-   **THEN** 归一化后的 ModelSelection SHALL 仅包含 `providerId` 与 `model`
-   **AND** SHALL NOT 包含 Thinking 或 Structured Output 字段

#### Scenario: 缺少输出控制记录时关闭

-   **WHEN** 当前 ModelSelection 指向的 Provider + Model 没有 ProviderModelOutputControls 记录
-   **THEN** 系统 SHALL 按关闭思考与关闭结构化输出处理

#### Scenario: 关闭开关优先于模型级 effort 字段

-   **WHEN** ProviderModelOutputControls 设置了 `thinkingEnabled: false` 与 `reasoningEffort: 'high'`
-   **THEN** 请求 SHALL NOT 发送用户保存的 `'high'`

### Requirement: 同一协议允许任意多份配置

系统 SHALL 允许用户为 `'openai-chat'` / `'openai-responses'` / `'anthropic'` 中的任意一种或多种,各自添加任意数量(>=0)的 ProviderConfig 条目。系统 MUST NOT 限制每种协议最多一份。

#### Scenario: 多份 OpenAI Chat 兼容配置

-   **WHEN** 用户依次添加三份 `protocol: 'openai-chat'` 的配置(分别名为"OpenAI 官方"、"兼容服务 A"、"本地兼容服务"),各自 endpoint 与 key 不同
-   **THEN** 三份配置 SHALL 同时存在于 `settings.providers`
-   **AND** 用户 SHALL 能在设置页通过对应行的 "Use" 按钮把其中任意一份切换为当前使用的 Provider

#### Scenario: 仅添加单一协议也合法

-   **WHEN** 用户在没有任何 Provider 时仅添加 1 份 `protocol: 'anthropic'` 的配置
-   **THEN** 系统 SHALL 正常工作并把 `defaultProviderId` 设为该 Anthropic 配置的 id

### Requirement: 默认 Provider 选择

系统 SHALL 通过 `settings.defaultProviderId: string | null` 与 `settings.defaultModel: ModelSelection | null` 标识默认翻译所使用的 Provider 与模型。翻译时实际使用的 Provider SHALL 依次取调用方显式传入的 `providerId`、`defaultModel.providerId`、`defaultProviderId`;实际模型 SHALL 依次取显式传入的 `model`、`defaultModel.model`、该 ProviderConfig 的 `model`。

归一化时,若 `defaultProviderId` 不指向现存 Provider,系统 SHALL 把它设为 `providers[0].id`(列表为空则为 `null`);若 `defaultModel` 不指向现存 Provider 或模型名为空,系统 SHALL 回退为 `defaultProviderId` 所指 Provider 的 `{ providerId, model }`;该 Provider 的 `model` 为空时 `defaultModel` SHALL 为 `null`,SHALL NOT 回退到其它 Provider。

设置页 Provider 列表中当前使用的 Provider(`defaultModel.providerId`,`defaultModel` 为 `null` 时取 `defaultProviderId`)SHALL 显示 "In use" 标记,其它行 SHALL 显示 "Use" 按钮。点击 "Use" SHALL 把 `defaultProviderId` 设为该 Provider 的 id,并把 `defaultModel` 设为 `{ providerId, model }`,其中 `model` 依次取该 ProviderConfig 的 `model`、`modelOptions[0]`;两者皆空时 `defaultModel` SHALL 设为 `null`,由设置页模型选择框提示用户选择模型。

#### Scenario: Use 切换到没有模型的 Provider

-   **WHEN** 当前使用 Provider A(`defaultModel` 指向 A 的某个模型),用户对 `model` 为空且 `modelOptions` 为空的 Provider B 点击 "Use"
-   **THEN** 系统 SHALL 把 `defaultProviderId` 设为 B 的 id,`defaultModel` 设为 `null`
-   **AND** "In use" 标记 SHALL 移到 B,模型选择框 SHALL 为空等待用户选择
-   **AND** 保存并重新读取设置后,`defaultModel` SHALL 仍为 `null`,SHALL NOT 回退为 A 的模型

#### Scenario: Use 切换到已有模型的 Provider

-   **WHEN** 用户对 `model` 为 `'claude-sonnet-5-5'` 的 Provider B 点击 "Use"
-   **THEN** 系统 SHALL 把 `defaultProviderId` 设为 B 的 id,`defaultModel` 设为 `{ providerId: B.id, model: 'claude-sonnet-5-5' }`

#### Scenario: 首个新增 Provider 成为默认

-   **WHEN** `defaultProviderId` 为 `null` 时用户保存一份新的 ProviderConfig
-   **THEN** 系统 SHALL 把 `defaultProviderId` 设为该条目的 id

#### Scenario: 删除当前默认 Provider 时回退

-   **WHEN** 用户删除一条 ProviderConfig,且其 `id === settings.defaultProviderId`
-   **AND** `settings.providers` 删除后非空
-   **THEN** 系统 SHALL 把 `defaultProviderId` 设为删除后列表的第一项 id
-   **AND** 若 `defaultModel.providerId` 指向被删条目,系统 SHALL 把 `defaultModel` 改为剩余条目中第一个 `model` 非空者的 `{ providerId, model }`,不存在时设为 `null`
-   **AND** 该条目的所有 ProviderModelOutputControls 记录 SHALL 被一并删除

#### Scenario: 删除最后一条 Provider

-   **WHEN** 用户删除最后一条 ProviderConfig
-   **THEN** 系统 SHALL 把 `defaultProviderId` 与 `defaultModel` 设为 `null`
-   **AND** 主界面 SHALL 显示"Please add an LLM Provider in settings first."提示及打开设置的按钮,页脚显示"No LLM Provider"
-   **AND** 若仍触发翻译,系统 SHALL 以错误"No LLM Provider configured. Please add a provider in settings."结束该次翻译

#### Scenario: 已选 Provider 但没有模型

-   **WHEN** 当前 Provider 存在,但 `defaultModel` 为空且该 ProviderConfig 的 `model` 为空字符串
-   **THEN** 翻译 SHALL 以错误"No model selected. Please select a model in settings."结束,且不发起网络请求

### Requirement: 默认 Endpoint 与自定义 Endpoint

桌面 HTTP 权限 SHALL 允许用户配置的 HTTP/HTTPS Endpoint 使用非默认端口；模型发现及语音请求 SHALL 不因显式端口被权限层拒绝。

#### Scenario: 本地服务的非默认端口

- **WHEN** 用户配置 `http://127.0.0.1:11434/v1` 并刷新模型
- **THEN** HTTP 权限 SHALL 允许请求抵达该服务

系统 SHALL 在 `endpoint` 留空时,按 `protocol` 使用以下默认值:

-   `openai-chat` → `https://api.openai.com/v1`
-   `openai-responses` → `https://api.openai.com/v1`
-   `anthropic` → `https://api.anthropic.com`

系统 SHALL 在 `endpoint` 非空时,使用用户提供的 base URL,允许指向任意兼容该协议的第三方供应商。
系统 MUST NOT 内置第三方厂商 endpoint 模板或按厂商预填模型;除 OpenAI / Anthropic 官方默认值外,所有自定义 endpoint 都由用户手动输入。

#### Scenario: 留空使用官方默认

-   **WHEN** ProviderConfig 的 `endpoint` 为 `undefined` 或空字符串,`protocol` 为 `'openai-chat'`
-   **THEN** 实际请求 SHALL 发往 `https://api.openai.com/v1/chat/completions`
-   **WHEN** `protocol` 为 `'anthropic'` 且 `endpoint` 留空
-   **THEN** 实际请求 SHALL 发往 `https://api.anthropic.com/v1/messages`

#### Scenario: 自定义 Endpoint 接入第三方

-   **WHEN** 用户填入 `endpoint: 'https://api.example.com/v1'`,`protocol: 'openai-chat'`
-   **THEN** 实际请求 SHALL 发往 `https://api.example.com/v1/chat/completions`
-   **AND** 鉴权 header `Authorization: Bearer <apiKey>` SHALL 与 OpenAI Chat 协议一致

#### Scenario: Endpoint 路径归一化

-   **WHEN** 用户填入 `endpoint: 'https://api.example.com/v1/chat/completions'`(含完整子路径)
-   **THEN** 系统 SHALL 检测并归一化,不重复拼接 `/chat/completions`
-   **AND** 以 `/chat/completions`、`/responses`、`/messages`、`/audio/speech` 结尾的 endpoint SHALL 先去掉该后缀再拼接目标路径

#### Scenario: 已带版本段的 base URL 不再补 `/v1`

-   **WHEN** 用户填入的 base URL 任一路径段已是 API 版本(匹配 `v<数字>`,可带 `alpha` / `beta` 后缀),例如 `https://generativelanguage.googleapis.com/v1beta/openai` 或 `https://ark.example.com/api/v3`
-   **THEN** 系统 SHALL 直接在其后拼接协议子路径,例如 `…/v1beta/openai/chat/completions`、`…/api/v3/chat/completions`
-   **AND** SHALL NOT 额外插入 `/v1`
-   **WHEN** base URL 不含版本段,例如 `https://api.example.com/anthropic`
-   **THEN** 系统 SHALL 拼接带 `/v1` 的协议路径,例如 `…/anthropic/v1/messages`

#### Scenario: 不提供第三方模板

-   **WHEN** 用户打开新增 Provider 表单
-   **THEN** UI SHALL 只提供协议选择与"Official endpoint: <当前协议默认 endpoint>"提示
-   **AND** SHALL NOT 提供 "Azure"、"DeepSeek"、"Moonshot"、"Groq"、"Ollama" 等第三方模板下拉或一键预填项

### Requirement: 通过 API 动态发现可用模型

系统 SHALL 为每个 `ProviderProtocol` 实现 `listModels`,在设置页 Provider 列表某一行点击 "Refresh" 按钮时调用,返回该 endpoint + apiKey 凭据下可用的模型 id 列表。请求 SHALL 附带 ProviderConfig 的 `extraHeaders`,整个列表获取(含分页的全部请求)SHALL 在 15 秒后超时。`listModels` SHALL NOT 向调用方抛出错误:非 2xx 响应、网络错误、超时或响应不含 `data` 数组时 SHALL 返回空列表。

刷新得到的 id SHALL 先经 `filterChatModels` 过滤,再经 `sortModelIds` 按自然数字顺序(大小写不敏感)排序;结果非空时 SHALL 整体替换该 ProviderConfig 的 `modelOptions`,且若该 ProviderConfig 的 `model` 为空,SHALL 设为结果第一项;结果为空时 SHALL 保持原有 `modelOptions` 与设置不变。

#### Scenario: 刷新 OpenAI Chat 模型列表

-   **WHEN** 用户对 `protocol === 'openai-chat'` 的 Provider 点击 "Refresh"
-   **THEN** 系统 SHALL 发起 `GET {base}/models`(base 按"默认 Endpoint 与自定义 Endpoint"规则解析,留空时为 `https://api.openai.com/v1/models`),鉴权 header `Authorization: Bearer <apiKey>`
-   **AND** 解析响应 `data: [{ id, ... }]` 取字符串 `id` 列表

#### Scenario: 刷新 OpenAI Responses 模型列表

-   **WHEN** 用户对 `protocol === 'openai-responses'` 的 Provider 点击 "Refresh"
-   **THEN** 系统 SHALL 调用与 `openai-chat` 相同的 `GET {base}/models` 实现与过滤规则

#### Scenario: 刷新 Anthropic 模型列表

-   **WHEN** 用户对 `protocol === 'anthropic'` 的 Provider 点击 "Refresh"
-   **THEN** 系统 SHALL 发起 `GET {endpoint}/v1/models?limit=1000`(留空时为 `https://api.anthropic.com/v1/models?limit=1000`),携带 `x-api-key: <apiKey>` 与 `anthropic-version: 2023-06-01` header
-   **AND** 解析 `data: [{ id, ... }]` 取 `id`,例如 `claude-sonnet-5-5`、`claude-opus-5-5`、`claude-haiku-4-5`

#### Scenario: Anthropic 模型列表分页

-   **WHEN** Anthropic 模型列表响应含 `has_more: true` 与 `last_id: 'claude-haiku-4-5'`
-   **THEN** 系统 SHALL 继续请求 `GET {endpoint}/v1/models?limit=1000&after_id=claude-haiku-4-5`,直到 `has_more` 不为 `true`,并按顺序合并各页 `id`
-   **AND** 若 `last_id` 缺失或与上一次的 `after_id` 相同,系统 SHALL 停止翻页并返回已合并的结果
-   **AND** 任一页请求失败、返回非 2xx 或不含 `data` 数组时,`listModels` SHALL 返回空列表
-   **AND** 所有分页请求 SHALL 共用同一个 15 秒超时

#### Scenario: OpenAI 兼容的第三方模型列表

-   **WHEN** 用户以 `openai-chat` 协议填入 `endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai'` 并点击 "Refresh"
-   **THEN** 系统 SHALL 请求 `https://generativelanguage.googleapis.com/v1beta/openai/models`,鉴权方式为 Bearer
-   **AND** 返回的对话模型(例如 `gemini-3.8-flash`)SHALL 出现在模型候选中

#### Scenario: 缺少 API Key 时不刷新

-   **WHEN** 该 ProviderConfig 的 `apiKey` 为空白
-   **THEN** 系统 SHALL 提示"API Key is required."且 SHALL NOT 发起请求

#### Scenario: 刷新失败或无结果

-   **WHEN** 刷新后过滤得到的列表为空(包括请求失败、4xx/5xx、第三方供应商无 `/models` 端点返回 404 / 405 等情况)
-   **THEN** 系统 SHALL 通过 toast 显示"Unable to fetch model list. Please enter the model name manually."
-   **AND** 该 ProviderConfig 的 `modelOptions` 与 `model`、`defaultProviderId`、`defaultModel` SHALL 保持不变
-   **AND** 用户 SHALL 仍能在设置页模型选择框中手动键入模型名,且 SHALL NOT 被阻止保存 ProviderConfig

#### Scenario: 刷新后更新默认模型

-   **WHEN** 刷新得到非空列表 `ids`
-   **THEN** 若 `defaultModel` 指向该 Provider 且其模型在 `ids` 中,`defaultModel` SHALL 保持不变
-   **AND** 若 `defaultModel` 指向该 Provider 但模型不在 `ids` 中,`defaultModel` SHALL 改为 `{ providerId, model: ids[0] }`
-   **AND** 若 `defaultModel` 为 `null` 且该 Provider 是当前使用的 Provider(`defaultProviderId` 指向它或为 `null`),SHALL 设为 `{ providerId, model: ids[0] }`;若 `defaultModel` 为 `null` 但当前使用的是其它 Provider,SHALL 保持 `null`;若 `defaultModel` 指向其它 Provider,SHALL 保持不变
-   **AND** `defaultProviderId` 为 `null` 时 SHALL 设为该 Provider 的 id

### Requirement: 模型过滤规则(对话/翻译用)

系统 SHALL 提供 `filterChatModels(ids: string[]): string[]` 工具函数,从模型 id 列表中**剔除**与对话/翻译能力无关的模型,保持其余 id 的原有顺序。系统 SHALL 剔除以下类别(正则匹配,大小写不敏感):

-   嵌入(embedding):匹配 `(^|[-/])(text-)?embedding($|[-/])`,例如 `text-embedding-3-small`、`gemini-embedding-001`
-   实时语音(realtime):匹配 `(^|[-/])realtime($|-)`,例如 `gpt-realtime`
-   音频(audio):匹配 `(^|[-/])audio($|-)`,例如 `gpt-audio`
-   转录(transcription):匹配 `^whisper(-|$)` 或 `(^|[-/])transcribe($|-)`,例如 `whisper-1`、`gpt-4o-transcribe`
-   审核(moderation):匹配 `(^|[-/])moderation($|-)`,例如 `omni-moderation-latest`
-   TTS:匹配 `^tts(-|$)` 或 `-tts($|-)`,例如 `tts-1`、`tts-1-hd`、`gpt-4o-mini-tts-2025-12-15`
-   图像生成:匹配 `^dall-e`、`^gpt-image` 或 `(^|[-/])image($|-)`,例如 `dall-e-3`、`gpt-image-1`、`chatgpt-image-latest`
-   视频生成:匹配 `(^|[-/])sora($|-)`,例如 `sora-2`
-   专用搜索:匹配 `-search-(preview|api)`,例如 `gpt-5-search-api`

系统 SHALL 采用**黑名单**而非白名单策略,使新发布的对话模型默认即可显示;系统 MUST NOT 因模型 id 不在已知列表中就将其过滤。

#### Scenario: 标准 OpenAI 列表过滤

-   **WHEN** 输入 `['gpt-5.6-sol', 'gpt-5.5', 'gpt-realtime', 'text-embedding-3-small', 'whisper-1', 'gpt-4o-mini-tts-2025-12-15', 'gpt-image-1', 'sora-2', 'omni-moderation-latest', 'gpt-6-astra']`
-   **THEN** `filterChatModels` SHALL 返回 `['gpt-5.6-sol', 'gpt-5.5', 'gpt-6-astra']`(顺序与原列表一致)

#### Scenario: 未知前缀的新模型保留

-   **WHEN** 输入包含 `'sonoma-translator-2099'`(未在任何黑名单分类中)
-   **THEN** 该 id SHALL 出现在返回结果中

#### Scenario: 大小写不敏感

-   **WHEN** 输入 `['Whisper-Large-V3', 'TTS-1-HD', 'GPT-5.6-SOL']`
-   **THEN** 返回 SHALL 仅含 `'GPT-5.6-SOL'`

### Requirement: Provider 表单校验

系统 SHALL 在设置页通过 Modal("Add Provider" / "Edit Provider")渲染 Provider 表单。表单 SHALL 只包含名称、协议选择(OpenAI Chat Completions / OpenAI Responses / Anthropic Messages)、API Key、Endpoint、当前协议的官方 endpoint 提示,以及点击 "Advanced" 后展开的 Extra headers JSON 输入框。表单 SHALL NOT 包含模型字段;模型选择与刷新在 Provider 列表与模型选择区域完成。

保存前系统 SHALL 校验:名称非空、API Key 非空、Endpoint 为空或为合法的 `http:` / `https:` URL、Extra headers 为空或为 JSON 对象(值转为字符串)。校验失败时 SHALL 阻止保存并以 toast 给出可读错误。名称、API Key、Endpoint SHALL 去除首尾空白后保存,空 Endpoint 保存为 `undefined`。

#### Scenario: 缺少名称或 API Key 阻止保存

-   **WHEN** 用户在 Provider 表单中留空名称或 API Key 后点击 "Save"
-   **THEN** 系统 SHALL 阻止保存
-   **AND** SHALL 提示"Provider name is required."或"API Key is required."

#### Scenario: 非法 Endpoint 或 Extra headers 阻止保存

-   **WHEN** 用户填入无法解析或非 http(s) 的 Endpoint,或 Extra headers 不是 JSON 对象
-   **THEN** 系统 SHALL 阻止保存并提示"Endpoint must be a valid URL."、"Extra headers must be valid JSON."或"Extra headers must be a JSON object."

#### Scenario: 编辑保留模型数据

-   **WHEN** 用户编辑一份已保存的 ProviderConfig 并保存
-   **THEN** 该条目的 `model` 与 `modelOptions` SHALL 保持原值
-   **AND** 编辑表单 SHALL NOT 自动调用 `listModels`

### Requirement: 设置页模型选择

系统 SHALL 在设置页 Provider 列表下方(至少存在一个 Provider 时)提供 "Model" 选择框。选项 SHALL 为当前使用中 Provider(`defaultModel.providerId`,缺省为 `defaultProviderId`)的 `model` 与 `modelOptions` 去重并按 `sortModelIds` 排序后的结果。选择框 SHALL 允许键入不在列表中的任意模型名(creatable)。

#### Scenario: 从列表选择模型

-   **WHEN** 用户在选择框中选中 `gpt-5.6-sol`
-   **THEN** `settings.defaultModel` SHALL 为 `{ providerId: <该 Provider id>, model: 'gpt-5.6-sol' }`
-   **AND** `settings.defaultProviderId` SHALL 同步为该 Provider id

#### Scenario: 手填的模型名生效

-   **WHEN** 用户在选择框中键入并创建 `my-internal-alias-2026`
-   **THEN** `settings.defaultModel.model` SHALL 为 `'my-internal-alias-2026'`,`providerId` 取当前 `defaultModel.providerId`(缺省为 `defaultProviderId`,再缺省为第一个 Provider)
-   **AND** 翻译请求 SHALL 使用该模型名

#### Scenario: 清空模型

-   **WHEN** 用户清空选择框
-   **THEN** `settings.defaultModel` SHALL 被设为 `null`
-   **AND** 思考与结构化输出控件 SHALL 处于禁用状态

### Requirement: 设置 UI:Provider 列表管理

系统 SHALL 在设置页 General 标签中提供 "LLM Providers" 区块,用户在此可以:

-   看到 `settings.providers` 中所有条目(每行显示 name;当前使用中的条目高亮并显示 "In use" 徽标)
-   通过 "Add" 按钮新增一份配置
-   通过每行的 "Edit" 编辑/重命名、通过删除图标按钮删除条目
-   通过每行的 "Refresh" 刷新该条目的模型列表
-   通过非当前条目上的 "Use" 按钮切换当前使用的 Provider

当前使用中的条目 SHALL 由 `defaultModel.providerId`(缺省为 `defaultProviderId`)决定。

#### Scenario: 切换使用的 Provider

-   **WHEN** 用户在某条 Provider 行点击 "Use",且该条目的 `modelOptions` 非空或 `model` 非空
-   **THEN** `settings.defaultProviderId` SHALL 被更新为该条 id
-   **AND** `settings.defaultModel` SHALL 被更新为 `{ providerId: 该条 id, model: modelOptions[0] ?? model }`
-   **AND** 该条目 SHALL 在 UI 上显示 "In use" 徽标

#### Scenario: 新增表单不含厂商模板

-   **WHEN** 用户在新增表单中选择协议 `openai-chat`
-   **THEN** 表单 SHALL 显示 "Official endpoint: https://api.openai.com/v1" 作为默认行为说明
-   **AND** SHALL NOT 显示 DeepSeek、Moonshot、Groq、Azure、Ollama 等第三方厂商模板
-   **AND** 用户 SHALL 可手动填写任意兼容 endpoint

### Requirement: 主界面模型切换

系统 SHALL 在主翻译界面提供模型下拉控件,选项为当前选中 Provider 的 `model` 与 `modelOptions` 去重排序后的结果;没有任何选项时 SHALL 不渲染该控件。主界面 SHALL NOT 提供跨 Provider 的切换控件。主界面中的选择 SHALL 立即生效,并同时写回且持久化 `settings.defaultProviderId` 与 `settings.defaultModel`。页脚 SHALL 显示"Provider: <name> · Model: <model>"。

#### Scenario: 主界面切换模型并持久化

-   **WHEN** 用户在主界面把模型下拉从 `gpt-5.5` 切到 `gpt-5.6-sol` 并触发一次翻译
-   **THEN** 该次 `translate` 调用 SHALL 使用当前 Provider 与 `gpt-5.6-sol`
-   **AND** `settings.defaultModel` SHALL 被持久化为该 Provider + `gpt-5.6-sol`,下次打开主界面时仍为该选择
-   **AND** 该次写入 history 的 `providerId` 与 `model` SHALL 为该 Provider id 与 `gpt-5.6-sol`

### Requirement: 新 App schema 初始化与旧字段清理

系统 SHALL 按新 App 处理 settings。读取 settings 时 SHALL 只从存储中读取当前 `ISettings` 字段(以及用于迁移 `nativeLanguage` 的 `defaultTargetLanguage`);首次读取缺省 settings 时 SHALL 初始化 `providers: []`、`defaultProviderId: null` 与 `defaultModel: null`。若持久化数据中存在旧字段(`apiKeys` / `apiURL` / `apiModel` / `provider` / `azureAPIKeys` / `miniMaxAPIKey` / `geminiAPIKey` / `moonshotAPIKey` / `deepSeekAPIKey` / `claudeAPIKey` / `ollamaAPIURL` / `kimiAccessToken` 等),系统 MUST NOT 将其转换为 ProviderConfig。写回 settings 时 SHALL 只写新 schema 字段,并 SHALL 从存储中移除已知旧字段 key 列表中的全部 key。

#### Scenario: 新安装初始化为空 Provider 列表

-   **WHEN** 用户首次安装并读取 settings
-   **THEN** `settings.providers` SHALL 为 `[]`
-   **AND** `settings.defaultProviderId` 与 `settings.defaultModel` SHALL 为 `null`
-   **AND** 主界面 SHALL 提示用户先在设置中添加 LLM Provider

#### Scenario: 旧 OpenAI 字段不迁移

-   **WHEN** 持久化 settings 中只有旧字段 `provider === 'OpenAI'`,`apiKeys === 'sk-xxx'`,`apiModel === 'gpt-5.5'`
-   **THEN** 读取后的 `settings.providers` SHALL 仍为 `[]`
-   **AND** 系统 SHALL NOT 创建 OpenAI ProviderConfig
-   **AND** 下次保存 settings 时 SHALL NOT 写回 `provider` / `apiKeys` / `apiModel`,并 SHALL 从存储中移除这些 key

#### Scenario: 旧 Azure 字段不迁移

-   **WHEN** 持久化 settings 中包含 `provider === 'Azure'` 或 `azureAPIKeys` / `azureAPIURL` / `azureAPIURLPath` / `azureAPIModel` 字段
-   **THEN** 读取后的 `settings.providers` SHALL 仍为 `[]`
-   **AND** 系统 SHALL NOT 创建 `openai-chat` ProviderConfig
-   **AND** 下次保存 settings 时 SHALL NOT 写回这些字段,并 SHALL 从存储中移除它们

#### Scenario: 未识别 Provider 直接丢弃

-   **WHEN** 持久化 settings 中 `provider === 'SomeLegacyProvider'`
-   **THEN** 系统 SHALL NOT 为其创建 ProviderConfig
-   **AND** SHALL NOT 尝试按 OpenAI 兼容协议兜底

#### Scenario: 已是新 schema 保持不变

-   **WHEN** settings 已含 `providers` 数组(无论空与否)
-   **THEN** 读取逻辑 SHALL 保留该数组与有效的 `defaultProviderId`
-   **AND** SHALL NOT 读取旧 Provider 字段覆盖新 schema

### Requirement: 浏览器扩展自定义 Endpoint 权限

浏览器扩展 manifest SHALL 只声明 `permissions: ['storage', 'contextMenus']`,固定 `host_permissions` 仅包含官方 LLM endpoint(`https://api.openai.com/*`、`https://api.anthropic.com/*`)以及内置 TTS / 语言检测所需的域名,并以 `optional_host_permissions: ['http://*/*', 'https://*/*']` 覆盖自定义 endpoint。系统 MUST NOT 声明 `webRequest` 权限,MUST NOT 保留 ChatGPT Arkose / Kimi / ChatGLM token 捕获逻辑。

扩展中经后台转发的每个网络请求(包括模型刷新与翻译)SHALL 先从请求 URL 计算 origin(`<scheme>://<host>[:port]/*`,仅限 http / https);若扩展尚无该 origin 权限,SHALL 调用 `permissions.request({ origins: [origin] })`;若用户拒绝,系统 SHALL 以 `NotAllowedError`("Host permission denied for <origin>")拒绝该请求,且 SHALL NOT 发起网络请求。桌面端与 userscript 不走此授权流程。

由用户点击触发的操作(Provider 表单的 "Save" 与 Provider 行的 "Refresh")SHALL 在点击处理函数中、任何其它 `await` 之前,直接调用扩展页面的 `browser.permissions.request`(Chromium 为 `chrome.permissions.request`)请求该 Provider 自定义 endpoint 的 origin,使 Firefox 仍处于用户手势上下文中。已授权的 origin SHALL NOT 弹出提示;endpoint 为空(使用官方默认 endpoint)或当前页面没有 `permissions` API(桌面端、userscript、content script)时 SHALL 视为无需授权。"Save" SHALL 不等待授权结果即保存配置,被拒绝时以 toast 提示"Permission to access this endpoint was denied.";"Refresh" SHALL 等待授权结果,被拒绝或请求失败时以 toast 提示同一文案且 SHALL NOT 发起模型列表请求。

#### Scenario: 自定义 endpoint 首次请求授权

-   **WHEN** 用户在 Chromium 或 Firefox 扩展中配置 `endpoint: 'https://api.example.com/v1'` 并点击 "Refresh"
-   **THEN** 系统 SHALL 从 endpoint 计算 origin `https://api.example.com/*`
-   **AND** SHALL 在点击处理函数的第一个 `await` 处调用 `permissions.request({ origins: ['https://api.example.com/*'] })`
-   **AND** 授权通过后才发起 `GET https://api.example.com/v1/models`

#### Scenario: 保存 Provider 时请求授权

-   **WHEN** 用户在 Firefox 扩展的 Provider 表单中填入 `endpoint: 'https://api.example.com/v1'` 并点击 "Save"
-   **THEN** 系统 SHALL 在该点击中同步调用 `permissions.request({ origins: ['https://api.example.com/*'] })`
-   **AND** 无论授权结果如何,SHALL 保存该 ProviderConfig

#### Scenario: 用户拒绝自定义 endpoint 权限

-   **WHEN** `permissions.request` 返回未授权
-   **THEN** 系统 SHALL NOT 发起模型刷新或翻译的网络请求
-   **AND** 模型刷新 SHALL 提示"Permission to access this endpoint was denied.",且该 Provider 的 `modelOptions` SHALL 保持不变
-   **AND** 翻译 SHALL 以包含"Host permission denied for <origin>"的错误结束

#### Scenario: 旧 webRequest token 捕获已移除

-   **WHEN** 在 `src/` 中检索 `webRequest`、`Arkose`、`keyKimiAccessToken`、`keyChatGLMAccessToken`
-   **THEN** SHALL NOT 存在相关监听器或 token 存储逻辑

### Requirement: 模型思考控制表单

系统 SHALL 在 Provider 表单之外、设置页模型选择区域中提供当前 Provider + Model 的输出控制表单。该表单 SHALL 包含"启用思考(Thinking Enabled)"开关和一个与协议无关的"思考强度(Thinking Effort)"下拉框，选项 SHALL 仅为 Low、Medium、High，并保存到当前 ProviderModelOutputControls 的 `reasoningEffort`。没有选中模型(`defaultModel` 为 `null`)时，这些控件 SHALL 处于禁用状态。

这三档是当前主流 OpenAI、Anthropic、Gemini 推理模型普遍接受的取值。系统 SHALL NOT 提供 `none`、`minimal`、`xhigh` 或 `max` 等选项:它们并非所有模型都接受，且对翻译任务没有收益。

系统 SHALL 始终保留用户为当前 Provider + Model 配置的 effort 字段，但只有 `thinkingEnabled === true` 时才会发送到上游。表单 SHALL 显示简短说明，告知用户关闭思考时"始终推理"的模型会以最低强度运行，并说明 OpenAI reasoning 推荐使用 `openai-responses` 协议。

#### Scenario: 调整思考强度

-   **WHEN** 当前模型引用的 Provider 为任意协议(`openai-chat`、`openai-responses` 或 `anthropic`)
-   **THEN** 系统 SHALL 提供 `thinkingEnabled` 开关与同一个 Thinking Effort 控件
-   **AND** 修改后 SHALL 更新当前 Provider + Model 的 ProviderModelOutputControls 中的 `thinkingEnabled` 与 `reasoningEffort`

### Requirement: Provider + Model 输出控制数据结构

系统 SHALL 以 Provider id 与模型名的组合持久化模型输出控制，结构如下:

```ts
interface ProviderModelOutputControls {
    providerId: string
    model: string
    thinkingEnabled?: boolean
    reasoningEffort?: 'low' | 'medium' | 'high'
    useStructuredOutput?: boolean
    useStrictSchema?: boolean
}
```

`ISettings` SHALL 通过 `providerModelOutputControls?: ProviderModelOutputControls[]` 保存这些记录。每条记录 SHALL 只适用于完全匹配的 `providerId + model` 组合。缺少记录、记录字段缺失、或首次从旧版本 App 迁移时，系统 SHALL 按关闭思考与关闭结构化输出处理。归一化时 SHALL 丢弃 `providerId` 不指向现存 Provider 或 `model` 为空白的记录。

当 `thinkingEnabled !== true` 时，系统 SHALL 忽略保存的 `reasoningEffort`;对于省略 effort 时仍会推理的模型，协议适配层 SHALL 改为发送该模型可接受的最低强度(见 translation-core 各协议要求)，其余模型 SHALL 不发送 reasoning / thinking 参数。`reasoningEffort` 缺失时 SHALL 使用 `'medium'` 作为 UI 默认值。归一化时 SHALL 丢弃不在 `low` / `medium` / `high` 内的值，以及旧字段 `openaiReasoningEffort` / `anthropicThinkingEffort`,不做迁移。`useStructuredOutput !== true` 时，系统 SHALL 不发送结构化输出参数；`useStrictSchema` 仅在 `useStructuredOutput === true` 时生效，缺失时 SHALL 按严格 JSON Schema 开启显示和发送。

当用户首次为某个 Provider + Model 启用 Thinking 或 Structured Output 时，系统 SHALL 保存 UI 中显示的默认值：`reasoningEffort` 为 `'medium'`、Strict JSON Schema 为 `true`。

#### Scenario: 缺少 Provider + Model 记录

-   **WHEN** 当前 Provider id 与模型名没有匹配的 ProviderModelOutputControls
-   **THEN** 系统 SHALL 视为 `thinkingEnabled !== true`
-   **AND** SHALL 视为 `useStructuredOutput !== true`
-   **AND** 翻译请求 SHALL NOT 包含 structured output 参数
-   **AND** reasoning / thinking 参数 SHALL 仅为关闭思考时的最低强度(若该模型需要)

#### Scenario: 首次迁移不继承旧全局结构化输出

-   **WHEN** 旧设置中存在 `useStructuredOutput: true` 或 `useStrictSchema: true`，但没有 ProviderModelOutputControls 记录
-   **THEN** 归一化后的运行时行为 SHALL 按该 Provider + Model 没有启用结构化输出处理
-   **AND** 系统 SHALL NOT 自动创建启用结构化输出的 ProviderModelOutputControls 记录

#### Scenario: 首次迁移不继承旧默认模型思考

-   **WHEN** 旧设置中 `defaultModel` 包含 `thinkingEnabled: true`，但没有 ProviderModelOutputControls 记录
-   **THEN** 归一化后的运行时行为 SHALL 按该 Provider + Model 没有启用思考处理
-   **AND** 系统 SHALL NOT 自动创建启用思考的 ProviderModelOutputControls 记录

#### Scenario: 关闭开关优先于保存的 effort 字段

-   **WHEN** ProviderModelOutputControls 设置了 `thinkingEnabled: false` 与 `reasoningEffort: 'high'`
-   **THEN** 请求 SHALL NOT 发送 `'high'`
-   **AND** 对 `claude-sonnet-4-6`、`gemini-3.5-flash-lite` 这类省略 effort 即不推理的模型，请求 SHALL NOT 包含 `reasoning_effort`、`reasoning`、`thinking` 或 `output_config.effort`

#### Scenario: 丢弃旧 effort 字段与无效取值

-   **WHEN** 持久化记录包含 `openaiReasoningEffort` / `anthropicThinkingEffort`，或 `reasoningEffort` 为 `'xhigh'`、`'max'`、`'none'`、`'minimal'` 等不在三档内的值
-   **THEN** 归一化后的记录 SHALL NOT 包含这些字段或取值
-   **AND** 启用思考时 SHALL 回落到默认 `'medium'`

#### Scenario: 重复记录归一化

-   **WHEN** 持久化数据中存在多条相同 `providerId + model` 的 ProviderModelOutputControls
-   **THEN** 归一化后的设置 SHALL 只保留一条该组合的记录
-   **AND** 字段值 SHALL 以最后一条有效记录为准

#### Scenario: 自定义模型记录保留

-   **WHEN** ProviderModelOutputControls 的 `providerId` 仍存在且 `model` 是非空字符串，但该模型名不在 ProviderConfig.modelOptions 中
-   **THEN** 归一化 SHALL 保留该记录
-   **AND** SHALL NOT 仅因为模型列表刷新未返回该模型就删除用户手动配置的输出控制

#### Scenario: 删除 Provider 时清理记录

-   **WHEN** 用户删除一份 ProviderConfig,或持久化记录的 `providerId` 已不对应任何 Provider
-   **THEN** 该 `providerId` 的 ProviderModelOutputControls 记录 SHALL NOT 出现在归一化或保存后的设置中
