## ADDED Requirements

### Requirement: Provider + Model 输出控制解析

翻译核心 SHALL 在解析出本次请求实际使用的 ProviderConfig 与模型名之后，根据 `providerId + model` 精确查找 ProviderModelOutputControls。所有 Thinking 与 Structured Output 运行时行为 SHALL 使用该解析结果。

如果没有匹配记录，或该记录来自旧版本迁移前的全局字段/旧 ModelSelection 字段，系统 SHALL 按关闭思考与关闭结构化输出处理。

#### Scenario: 查询显式模型时按显式组合解析

-   **WHEN** 调用方传入 `providerId: 'provider-a'` 与 `model: 'model-x'`
-   **THEN** 翻译核心 SHALL 查找 `providerId === 'provider-a' && model === 'model-x'` 的 ProviderModelOutputControls
-   **AND** SHALL NOT 使用 defaultModel 中其它模型的输出控制

#### Scenario: 默认模型按默认组合解析

-   **WHEN** 调用方未传入 providerId 或 model，且 settings.defaultModel 指向 Provider A + Model X
-   **THEN** 翻译核心 SHALL 查找 Provider A + Model X 的 ProviderModelOutputControls

#### Scenario: 缺少记录时关闭

-   **WHEN** 当前 Provider + Model 没有匹配的 ProviderModelOutputControls
-   **THEN** 翻译核心 SHALL 视为未启用 Thinking
-   **AND** SHALL 视为未启用 Structured Output

## MODIFIED Requirements

### Requirement: OpenAI Chat Completions 翻译协议

系统 SHALL 在 `provider.protocol === 'openai-chat'` 时调用 OpenAI Chat Completions 兼容协议。请求 SHALL 发往 `{endpoint}/chat/completions`,使用 `Authorization: Bearer <apiKey>` 与 `Content-Type: application/json`,请求体 SHALL 包含 `model`、翻译 prompt 组成的 `messages`、`stream: true`。
当当前 Provider + Model 的 ProviderModelOutputControls 中 `thinkingEnabled === true` 时，系统 SHALL 将 `openaiReasoningEffort ?? 'medium'` 作为 OpenAI Chat Completions 顶层 `reasoning_effort` 参数传入请求体（如所选模型支持）。映射值 SHALL 仅使用 OpenAI 支持的 effort 字符串：`none`、`minimal`、`low`、`medium`、`high`、`xhigh`。当 `thinkingEnabled !== true` 或没有匹配的 ProviderModelOutputControls 时，系统 SHALL 省略 `reasoning_effort`，即使旧 ModelSelection 或旧 ProviderConfig 曾保存 `openaiReasoningEffort` 也不发送。
系统 SHALL 从 SSE `data:` 行解析 JSON chunk,把 `choices[].delta.content` 中经过 thinking 内容过滤后的文本增量传给 `onMessage`,忽略没有文本增量的 usage/metadata chunk,并在收到 `data: [DONE]` 或 `finish_reason` 时结束。
系统 SHALL 仅转发 `choices[].delta.content`，并忽略部分 OpenAI-compatible 服务可能返回的非标准 `reasoning_content` 字段（不将其传递给最终文本显示）。

#### Scenario: Chat Completions 文本增量

-   **WHEN** 上游返回 SSE `data: {"choices":[{"delta":{"content":"你"}}]}`
-   **THEN** 系统 SHALL 调用 `onMessage("你")`

#### Scenario: Chat Completions 携带 Reasoning Effort

-   **WHEN** 当前 Provider + Model 的 ProviderModelOutputControls 设置了 `thinkingEnabled: true` 与 `openaiReasoningEffort: 'high'`
-   **THEN** 发送的请求体 SHALL 根据需要包含 `reasoning_effort: 'high'` (若模型支持)

#### Scenario: Chat Completions 关闭开关优先

-   **WHEN** 当前 Provider + Model 的 ProviderModelOutputControls 设置了 `thinkingEnabled: false` 与 `openaiReasoningEffort: 'high'`
-   **THEN** 发送的请求体 SHALL NOT 包含 `reasoning_effort`

#### Scenario: Chat Completions 缺少控制记录

-   **WHEN** 当前 Provider + Model 没有 ProviderModelOutputControls 记录
-   **THEN** 发送的请求体 SHALL NOT 包含 `reasoning_effort`

#### Scenario: Chat Completions 显式 None

-   **WHEN** 当前 Provider + Model 的 ProviderModelOutputControls 设置了 `thinkingEnabled: true` 与 `openaiReasoningEffort: 'none'`
-   **THEN** 发送的请求体 SHALL 根据需要包含 `reasoning_effort: 'none'` (若模型支持)

#### Scenario: Chat Completions 非标准 reasoning 字段

