# Spec Delta

## MODIFIED Requirements

### Requirement: 翻译输入与输出

界面 SHALL 将流式增量缓存在当前请求内，按最多每 100ms 一次刷新合并文本，避免每个 chunk 都触发整个结果区渲染。进行中的完整文本快照 SHALL 替换当前请求文本并遵守同一刷新节流；请求结束 SHALL 立即刷新；成功缓存与历史 SHALL 包含尚未刷新的尾部文本。失败或停止时 SHALL 保留当前请求的部分文本，但不缓存；旧请求的计时器与回调 SHALL NOT 覆盖新请求。

系统 SHALL 接受一段源文本与一组语言参数(源语言、目标语言),通过解析出的 LLM Provider 与模型发起请求,并以流式方式逐增量回写翻译结果。源文本 SHALL 被视为不可信数据,并按"源文本作为不可信数据与提示注入隔离"需求进行角色分层与 nonce 边界包裹;翻译指令 SHALL NOT 与源文本置于同一消息信任层。

`translate(query)` 的 `query` SHALL 包含 `text`、`detectFrom`、`detectTo`、`signal`、`onMessage`、`onError`、`onFinish`,并可选包含 `providerId`、`model` 与 `onStatusCode`。`onFinish` 的 `reason` SHALL 为以下之一:协议给出的正常结束原因(`stop`,或 OpenAI Chat 的 `finish_reason` 原值)、`max_tokens`(截断)、`error`、`aborted`。

Provider 解析顺序 SHALL 为 `query.providerId` → `settings.defaultModel.providerId` → `settings.defaultProviderId`;模型解析顺序 SHALL 为 `query.model` → `settings.defaultModel.model`(仅当 `settings.defaultModel.providerId` 等于解析出的 Provider id 时)→ 该 Provider 自身的 `ProviderConfig.model`。`settings.defaultModel.model` SHALL NOT 用于其它 Provider。该规则由 `translate.ts` 导出的 `resolveTranslationModel` 实现,翻译界面 SHALL 用同一函数解析本次请求的 providerId 与模型,并把解析结果同时用于输出控制解析、缓存 key、`translate` 调用与历史记录,使缓存 key 与实际请求一致。

#### Scenario: 普通文本翻译

-   **WHEN** 用户在主输入框输入一段非空文本并触发翻译
-   **THEN** 系统 SHALL 调用 `translate({ text, detectFrom, detectTo, providerId, model, signal, onMessage, onError, onFinish })`
-   **AND** 流式 chunk 抵达时 SHALL 通过 `onMessage` 更新结果区；普通文本增量追加，结构化纯文本快照替换
-   **AND** 正常结束时 SHALL 调用一次 `onFinish('stop')`

#### Scenario: 用户中断翻译

-   **WHEN** 翻译进行中用户点击"停止"按钮,或翻译组件卸载
-   **THEN** 系统 SHALL 调用关联 `AbortController.abort()`
-   **AND** 当前 LLM 请求 SHALL 被取消
-   **AND** `onFinish` SHALL 以 `'aborted'` 被调用
-   **AND** 由"停止"按钮触发时,界面状态 SHALL 显示为已停止

#### Scenario: 源语言来自检测或用户选择

-   **WHEN** 用户提交翻译
-   **THEN** 系统 SHALL 使用 language-detection 能力检测出的语言代码作为 `detectFrom`,用户手动切换源语言时 SHALL 使用所选语言
-   **AND** `detectFrom` SHALL 是具体的语言代码,系统 SHALL NOT 传入 `auto` 之类的占位值

#### Scenario: 默认模型属于其它 Provider

-   **WHEN** `settings.defaultModel` 指向 Provider B + Model Y,调用方传入 `providerId: 'provider-a'` 但未传入 `model`
-   **THEN** 系统 SHALL 使用 Provider A 自身的 `ProviderConfig.model`
-   **AND** SHALL NOT 把 Model Y 发送给 Provider A

#### Scenario: 默认模型属于同一 Provider

-   **WHEN** `settings.defaultModel` 指向 Provider A + Model X,调用方传入 `providerId: 'provider-a'` 但未传入 `model`
-   **THEN** 系统 SHALL 使用 Model X

#### Scenario: 没有可用 Provider

-   **WHEN** 解析出的 providerId 在 `settings.providers` 中不存在
-   **THEN** 系统 SHALL 调用 `onError('No LLM Provider configured. Please add a provider in settings.')`
-   **AND** SHALL 调用 `onFinish('error')`,SHALL NOT 发起网络请求

#### Scenario: 没有可用模型

-   **WHEN** Provider 存在但解析出的模型为空
-   **THEN** 系统 SHALL 调用 `onError('No model selected. Please select a model in settings.')`
-   **AND** SHALL 调用 `onFinish('error')`,SHALL NOT 发起网络请求

