## MODIFIED Requirements

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
    thinkingEnabled?: boolean // 是否发送原生 thinking/reasoning 参数
    openaiReasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    anthropicThinkingEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}
```

系统 SHALL 把 `thinkingEnabled` 作为唯一启用开关。当 `thinkingEnabled !== true` 时，系统 SHALL 不向任何上游发送 OpenAI reasoning 或 Anthropic thinking 参数，即使 effort 字段存在也必须忽略。字段缺失时 SHALL 按 `thinkingEnabled: false` 处理；`openaiReasoningEffort` 缺失时 SHALL 使用 `'medium'` 作为 UI 默认值；`anthropicThinkingEffort` 缺失时 SHALL 使用 `'high'` 作为 UI 默认值。旧配置或跨版本同步缺失这些字段时 SHALL 以关闭思考作为迁移默认值。

#### Scenario: 创建配置后字段稳定

-   **WHEN** 用户新建一份 ProviderConfig
-   **THEN** 系统 SHALL 为其生成 uuid v4 作为 `id`
-   **AND** `id` SHALL 在该条目后续修改、重命名时保持不变

#### Scenario: 旧配置默认关闭思考

-   **WHEN** 系统读取缺少 `thinkingEnabled` 的旧 ProviderConfig
-   **THEN** 系统 SHALL 视为 `thinkingEnabled === false`
-   **AND** 请求上游时 SHALL NOT 发送 reasoning/thinking 参数

#### Scenario: 关闭开关优先于 effort 字段

-   **WHEN** ProviderConfig 设置了 `thinkingEnabled: false` 与 `openaiReasoningEffort: 'high'`
-   **THEN** OpenAI 请求 SHALL NOT 包含 `reasoning_effort` 或 `reasoning`
-   **WHEN** ProviderConfig 设置了 `thinkingEnabled: false` 与 `anthropicThinkingEffort: 'max'`
-   **THEN** Anthropic 请求 SHALL NOT 包含 `thinking` 或 `output_config.effort`

## ADDED Requirements

### Requirement: Provider 思考控制表单

系统 SHALL 在 Provider 表单中提供“启用思考(Thinking)”开关。系统 SHALL 根据 `protocol` 显示对应的 provider-specific effort 控件:

-   `openai-chat` / `openai-responses`: 显示 OpenAI Reasoning Effort，下拉选项为 None、Minimal、Low、Medium、High、Extra High，并保存到 `openaiReasoningEffort`。
-   `anthropic`: 显示 Anthropic Thinking Effort，下拉选项为 Low、Medium、High、Extra High、Max，并保存到 `anthropicThinkingEffort`。

系统 SHALL 始终保留用户配置的 effort 字段，但只有 `thinkingEnabled === true` 时才会发送到上游。表单 SHALL 显示简短说明，告知用户该配置是否生效取决于所选模型和兼容端点；OpenAI reasoning 推荐使用 `openai-responses` 协议。

#### Scenario: 允许调整 OpenAI reasoning effort

-   **WHEN** 用户编辑 `protocol === 'openai-responses'` 或 `protocol === 'openai-chat'` 的 ProviderConfig
-   **THEN** 系统 SHALL 提供 `thinkingEnabled` 开关与 OpenAI Reasoning Effort 控件
-   **AND** 保存后 SHALL 正确更新 `thinkingEnabled` 与 `openaiReasoningEffort`

#### Scenario: 允许调整 Anthropic thinking effort

-   **WHEN** 用户编辑 `protocol === 'anthropic'` 的 ProviderConfig
-   **THEN** 系统 SHALL 提供 `thinkingEnabled` 开关与 Anthropic Thinking Effort 控件
-   **AND** 保存后 SHALL 正确更新 `thinkingEnabled` 与 `anthropicThinkingEffort`