-   **WHEN** 流式返回的 chunk 包含 `choices[0].delta.reasoning_content`
-   **THEN** 系统 SHALL 忽略该字段，不在 `onMessage` 呈现给最终用户

#### Scenario: Chat Completions DONE

-   **WHEN** 上游返回 `data: [DONE]`
-   **THEN** 系统 SHALL 调用 `onFinish('stop')`

#### Scenario: Chat Completions 空 choices chunk

-   **WHEN** 上游因 `stream_options.include_usage` 返回 `choices: []` 的 usage chunk
-   **THEN** 系统 SHALL 忽略该 chunk 的文本输出
-   **AND** SHALL NOT 抛出流解析错误

### Requirement: OpenAI Responses 翻译协议

系统 SHALL 在 `provider.protocol === 'openai-responses'` 时调用 OpenAI Responses API。请求 SHALL 发往 `{endpoint}/responses`,使用 `Authorization: Bearer <apiKey>` 与 `Content-Type: application/json`,请求体 SHALL 包含 `model`、翻译输入/指令、`stream: true`。
当当前 Provider + Model 的 ProviderModelOutputControls 中 `thinkingEnabled === true` 时，系统 SHALL 将 `openaiReasoningEffort ?? 'medium'` 映射至 Responses API 的 `reasoning: { effort: ... }` 请求字段（如所选模型支持）。映射值 SHALL 仅使用 OpenAI 支持的 effort 字符串：`none`、`minimal`、`low`、`medium`、`high`、`xhigh`。当 `thinkingEnabled !== true` 或没有匹配的 ProviderModelOutputControls 时，系统 SHALL 省略 `reasoning` 字段，即使旧 ModelSelection 或旧 ProviderConfig 曾保存 `openaiReasoningEffort` 也不发送。
系统 SHALL NOT 为本功能设置 `reasoning.summary`，也 SHALL NOT 设置 `include: ["reasoning.encrypted_content"]`，因为本动议目标是不展示或保留 OpenAI reasoning 内容。
系统 SHALL 从 SSE event/data 解析 Responses 流事件,只把 `response.output_text.delta` 的 `delta` 文本经过 thinking 内容过滤后传给 `onMessage`,在 `response.completed` 时结束,在 `response.failed` / `response.incomplete` / `error` 事件时走错误路径。系统 SHALL 忽略其它非文本输出事件，包括 reasoning summary 或 encrypted reasoning 相关事件（即使上游代理返回了这些事件）。

#### Scenario: Responses 文本增量

-   **WHEN** 上游返回 event `response.output_text.delta` 且 data 中 `delta === "好"`
-   **THEN** 系统 SHALL 调用 `onMessage("好")`

#### Scenario: Responses 携带 Reasoning Effort

-   **WHEN** 当前 Provider + Model 的 ProviderModelOutputControls 设置了 `thinkingEnabled: true` 与 `openaiReasoningEffort: 'high'`
-   **THEN** 发送的请求体 SHALL 根据需要包含 `reasoning: { effort: 'high' }` (若模型支持)
-   **AND** SHALL NOT 包含顶层 `reasoning_effort`
-   **AND** SHALL NOT 包含 `reasoning.summary` 或 `include: ["reasoning.encrypted_content"]`

#### Scenario: Responses 关闭开关优先

-   **WHEN** 当前 Provider + Model 的 ProviderModelOutputControls 设置了 `thinkingEnabled: false` 与 `openaiReasoningEffort: 'high'`
-   **THEN** 发送的请求体 SHALL NOT 包含 `reasoning`

#### Scenario: Responses 缺少控制记录

-   **WHEN** 当前 Provider + Model 没有 ProviderModelOutputControls 记录
-   **THEN** 发送的请求体 SHALL NOT 包含 `reasoning`

#### Scenario: Responses 显式 None

-   **WHEN** 当前 Provider + Model 的 ProviderModelOutputControls 设置了 `thinkingEnabled: true` 与 `openaiReasoningEffort: 'none'`
-   **THEN** 发送的请求体 SHALL 根据需要包含 `reasoning: { effort: 'none' }` (若模型支持)

#### Scenario: Responses 完成事件

-   **WHEN** 上游返回 event `response.completed`
-   **THEN** 系统 SHALL 调用 `onFinish('stop')`

#### Scenario: Responses 错误事件

-   **WHEN** 上游返回 event `error` 或 `response.failed`
-   **THEN** 系统 SHALL 调用 `onError` 并恢复 UI 非翻译状态

### Requirement: Anthropic Messages 翻译协议