#### Scenario: 指令与源文本分层

-   **WHEN** 系统为任意非空源文本构建翻译请求
-   **THEN** 翻译指令 SHALL 进入该协议的系统/指令通道
-   **AND** 源文本 SHALL 以随机 nonce 边界包裹后进入 `user`/`input` 数据区
-   **AND** 请求 SHALL NOT 把源文本拼接进系统/指令通道

### Requirement: 翻译失败处理

浏览器扩展请求若在首次响应前失去后台连接 SHALL 拒绝请求 Promise；主动取消 SHALL 使用 `AbortError`，其它断开 SHALL 提供可读错误。连接建立失败亦 SHALL 结束请求，不得永久等待。

桌面流式请求 SHALL 在两个事件监听器注册完成后开始网络请求。成功、失败及取消时 SHALL 注销所有监听器（包括清理后才完成注册的监听器），并移除取消监听。已取消的请求 SHALL 以 `AbortError` 结束且不再启动网络请求。

#### Scenario: 注册期间取消桌面请求

- **WHEN** 用户在流式事件监听器尚未注册完成时取消请求
- **THEN** 请求 SHALL 结束，迟到的监听器 SHALL 立即注销
- **AND** SHALL NOT 发起对应网络请求

系统 SHALL 捕获 LLM 调用过程中的网络错误、非 200 状态码、流内错误事件与流解析错误,通过 `onError` 上报可读错误消息并以 `onFinish('error')` 结束;系统 SHALL NOT 静默吞掉错误,除 structured-output 的“Structured Output Streaming Transport Fallback”允许的唯一一次非流式重试外 SHALL NOT 自动重试,SHALL NOT 自动切换到其它 Provider。允许 fallback 的中间能力错误 SHALL NOT 调用 `onError` 或 `onFinish`，但 SHALL 继续报告 `onStatusCode`；fallback 失败时 SHALL 报告最终尝试的错误。错误消息 SHALL 依次取上游响应体或错误事件中的 `error.message`、`message`(OpenAI Responses 先取 `response.error.message`,OpenAI Chat 最后取 `detail`),都取不到时为 `Unknown error`。

界面层 SHALL 按结束原因展示状态:`stop` / `end_turn` / `eos` 视为成功;`length` / `max_tokens` 以"字数超限"toast 提示并保留已输出的译文;`content_filter` 显示 i18n key "The model provider blocked this request with its content filter." 对应的内容过滤提示;界面提示文案 SHALL 全部通过 i18n key 输出;其它原因显示为失败。以失败结束且此前已通过 `onError` 上报错误消息时,界面 SHALL 继续显示该错误消息,SHALL NOT 用 `finish_reason` 之类的通用文本覆盖它;仅在没有收到 `onError` 时才显示包含结束原因的通用失败文本。

#### Scenario: 鉴权失败

-   **WHEN** Provider 返回 401
-   **THEN** 系统 SHALL 通过 `onStatusCode(401)` 上报状态码
-   **AND** SHALL 通过 `onError` 上报上游返回的错误消息(如响应体 `error.message`)
-   **AND** SHALL 调用 `onFinish('error')`

#### Scenario: 界面显示可读错误消息

-   **WHEN** 引擎调用 `onError('The model refused to answer (cyber).')`,随后调用 `onFinish('error')`
-   **THEN** 界面 SHALL 显示 `The model refused to answer (cyber).`
-   **AND** SHALL NOT 将其替换为 `Error failed, finish_reason: error` 之类的通用文本

#### Scenario: 网络中断

-   **WHEN** 流式请求中途网络断开
-   **THEN** 系统 SHALL 通过 `onError` 上报错误并调用 `onFinish('error')`
-   **AND** SHALL NOT 自动重试或切换到其它 provider

### Requirement: OpenAI Chat Completions 翻译协议

结构化输出的传输与显示 SHALL 遵守 structured-output 规范：默认 `stream: true`，仅在明确不支持流式且满足其条件时允许一次 `stream: false` 重试，也接受初次请求直接返回完整 JSON 的响应。下文逐增量 `onMessage` 的原文转发场景仅适用于非结构化模式；结构化模式 SHALL 输出解析后的纯文本快照并在终结前校验完整 JSON。截断原因只有在结构化 JSON 校验通过时才保留；校验失败 SHALL 以 `error` 结束。

