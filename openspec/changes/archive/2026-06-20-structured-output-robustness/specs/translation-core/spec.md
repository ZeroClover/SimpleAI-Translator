## MODIFIED Requirements

### Requirement: Anthropic Messages 翻译协议

系统 SHALL 在 `provider.protocol === 'anthropic'` 时调用 Anthropic Messages API。请求 SHALL 发往 `{endpoint}/v1/messages`,使用 `x-api-key: <apiKey>`、`anthropic-version: 2023-06-01` 与 `Content-Type: application/json`,请求体 SHALL 包含 `model`、`max_tokens`、翻译 prompt 组成的 `messages`、`stream: true`。
当 `thinkingEnabled === true` 时，系统 SHALL 根据模型 id 前缀动态采用 Adaptive 或 Manual Thinking 模式（不得使用 system prompt 注入"详细思考"等指令——必须走原生 API 参数）。当 `thinkingEnabled !== true` 时，系统 SHALL 省略 `thinking` 与 `output_config.effort`，即使当前 ModelSelection 已保存 `anthropicThinkingEffort` 也不发送。

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

系统 SHALL 从 `message_delta` 事件捕获 `stop_reason`(位于 `delta.stop_reason` 或等价位置)。当 `stop_reason === 'max_tokens'` 时,系统 SHALL 在随后的 `message_stop` 以 `onFinish('max_tokens')` 结束,使上层(`Translator.tsx`)能提示输出因长度被截断;仅在未发生 `max_tokens` 截断时 `message_stop` 才以 `onFinish('stop')` 结束。`stop_reason` 缺失时系统 SHALL 维持 `onFinish('stop')`。

#### Scenario: Anthropic 文本增量

-   **WHEN** 上游返回 event `content_block_delta` 且 data 中 `delta: { type: 'text_delta', text: '好' }`
-   **THEN** 系统 SHALL 调用 `onMessage("好")`

#### Scenario: Anthropic 关闭开关优先

-   **WHEN** ModelSelection 设置了 `thinkingEnabled: false` 与 `anthropicThinkingEffort: 'max'`
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

-   **WHEN** 当前 ModelSelection 的 `model` 匹配 `claude-opus-4-7*` / `claude-opus-4-6*` / `claude-sonnet-4-6*` / `claude-mythos-preview*` 且 `thinkingEnabled: true` 与 `anthropicThinkingEffort: 'high'`
-   **THEN** 请求体 SHALL 包含 `thinking: { type: 'adaptive', display: 'omitted' }` 与 `output_config: { effort: 'high' }`
-   **AND** SHALL NOT 包含 `budget_tokens`

#### Scenario: 旧模型走 Manual 模式

-   **WHEN** 当前 ModelSelection 的 `model` 为 `claude-3-7-sonnet-*` 类旧模型且 `thinkingEnabled: true` 与 `anthropicThinkingEffort: 'medium'`
-   **THEN** 请求体 SHALL 包含 `thinking: { type: 'enabled', budget_tokens: 4096, display: 'omitted' }`
-   **AND** `max_tokens` SHALL 严格大于 `budget_tokens`

#### Scenario: xhigh 在非 Opus 4.7 模型上的降级

-   **WHEN** 当前 ModelSelection 的 `model` 为 `claude-sonnet-4-6` 且 `thinkingEnabled: true` 与 `anthropicThinkingEffort: 'xhigh'`
-   **THEN** 请求体中的 `output_config.effort` SHALL 为 `'high'`（软降级），而不是直接传 `'xhigh'`

#### Scenario: max effort

-   **WHEN** 当前 ModelSelection 的 `model` 为支持 Adaptive Thinking 的 Anthropic 模型且 `thinkingEnabled: true` 与 `anthropicThinkingEffort: 'max'`
-   **THEN** 请求体中的 `output_config.effort` SHALL 为 `'max'`

#### Scenario: budget_tokens 下界

-   **WHEN** Manual 模式下任何映射结果 `budget_tokens < 1024`
-   **THEN** 系统 SHALL 将其上调至 `1024` 以满足 Anthropic 强制下限

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