系统 SHALL 在 `provider.protocol === 'anthropic'` 时调用 Anthropic Messages API。请求 SHALL 发往 `{endpoint}/v1/messages`,使用 `x-api-key: <apiKey>`、`anthropic-version: 2023-06-01` 与 `Content-Type: application/json`,请求体 SHALL 包含 `model`、`max_tokens`、翻译 prompt 组成的 `messages`、`stream: true`。
当当前 Provider + Model 的 ProviderModelOutputControls 中 `thinkingEnabled === true` 时，系统 SHALL 根据模型 id 前缀动态采用 Adaptive 或 Manual Thinking 模式（不得使用 system prompt 注入"详细思考"等指令——必须走原生 API 参数）。当 `thinkingEnabled !== true` 或没有匹配的 ProviderModelOutputControls 时，系统 SHALL 省略 `thinking` 与 `output_config.effort`，即使旧 ModelSelection 或旧 ProviderConfig 曾保存 `anthropicThinkingEffort` 也不发送。

-   **Adaptive 模式**（`claude-opus-4-7*`、`claude-opus-4-6*`、`claude-sonnet-4-6*`、`claude-mythos-preview*`）：请求体 SHALL 包含 `thinking: { type: 'adaptive', display: 'omitted' }` 与 `output_config: { effort: Y }`。
-   **Manual 模式**（`claude-3-7-*`、`claude-haiku-4-5*`、Sonnet/Opus 4.5 及更早等不接受 `type: 'adaptive'` 的旧模型）：请求体 SHALL 包含 `thinking: { type: 'enabled', budget_tokens: X, display: 'omitted' }`。

系统 SHALL 按下表把 `anthropicThinkingEffort ?? 'high'` 映射到 Anthropic 的 `effort` / `budget_tokens`：

| anthropicThinkingEffort | Adaptive `effort`                                      | Manual `budget_tokens`                                               |
| ----------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| `low`                   | `low`                                                  | `1024`                                                               |
| `medium`                | `medium`                                               | `4096`                                                               |
| `high`                  | `high`                                                 | `16384`                                                              |
| `xhigh`                 | `xhigh` 仅在 `claude-opus-4-7*`，其他模型回退为 `high` | `32768`                                                              |
| `max`                   | `max`                                                  | 选择低于 `max_tokens` 的最大安全预算；模型输出上限允许时目标 `64000` |

系统 MUST 在启用思考时同时抬高 `max_tokens`（一般建议 64000，Manual `max` 可在模型支持时提高到 128000），且 Manual 模式下 SHALL 保证 `max_tokens > budget_tokens` 并满足 `budget_tokens ≥ 1024`（Anthropic API 强制下限）。

`thinking.display: 'omitted'` 是为"不向用户展示思考"目标的官方推荐路径——服务端跳过 thinking 文本流，缩短首字延迟，费用不变。客户端 `thinking_delta` 过滤作为对未实现该字段的代理的兜底保留。

系统 SHALL 从 SSE 解析 `content_block_delta` 事件，仅把 `delta.type === 'text_delta'` 的 `delta.text` 经过 thinking 内容过滤后传给 `onMessage`，忽略 `ping`、`delta.type === 'thinking_delta'`、`delta.type === 'signature_delta'`、以及 `content_block_start` / `content_block_stop` 中 `content_block.type === 'thinking'` 的块与未知事件；在 `message_stop` 时结束，在 `error` event 时走错误路径。

#### Scenario: Anthropic 文本增量

-   **WHEN** 上游返回 event `content_block_delta` 且 data 中 `delta: { type: 'text_delta', text: '好' }`
-   **THEN** 系统 SHALL 调用 `onMessage("好")`

#### Scenario: Anthropic 关闭开关优先

-   **WHEN** 当前 Provider + Model 的 ProviderModelOutputControls 设置了 `thinkingEnabled: false` 与 `anthropicThinkingEffort: 'max'`
-   **THEN** 请求体 SHALL NOT 包含 `thinking`
-   **AND** SHALL NOT 包含 `output_config.effort`

#### Scenario: Anthropic 缺少控制记录

-   **WHEN** 当前 Provider + Model 没有 ProviderModelOutputControls 记录
-   **THEN** 请求体 SHALL NOT 包含 `thinking`
-   **AND** SHALL NOT 包含 `output_config.effort`

#### Scenario: 忽略原生 thinking 增量

-   **WHEN** 上游返回 event `content_block_delta` 且 data 中 `delta: { type: 'thinking_delta', thinking: '思考中' }`
-   **THEN** 系统 SHALL 忽略该 delta，不将其传给 `onMessage`

#### Scenario: 忽略 signature_delta 与 thinking 块边界

-   **WHEN** 上游返回 `delta.type === 'signature_delta'`，或 `content_block_start` / `content_block_stop` 事件中 `content_block.type === 'thinking'`
-   **THEN** 系统 SHALL 忽略该事件，不将其传给 `onMessage`
-   **AND** SHALL NOT 抛出流解析错误

#### Scenario: 较新模型走 Adaptive 模式