系统 SHALL 在 `provider.protocol === 'openai-chat'` 时调用 OpenAI Chat Completions 兼容协议。请求 SHALL 以 POST 发往按 llm-provider-config 的 Endpoint 归一化规则得到的 `…/chat/completions`(endpoint 留空时为 `https://api.openai.com/v1/chat/completions`),使用 `Authorization: Bearer <apiKey>` 与 `Content-Type: application/json`,并合并 Provider 的 `extraHeaders`。首次请求体 SHALL 包含 `model`、翻译 prompt 组成的 `messages`、`stream: true`,SHALL NOT 包含 `temperature`、`top_p` 或 `stream_options`。
当当前 Provider + Model 的 ProviderModelOutputControls 中 `thinkingEnabled === true` 时,系统 SHALL 将 `reasoningEffort ?? 'medium'` 作为顶层 `reasoning_effort` 传入请求体。
当 `thinkingEnabled !== true` 或没有匹配的 ProviderModelOutputControls 时,系统 SHALL NOT 发送用户保存的 `reasoningEffort`,而是按"OpenAI 协议关闭思考时的最低 effort"要求决定 `reasoning_effort`。
系统 SHALL 从 SSE `data:` 行解析 JSON chunk,只读取 `choices[0]`,把 `delta.content` 经过 thinking 内容过滤后的文本增量传给 `onMessage`,先识别 `error` envelope：满足 structured-output 流式 fallback 条件时 SHALL 重试一次且不终结逻辑请求，其余错误 SHALL 走终态错误路径；只有非错误 chunk 的 `choices` 为空或缺失时 SHALL 忽略。同一个 chunk 同时带 `delta.content` 与 `finish_reason` 时,系统 SHALL 先输出该内容再结束。系统 SHALL 在收到 `data: [DONE]` 时以 `onFinish('stop')` 结束,在收到 `finish_reason` 时以其原值调用 `onFinish`(界面把 `length` 视为截断)。拒答按"错误处理与模型拒绝 (Refusal)"需求累积并在流结束时上报。
系统 SHALL 仅转发 `delta.content`,并忽略部分 OpenAI-compatible 服务返回的非标准 `reasoning_content` 字段。

#### Scenario: Chat Completions 文本增量

-   **WHEN** 上游返回 SSE `data: {"choices":[{"delta":{"content":"你"}}]}`
-   **THEN** 系统 SHALL 调用 `onMessage("你")`

#### Scenario: Chat Completions 携带 Reasoning Effort

-   **WHEN** 当前 Provider + Model 的 ProviderModelOutputControls 设置了 `thinkingEnabled: true` 与 `reasoningEffort: 'high'`
-   **THEN** 发送的请求体 SHALL 包含 `reasoning_effort: 'high'`

#### Scenario: Chat Completions 开启思考但未选 effort

-   **WHEN** ProviderModelOutputControls 设置了 `thinkingEnabled: true` 且没有 `reasoningEffort`
-   **THEN** 发送的请求体 SHALL 包含 `reasoning_effort: 'medium'`

#### Scenario: Chat Completions 关闭开关优先

-   **WHEN** 当前模型为 `gpt-5.6-sol`,ProviderModelOutputControls 设置了 `thinkingEnabled: false` 与 `reasoningEffort: 'high'`
-   **THEN** 发送的请求体 SHALL 包含 `reasoning_effort: 'none'`,SHALL NOT 使用保存的 `'high'`

#### Scenario: Chat Completions 缺少控制记录

-   **WHEN** 当前模型为 `gpt-5.6-sol` 且没有 ProviderModelOutputControls 记录
-   **THEN** 发送的请求体 SHALL 包含 `reasoning_effort: 'none'`

#### Scenario: Chat Completions 非标准 reasoning 字段

-   **WHEN** 流式返回的 chunk 包含 `choices[0].delta.reasoning_content`
-   **THEN** 系统 SHALL 忽略该字段,不在 `onMessage` 呈现给最终用户

#### Scenario: Chat Completions DONE

-   **WHEN** 上游返回 `data: [DONE]`
-   **THEN** 系统 SHALL 调用 `onFinish('stop')`

#### Scenario: Chat Completions 末段内容与 finish_reason 同包

-   **WHEN** 上游返回 `data: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}]}`
-   **THEN** 系统 SHALL 先调用 `onMessage("好")`
-   **AND** 再调用一次 `onFinish('stop')`

#### Scenario: Chat Completions 空 choices chunk

-   **WHEN** 上游返回不含错误的 `choices: []` chunk(如 usage chunk)
-   **THEN** 系统 SHALL 忽略该 chunk 的文本输出
-   **AND** SHALL NOT 抛出流解析错误

#### Scenario: Chat 完整响应解码

- **WHEN** 结构化请求收到完整 Chat JSON 响应
- **THEN** 系统 SHALL 读取 `choices[0].message.content`，并优先处理 `message.refusal`，沿用 `finish_reason` 语义
- **AND** SHALL NOT 把响应 envelope 或 reasoning 内容显示为译文

### Requirement: OpenAI Responses 翻译协议

结构化输出的传输与显示 SHALL 遵守 structured-output 规范：默认 `stream: true`，仅在明确不支持流式且满足其条件时允许一次 `stream: false` 重试，也接受初次请求直接返回完整 JSON 的响应。下文逐增量 `onMessage` 的原文转发场景仅适用于非结构化模式；结构化模式 SHALL 输出解析后的纯文本快照并在终结前校验完整 JSON。截断原因只有在结构化 JSON 校验通过时才保留；校验失败 SHALL 以 `error` 结束。

系统 SHALL 在 `provider.protocol === 'openai-responses'` 时调用 OpenAI Responses API。请求 SHALL 以 POST 发往按 Endpoint 归一化规则得到的 `…/responses`(endpoint 留空时为 `https://api.openai.com/v1/responses`),使用 `Authorization: Bearer <apiKey>` 与 `Content-Type: application/json`,并合并 Provider 的 `extraHeaders`。首次请求体 SHALL 包含 `model`、`instructions`(翻译指令)、`input`(nonce 包裹的源文本字符串)、`store: false`、`stream: true`,SHALL NOT 包含 `temperature` 或 `top_p`。Responses API 默认存储响应,`store: false` 使一次性翻译不进入 OpenAI 的响应存储。
当当前 Provider + Model 的 ProviderModelOutputControls 中 `thinkingEnabled === true` 时,系统 SHALL 将 `reasoningEffort ?? 'medium'` 映射至 `reasoning: { effort: ... }`。当 `thinkingEnabled !== true` 或没有匹配记录时,系统 SHALL 按"OpenAI 协议关闭思考时的最低 effort"要求决定 `reasoning.effort`。
系统 SHALL NOT 设置 `reasoning.summary`,也 SHALL NOT 设置 `include: ["reasoning.encrypted_content"]`,因为本功能不展示或保留 OpenAI reasoning 内容。
系统 SHALL 按 SSE data 中的 `type` 处理 Responses 流事件:只把 `response.output_text.delta` 的 `delta` 文本经过 thinking 内容过滤后传给 `onMessage`;在 `response.completed` 时以 `onFinish('stop')` 结束。`response.incomplete` 且 `response.incomplete_details.reason === 'max_output_tokens'` 时,系统 SHALL 保留已输出的文本并以 `onFinish('max_tokens')` 结束;其它 `response.incomplete`(如 `content_filter`) SHALL 走错误路径；`response.failed` 与 `error` 事件 SHALL 先判断 structured-output 流式 fallback 例外，满足时重试一次且不终结逻辑请求，其余情况 SHALL 走终态错误路径。拒答文本 SHALL 只从 `response.refusal.delta` 累积(忽略 `response.refusal.done`),并在 `response.completed` 时作为错误上报;未收到增量时 SHALL 从 `response.completed` 的 `response.output[].content[]` 中 `type === 'refusal'` 的条目读取。系统 SHALL 忽略其它事件,包括 reasoning summary 或 encrypted reasoning 相关事件。

#### Scenario: Responses 文本增量

-   **WHEN** 上游返回 `type: 'response.output_text.delta'` 且 `delta === "好"`
-   **THEN** 系统 SHALL 调用 `onMessage("好")`

#### Scenario: Responses 携带 Reasoning Effort

-   **WHEN** 当前 Provider + Model 的 ProviderModelOutputControls 设置了 `thinkingEnabled: true` 与 `reasoningEffort: 'high'`
-   **THEN** 发送的请求体 SHALL 包含 `reasoning: { effort: 'high' }`
-   **AND** SHALL NOT 包含顶层 `reasoning_effort`
-   **AND** SHALL NOT 包含 `reasoning.summary` 或 `include: ["reasoning.encrypted_content"]`

#### Scenario: Responses 关闭开关优先

-   **WHEN** 当前模型为 `gpt-5.5`,ProviderModelOutputControls 设置了 `thinkingEnabled: false` 与 `reasoningEffort: 'high'`
-   **THEN** 发送的请求体 SHALL 包含 `reasoning: { effort: 'none' }`,SHALL NOT 使用保存的 `'high'`

#### Scenario: Responses 缺少控制记录

-   **WHEN** 当前模型为 `gpt-6-astra` 且没有 ProviderModelOutputControls 记录
-   **THEN** 发送的请求体 SHALL 包含 `reasoning: { effort: 'low' }`

#### Scenario: Responses 不存储响应

-   **WHEN** 系统发送任意 Responses 请求
-   **THEN** 请求体 SHALL 包含 `store: false`

#### Scenario: Responses 完成事件

-   **WHEN** 上游返回 `type: 'response.completed'` 且此前没有拒答
-   **THEN** 系统 SHALL 调用 `onFinish('stop')`