-   **WHEN** 当前 Provider + Model 的模型名匹配 `claude-opus-4-7*` / `claude-opus-4-6*` / `claude-sonnet-4-6*` / `claude-mythos-preview*` 且 ProviderModelOutputControls 设置了 `thinkingEnabled: true` 与 `anthropicThinkingEffort: 'high'`
-   **THEN** 请求体 SHALL 包含 `thinking: { type: 'adaptive', display: 'omitted' }` 与 `output_config: { effort: 'high' }`
-   **AND** SHALL NOT 包含 `budget_tokens`

#### Scenario: 旧模型走 Manual 模式

-   **WHEN** 当前 Provider + Model 的模型名为 `claude-3-7-sonnet-*` 类旧模型且 ProviderModelOutputControls 设置了 `thinkingEnabled: true` 与 `anthropicThinkingEffort: 'medium'`
-   **THEN** 请求体 SHALL 包含 `thinking: { type: 'enabled', budget_tokens: 4096, display: 'omitted' }`
-   **AND** `max_tokens` SHALL 严格大于 `budget_tokens`

#### Scenario: xhigh 在非 Opus 4.7 模型上的降级

-   **WHEN** 当前 Provider + Model 的模型名为 `claude-sonnet-4-6` 且 ProviderModelOutputControls 设置了 `thinkingEnabled: true` 与 `anthropicThinkingEffort: 'xhigh'`
-   **THEN** 请求体中的 `output_config.effort` SHALL 为 `'high'`（软降级），而不是直接传 `'xhigh'`

#### Scenario: max effort

-   **WHEN** 当前 Provider + Model 的模型名为支持 Adaptive Thinking 的 Anthropic 模型且 ProviderModelOutputControls 设置了 `thinkingEnabled: true` 与 `anthropicThinkingEffort: 'max'`
-   **THEN** 请求体中的 `output_config.effort` SHALL 为 `'max'`

#### Scenario: budget_tokens 下界

-   **WHEN** Manual 模式下任何映射结果 `budget_tokens < 1024`
-   **THEN** 系统 SHALL 将其上调至 `1024` 以满足 Anthropic 强制下限

#### Scenario: Anthropic ping 忽略

-   **WHEN** 上游返回 event `ping`
-   **THEN** 系统 SHALL 不修改翻译结果
-   **AND** SHALL NOT 抛出流解析错误

#### Scenario: Anthropic 完成事件

-   **WHEN** 上游返回 event `message_stop`
-   **THEN** 系统 SHALL 调用 `onFinish('stop')`

### Requirement: Request Builder Payload Injection

翻译引擎的请求构建器 (Request Builders) SHALL 根据当前 Provider + Model 的 ProviderModelOutputControls 决定是否在请求体中注入结构化输出相关的参数。

#### Scenario: Inject Parameters

-   **WHEN** 用户触发翻译且当前 Provider + Model 的 ProviderModelOutputControls 设置了 `useStructuredOutput: true`
-   **THEN** 对应的翻译 API Request Builder SHALL 修改请求体以适配结构化输出规范
-   **AND** 若设置为 false、字段缺失、或没有匹配记录，请求体 SHALL 保持传统的自然语言格式

#### Scenario: Structured Output Request Context

-   **WHEN** 当前 Provider + Model 的 ProviderModelOutputControls 设置了 `useStructuredOutput: true`
-   **THEN** 翻译核心 SHALL 将结构化输出模式、JSON Schema、严格模式标志与结果格式化策略传递给 Engine 请求接口
-   **AND** Engine SHALL NOT 通过读取 UI 状态或重新推断输入类型来决定结构化输出 schema

### Requirement: 输出控制缓存隔离

Thinking 与 Structured Output 设置会改变请求体、模型输出行为与最终渲染文本，系统 SHALL 避免复用不同 Provider + Model 输出控制配置下的旧缓存。

#### Scenario: Cache Key Includes Output Control Settings

-   **WHEN** 用户对同一文本、语言、Provider 与模型切换该 Provider + Model 的 `thinkingEnabled`、`openaiReasoningEffort`、`anthropicThinkingEffort`、`useStructuredOutput` 或 `useStrictSchema`
-   **THEN** 翻译缓存 key SHALL 包含解析后的这些设置以及当前结构化输出模式
-   **AND** 系统 SHALL NOT 返回另一个结构化输出配置下生成的缓存结果

#### Scenario: Cache Key Differs for Thinking Effort

-   **WHEN** 同一 Provider + Model 对同一文本先后使用 `thinkingEnabled: true, openaiReasoningEffort: 'low'` 与 `thinkingEnabled: true, openaiReasoningEffort: 'high'`
-   **THEN** 翻译缓存 key SHALL 不同
-   **AND** 系统 SHALL NOT 复用另一种 Thinking Effort 下生成的缓存结果