#### Scenario: Responses 因 max_output_tokens 截断

-   **WHEN** 上游输出部分文本后返回 `response.incomplete`,`incomplete_details.reason` 为 `max_output_tokens`
-   **THEN** 系统 SHALL 保留已输出的文本
-   **AND** SHALL 调用 `onFinish('max_tokens')`,SHALL NOT 调用 `onError`

#### Scenario: Responses 拒答不重复累积

-   **WHEN** 上游依次返回 `response.refusal.delta`(`delta: 'refused'`)、`response.refusal.done`(`refusal: 'refused'`)以及 output 中含同一拒答的 `response.completed`
-   **THEN** 系统 SHALL 调用 `onError('refused')`
-   **AND** SHALL 调用 `onFinish('error')`

#### Scenario: Responses 错误事件

-   **WHEN** 上游返回不满足 structured-output 流式 fallback 条件的 `error`、`response.failed`,或 `incomplete_details.reason` 不是 `max_output_tokens` 的 `response.incomplete`
-   **THEN** 系统 SHALL 调用 `onError` 与 `onFinish('error')`

#### Scenario: Responses 完整响应解码

- **WHEN** 结构化请求收到完整 Responses JSON 响应
- **THEN** 系统 SHALL 检查 `status`、`error` 与 `incomplete_details`，只拼接 `output` 中 message 的 `content` 中 `type: 'output_text'` 的文本，并优先处理 refusal 项
- **AND** `completed` SHALL 正常校验完成，`incomplete` 的 `max_output_tokens` SHALL 沿用截断规则，其它非成功状态 SHALL 走错误路径
- **AND** SHALL NOT 依赖 SDK 派生的顶层 `output_text` 或显示 reasoning 内容

### Requirement: Anthropic Messages 翻译协议

结构化输出的传输与显示 SHALL 遵守 structured-output 规范：默认 `stream: true`，仅在明确不支持流式且满足其条件时允许一次 `stream: false` 重试，也接受初次请求直接返回完整 JSON 的响应。下文逐增量 `onMessage` 的原文转发场景仅适用于非结构化模式；结构化模式 SHALL 输出解析后的纯文本快照并在终结前校验完整 JSON。截断原因只有在结构化 JSON 校验通过时才保留；校验失败 SHALL 以 `error` 结束。

系统 SHALL 在 `provider.protocol === 'anthropic'` 时调用 Anthropic Messages API。请求 SHALL 以 POST 发往按 Endpoint 归一化规则得到的 `…/v1/messages`(endpoint 留空时为 `https://api.anthropic.com/v1/messages`),使用 `x-api-key: <apiKey>`、`anthropic-version: 2023-06-01` 与 `Content-Type: application/json`,并合并 Provider 的 `extraHeaders`。首次请求体 SHALL 包含 `model`、`max_tokens`、顶层 `system`(翻译指令)、仅含一条 `user` 消息的 `messages`、`stream: true`;SHALL NOT 包含 `temperature`、`top_p` 或 assistant 预填消息。思考深度 SHALL 只通过原生 API 参数控制,不得在 system prompt 中注入"详细思考"或"不要思考"之类的指令。

模型匹配前 SHALL 先转为小写并把 `.` 替换为 `-`,且模式 SHALL 可出现在 id 的任意位置,以覆盖 `anthropic/claude-sonnet-4.5`、`us.anthropic.claude-…`、`claude-…@日期` 等网关写法。系统 SHALL 按模型分为三类:

-   **Manual 模式**(`claude-haiku-4-5*`、`claude-sonnet-4-5*`、`claude-opus-4-5*`,以及 `claude-sonnet-4` / `claude-opus-4` 的 `-0`、`-YYYYMMDD`、`@…` 形式或无后缀形式):启用思考时请求体 SHALL 包含 `thinking: { type: 'enabled', budget_tokens: X }`,SHALL NOT 发送 `thinking.display` 或 `output_config.effort`(这些模型不支持这两个字段)。
-   **始终推理模型**(`claude-opus-5*`、`claude-sonnet-5*`、`claude-fable-5*`、`claude-mythos-5*`):省略 `thinking` 时也会推理,其中 Opus 5.5、Sonnet 5.5 与 Fable 拒绝 `{ type: 'disabled' }`。关闭思考时请求体 SHALL NOT 包含 `thinking`,SHALL 发送 `output_config: { effort: 'low' }`,`max_tokens` 为 `64000`。
-   **其它模型**(如 `claude-opus-4-6/4-7/4-8`、`claude-sonnet-4-6`):关闭思考时请求体 SHALL NOT 包含 `thinking` 与 `output_config.effort`(这些模型省略 `thinking` 即不思考)。

除 Manual 模式外,启用思考时 SHALL 走 Adaptive 模式:请求体包含 `thinking: { type: 'adaptive', display: 'omitted' }` 与 `output_config: { effort: reasoningEffort }`。`thinking.display` 从 Opus 4.7 起才支持,因此对 `claude-opus-4-6*` / `claude-sonnet-4-6*` SHALL 只发送 `thinking: { type: 'adaptive' }`。

`reasoningEffort ?? 'medium'` 的映射如下;三档在所有 Adaptive 模型上都有效,无需按模型降级:

| reasoningEffort | Adaptive `effort` | Manual `budget_tokens` |
| --------------- | ----------------- | ---------------------- |
| `low`           | `low`             | `1024`                 |
| `medium`        | `medium`          | `4096`                 |
| `high`          | `high`            | `16000`                |

`max_tokens` SHALL 为:Adaptive 模式与始终推理模型 `64000`;关闭思考的其它模型与 Manual 模式 `32000`。这些路径覆盖的模型中输出上限最小的是 Opus 4(32K),所以不得超过它,同时为译文留出足够预算。

`thinking.display: 'omitted'` 让服务端不返回思考文本,缩短首字延迟,计费不变。不支持该字段的模型(Manual 模式与 4.6)会流式返回思考文本,由客户端忽略 `thinking_delta` 处理,代理不认该字段时同理。

系统 SHALL 从 SSE 解析事件,仅把 `content_block_delta` 中 `delta.type === 'text_delta'` 的 `delta.text` 经过 thinking 内容过滤后传给 `onMessage`,忽略 `ping`、`delta.type === 'thinking_delta'`、`delta.type === 'signature_delta'`、`content_block_start` / `content_block_stop` 中 `content_block.type === 'thinking'` 的块与未知事件;在 `message_stop` 时结束；在 `error` 事件时 SHALL 先判断 structured-output 流式 fallback 例外，满足时重试一次且不终结逻辑请求，其余情况 SHALL 走终态错误路径。系统 SHALL 从事件的 `delta.stop_reason`(或 `message.stop_reason`)记录最近一次 `stop_reason`;`stop_reason === 'max_tokens'` 时 SHALL 在随后的 `message_stop` 以 `onFinish('max_tokens')` 结束,其它情况以 `onFinish('stop')` 结束。

#### Scenario: Anthropic 文本增量

-   **WHEN** 上游返回 event `content_block_delta` 且 data 中 `delta: { type: 'text_delta', text: '好' }`
-   **THEN** 系统 SHALL 调用 `onMessage("好")`

#### Scenario: Anthropic 关闭开关优先

-   **WHEN** 当前模型为 `claude-sonnet-4-6`,ProviderModelOutputControls 设置了 `thinkingEnabled: false` 与 `reasoningEffort: 'high'`
-   **THEN** 请求体 SHALL NOT 包含 `thinking` 或 `output_config.effort`
-   **AND** `max_tokens` SHALL 为 `32000`

#### Scenario: 始终推理模型关闭思考

-   **WHEN** 当前模型为 `claude-opus-5-5`、`claude-sonnet-5-5` 或 `claude-fable-5-1`,且 `thinkingEnabled !== true`
-   **THEN** 请求体 SHALL NOT 包含 `thinking`
-   **AND** SHALL 包含 `output_config: { effort: 'low' }` 与 `max_tokens: 64000`

#### Scenario: 忽略原生 thinking 增量

-   **WHEN** 上游返回 event `content_block_delta` 且 data 中 `delta: { type: 'thinking_delta', thinking: '思考中' }`
-   **THEN** 系统 SHALL 忽略该 delta,不将其传给 `onMessage`

#### Scenario: 忽略 signature_delta 与 thinking 块边界

-   **WHEN** 上游返回 `delta.type === 'signature_delta'`,或 `content_block_start` / `content_block_stop` 事件中 `content_block.type === 'thinking'`
-   **THEN** 系统 SHALL 忽略该事件,不将其传给 `onMessage`
-   **AND** SHALL NOT 抛出流解析错误

#### Scenario: Adaptive 模式

-   **WHEN** 当前模型为 `claude-opus-4-8` 或 `claude-opus-5-5`,且 `thinkingEnabled: true` 与 `reasoningEffort: 'high'`
-   **THEN** 请求体 SHALL 包含 `thinking: { type: 'adaptive', display: 'omitted' }` 与 `output_config: { effort: 'high' }`
-   **WHEN** 当前模型为 `claude-sonnet-4-6` 或 `anthropic/claude-opus-4.6`,其余条件相同
-   **THEN** 请求体 SHALL 包含 `thinking: { type: 'adaptive' }`(不含 `display`)与 `output_config: { effort: 'high' }`
-   **AND** `max_tokens` SHALL 为 `64000`
-   **AND** SHALL NOT 包含 `budget_tokens`

#### Scenario: Manual 模式

-   **WHEN** 当前模型为 `claude-haiku-4-5`、`anthropic/claude-sonnet-4.5` 或 `claude-opus-4-20250514`,且 `thinkingEnabled: true` 与 `reasoningEffort: 'medium'`
-   **THEN** 请求体 SHALL 包含 `thinking: { type: 'enabled', budget_tokens: 4096 }` 与 `max_tokens: 32000`
-   **AND** SHALL NOT 包含 `thinking.display` 或 `output_config.effort`

#### Scenario: Anthropic ping 忽略

-   **WHEN** 上游返回 event `ping`
-   **THEN** 系统 SHALL 不修改翻译结果
-   **AND** SHALL NOT 抛出流解析错误

#### Scenario: Anthropic 正常完成

-   **WHEN** 上游返回 event `message_stop` 且此前未收到 `stop_reason === 'max_tokens'`
-   **THEN** 系统 SHALL 调用 `onFinish('stop')`

#### Scenario: Anthropic 因 max_tokens 截断

-   **WHEN** 上游在 `message_delta` 中返回 `stop_reason: 'max_tokens'`,随后返回 `message_stop`
-   **THEN** 系统 SHALL 调用 `onFinish('max_tokens')`
-   **AND** SHALL NOT 以 `'stop'` 结束本次翻译

#### Scenario: Anthropic 完整响应解码

- **WHEN** 结构化请求收到完整 Anthropic JSON 响应
- **THEN** 系统 SHALL 只拼接 `content` 中 `type: 'text'` 的文本，忽略 thinking/signature，读取 `stop_reason` 与 `stop_details`
- **AND** refusal SHALL 走既有拒答错误路径，max_tokens SHALL 沿用截断规则，其它有效完成 SHALL 在校验后正常结束

### Requirement: 流结束兜底

部分兼容端点或代理会在没有终止事件(`[DONE]`、`finish_reason`、`response.completed`、`message_stop`)的情况下正常关闭连接。三个协议在流正常关闭、未报错且尚未结束时 SHALL 按正常完成处理:输出过滤器中剩余的文本(结构化模式下解析缓冲的 JSON),然后调用一次 `onFinish`(Anthropic 若已记录 `stop_reason === 'max_tokens'` 则为 `'max_tokens'`,否则为 `'stop'`)。正常关闭 SHALL 先等待全部已接收事件的异步消费完成；结构化模式仅在完整缓冲的 JSON 校验通过且没有拒答/上游错误时适用正常完成兜底，空输出或不完整 JSON SHALL 报错且 SHALL NOT 触发非流式重试。流中已报错时 SHALL 以 `onFinish('error')` 结束;中止路径不受影响。

#### Scenario: 无终止事件的流

-   **WHEN** 上游输出文本 `ok` 后直接关闭连接,没有发送任何终止事件
-   **THEN** 系统 SHALL 调用 `onMessage("ok")`
-   **AND** SHALL 恰好调用一次 `onFinish('stop')`,SHALL NOT 调用 `onError`

#### Scenario: EOF 前仍有异步消费者

- **WHEN** 末个 SSE chunk 已到达且连接关闭，但文本消费者仍在执行
- **THEN** 系统 SHALL 等待消费者和最终校验，先提交最终文本再完成一次，SHALL NOT 缓存缺少尾部的预览

#### Scenario: EOF 前只有不完整结构化内容

- **WHEN** 结构化流正常关闭但原始缓冲是空文本或未闭合 JSON
- **THEN** 系统 SHALL 以校验错误结束，SHALL NOT 将正常关闭当作成功或不支持流式的证据

### Requirement: 结构化流式解析与 UI 渲染保护 (CRITICAL)

UI 层期望接收可直接渲染的纯文本。当启用结构化输出时，系统 MUST NOT 将未解析的 JSON 字符串片段或完整 JSON 文档作为译文派发给 UI。流式期间 SHALL 输出当前可读译文的全量快照并替换前一次预览，最终严格校验通过后 SHALL 提交最终格式化文本，再触发一次完成回调。合法的最终空快照 SHALL 清空先前预览，SHALL NOT 因空内容被忽略，也 SHALL NOT 缓存或保存。

进行中的快照 SHALL 与普通增量遵守同一最多每 100ms 一次的 UI 刷新节流；请求结束 SHALL 立即刷新当前文本。仅验证通过且结束原因成功时 SHALL 写缓存和历史，所有失败/截断/取消路径 SHALL 保留已显示的部分译文及其状态但不持久化。旧请求、已终结请求或已取消 attempt 的迟到事件 SHALL NOT 修改界面或重复终结。

#### Scenario: Engine 逐步输出格式化文本

- **WHEN** 结构化 JSON 的译文字段在流式过程中逐步到达
- **THEN** 系统 SHALL 在完整 JSON 结束前发出有变化的非空 `onMessage({ content, isFullText: true })`
- **AND** UI SHALL 替换当前结果文本而非追加重复段落，SHALL NOT 显示 JSON envelope

#### Scenario: Engine 缓冲 JSON 并一次性输出格式化文本

- **WHEN** 结构化请求通过非流式 fallback 或直接 JSON 响应取得完整内容
- **THEN** Engine SHALL 缓冲完整正文，校验并格式化后仅发出一次 `onMessage({ content, isFullText: true })`
- **AND** UI SHALL 用其替换结果区，SHALL NOT 显示原始 JSON

#### Scenario: 最终文本在完成前提交

- **WHEN** 完整 JSON 校验成功且末段快照尚未刷新
- **THEN** 系统 SHALL 在 `onFinish` 前提交最终文本，UI SHALL 在结束时立即刷新它
- **AND** 成功缓存和历史 SHALL 使用最终文本而非先前预览

#### Scenario: 验证失败保留预览且结束加载

- **WHEN** 已显示预览而完整 JSON 验证失败
- **THEN** 系统 SHALL 显示可读错误，保留部分译文并结束加载
- **AND** SHALL NOT 缓存或保存这段预览，也 SHALL NOT 自动重新请求

#### Scenario: 终结后事件不再影响结果

- **WHEN** 同一请求已完成、失败或取消，之后又收到终止事件或迟到正文
- **THEN** 系统 SHALL 忽略这些事件，SHALL NOT 再次调用完成回调或修改结果

## ADDED Requirements

### Requirement: 结构化响应传输完整性

结构化翻译的 SSE、普通 JSON envelope 和错误体 SHALL 在 Chrome、Firefox、Tauri 及 userscript 传输适配中保持一致语义。响应媒体类型 SHALL 在后台/前端桥接后仍可用于格式识别。跨传输块拆分的 UTF-8 字符 SHALL 正确重组，事件 SHALL 按接收顺序消费，异步消费者失败 SHALL 通过受控错误路径结束。非成功响应的错误体 SHALL 完整收集后再用于 fallback 判定；媒体类型及状态码 SHALL 来自实际响应，不根据空输出或 JSON 解析失败推断不支持流式。

#### Scenario: 扩展后台桥接后仍识别 JSON

- **WHEN** Chrome 或 Firefox 的后台收到 JSON 媒体类型的完整结构化响应并转发给前端
- **THEN** 前端 SHALL 在同一次请求中识别并消费该响应，SHALL NOT 因媒体类型丢失而误判为空 SSE 或发起第二次 POST

#### Scenario: Userscript 完整读取普通 JSON

- **WHEN** userscript 传输返回普通 JSON，且正文跨多个流块或以文本响应一次返回
- **THEN** 系统 SHALL 按实际媒体类型读取完整正文并正常校验，SHALL NOT 仅解析首个块

#### Scenario: 非 ASCII 文本跨字节边界

- **WHEN** 中文或 emoji 的 UTF-8 字节横跨两个网络块
- **THEN** 最终 JSON 及译文 SHALL 与未拆分响应一致，SHALL NOT 引入替换字符或解析错误

#### Scenario: 错误体跨多个块

- **WHEN** HTTP 400 的流式能力错误 JSON 被拆为多个网络块
- **THEN** 系统 SHALL 合并完整错误体后判定是否允许 fallback，SHALL NOT 对每个块分别报错或重试

#### Scenario: 异步消费者拒绝

- **WHEN** 接收事件的异步消费者抛出异常
- **THEN** 请求 SHALL 受控失败并结束一次，SHALL NOT 产生未捕获 Promise rejection 或随后报告成功

#### Scenario: JSON 响应缺少合法协议 envelope

- **WHEN** 上游返回 HTTP 200 的普通 JSON，但不包含所选协议的有效响应 envelope
- **THEN** 系统 SHALL 报告响应错误且不缓存结果，SHALL NOT 发起能力 fallback

#### Scenario: 内容前协议能力错误优先分派

- **WHEN** 首个模型内容前收到明确不支持流式的 Chat `error` envelope（无 choices）、Responses `error` / `response.failed`，或 Anthropic `error`
- **THEN** 满足结构化流式 fallback 全部条件时 SHALL 只进行一次非流式重试，SHALL NOT 忽略该错误或先调用终结回调
- **AND** 不满足条件时 SHALL 按原协议错误路径结束，普通非错误空 choices 仍被忽略
