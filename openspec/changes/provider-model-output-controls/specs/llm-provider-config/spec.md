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
}
```

ProviderConfig SHALL 只保存连接与鉴权信息，以及该 Provider 发现到的模型候选列表。系统 SHALL NOT 在 ProviderConfig 中保存模型级 Thinking / Reasoning 设置或 Structured Output 设置。

#### Scenario: 创建配置后字段稳定

-   **WHEN** 用户新建一份 ProviderConfig
-   **THEN** 系统 SHALL 为其生成 uuid v4 作为 `id`
-   **AND** `id` SHALL 在该条目后续修改、重命名时保持不变

#### Scenario: 旧配置不保留 Provider 级思考字段

-   **WHEN** 系统读取包含 `thinkingEnabled` / `openaiReasoningEffort` / `anthropicThinkingEffort` 的旧 ProviderConfig
-   **THEN** 归一化后的 ProviderConfig SHALL NOT 包含这些字段

#### Scenario: 旧默认模型不保留模型级思考控制

-   **WHEN** 系统读取包含 `thinkingEnabled` / `openaiReasoningEffort` / `anthropicThinkingEffort` 的旧 ModelSelection
-   **THEN** 归一化后的 ModelSelection SHALL NOT 包含这些字段

### Requirement: 模型级思考控制数据结构

系统 SHALL 把当前默认模型选择表示为以下结构:

```ts
interface ModelSelection {
    providerId: string
    model: string
}
```

ModelSelection SHALL 只标识默认 Provider 与模型名。系统 SHALL NOT 在 ModelSelection 中保存 `thinkingEnabled`、`openaiReasoningEffort`、`anthropicThinkingEffort`、`useStructuredOutput` 或 `useStrictSchema`。模型级输出控制 SHALL 存储在 ProviderModelOutputControls 中，并通过完全匹配的 `providerId + model` 组合解析。

#### Scenario: ModelSelection 不承载输出控制

-   **WHEN** 系统归一化 settings.defaultModel
-   **THEN** 归一化后的 ModelSelection SHALL 仅包含 `providerId` 与 `model`
-   **AND** SHALL NOT 包含 Thinking 或 Structured Output 字段

#### Scenario: 缺少输出控制记录时关闭

-   **WHEN** 当前 ModelSelection 指向的 Provider + Model 没有 ProviderModelOutputControls 记录
-   **THEN** 系统 SHALL 按关闭思考与关闭结构化输出处理

### Requirement: 模型思考控制表单

系统 SHALL 在 Provider 表单之外、模型选择区域中提供当前 Provider + Model 的输出控制表单。该表单 SHALL 包含“启用思考(Thinking)”开关，并根据当前模型所引用 Provider 的 `protocol` 显示对应的 provider-specific effort 控件:

-   `openai-chat` / `openai-responses`: 显示 OpenAI Reasoning Effort，下拉选项为 None、Minimal、Low、Medium、High、Extra High，并保存到当前 ProviderModelOutputControls 的 `openaiReasoningEffort`。
-   `anthropic`: 显示 Anthropic Thinking Effort，下拉选项为 Low、Medium、High、Extra High、Max，并保存到当前 ProviderModelOutputControls 的 `anthropicThinkingEffort`。

系统 SHALL 始终保留用户为当前 Provider + Model 配置的 effort 字段，但只有 `thinkingEnabled === true` 时才会发送到上游。表单 SHALL 显示简短说明，告知用户该配置是否生效取决于所选模型和兼容端点；OpenAI reasoning 推荐使用 `openai-responses` 协议。

#### Scenario: 允许调整 OpenAI reasoning effort

-   **WHEN** 当前模型引用的 Provider 为 `protocol === 'openai-responses'` 或 `protocol === 'openai-chat'`
-   **THEN** 系统 SHALL 提供 `thinkingEnabled` 开关与 OpenAI Reasoning Effort 控件
-   **AND** 保存后 SHALL 正确更新当前 Provider + Model 的 ProviderModelOutputControls 中的 `thinkingEnabled` 与 `openaiReasoningEffort`

#### Scenario: 允许调整 Anthropic thinking effort

-   **WHEN** 当前模型引用的 Provider 为 `protocol === 'anthropic'`
-   **THEN** 系统 SHALL 提供 `thinkingEnabled` 开关与 Anthropic Thinking Effort 控件
-   **AND** 保存后 SHALL 正确更新当前 Provider + Model 的 ProviderModelOutputControls 中的 `thinkingEnabled` 与 `anthropicThinkingEffort`

## ADDED Requirements

### Requirement: Provider + Model 输出控制数据结构

系统 SHALL 以 Provider id 与模型名的组合持久化模型输出控制，结构如下:

```ts
interface ProviderModelOutputControls {
    providerId: string
    model: string
    thinkingEnabled?: boolean
    openaiReasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    anthropicThinkingEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
    useStructuredOutput?: boolean
    useStrictSchema?: boolean
}
```

`ISettings` SHALL 通过 `providerModelOutputControls?: ProviderModelOutputControls[]` 保存这些记录。每条记录 SHALL 只适用于完全匹配的 `providerId + model` 组合。缺少记录、记录字段缺失、或首次从旧版本 App 迁移时，系统 SHALL 按关闭思考与关闭结构化输出处理。

当 `thinkingEnabled !== true` 时，系统 SHALL 不向任何上游发送 OpenAI reasoning 或 Anthropic thinking 参数，即使 effort 字段存在也必须忽略。`openaiReasoningEffort` 缺失时 SHALL 使用 `'medium'` 作为 UI 默认值；`anthropicThinkingEffort` 缺失时 SHALL 使用 `'high'` 作为 UI 默认值。`useStructuredOutput !== true` 时，系统 SHALL 不发送结构化输出参数；`useStrictSchema` 仅在 `useStructuredOutput === true` 时生效，缺失时 SHALL 按严格 JSON Schema 开启显示和发送。

当用户首次为某个 Provider + Model 启用 Thinking 或 Structured Output 时，系统 SHALL 保存 UI 中显示的默认值：OpenAI effort 为 `'medium'`、Anthropic effort 为 `'high'`、Strict JSON Schema 为 `true`。

#### Scenario: 缺少 Provider + Model 记录

-   **WHEN** 当前 Provider id 与模型名没有匹配的 ProviderModelOutputControls
-   **THEN** 系统 SHALL 视为 `thinkingEnabled !== true`
-   **AND** SHALL 视为 `useStructuredOutput !== true`
-   **AND** 翻译请求 SHALL NOT 包含 reasoning、thinking 或 structured output 参数

#### Scenario: 首次迁移不继承旧全局结构化输出

-   **WHEN** 旧设置中存在 `useStructuredOutput: true` 或 `useStrictSchema: true`，但没有 ProviderModelOutputControls 记录
-   **THEN** 归一化后的运行时行为 SHALL 按该 Provider + Model 没有启用结构化输出处理
-   **AND** 系统 SHALL NOT 自动创建启用结构化输出的 ProviderModelOutputControls 记录

#### Scenario: 首次迁移不继承旧默认模型思考

-   **WHEN** 旧设置中 `defaultModel` 包含 `thinkingEnabled: true`，但没有 ProviderModelOutputControls 记录
-   **THEN** 归一化后的运行时行为 SHALL 按该 Provider + Model 没有启用思考处理
-   **AND** 系统 SHALL NOT 自动创建启用思考的 ProviderModelOutputControls 记录

#### Scenario: 关闭开关优先于保存的 effort 字段

-   **WHEN** ProviderModelOutputControls 设置了 `thinkingEnabled: false` 与 `openaiReasoningEffort: 'high'`
-   **THEN** OpenAI 请求 SHALL NOT 包含 `reasoning_effort` 或 `reasoning`
-   **WHEN** ProviderModelOutputControls 设置了 `thinkingEnabled: false` 与 `anthropicThinkingEffort: 'max'`
-   **THEN** Anthropic 请求 SHALL NOT 包含 `thinking` 或 `output_config.effort`

#### Scenario: 重复记录归一化

-   **WHEN** 持久化数据中存在多条相同 `providerId + model` 的 ProviderModelOutputControls
-   **THEN** 归一化后的设置 SHALL 只保留一条该组合的记录
-   **AND** 字段值 SHALL 以最后一条有效记录为准

#### Scenario: 自定义模型记录保留

-   **WHEN** ProviderModelOutputControls 的 `providerId` 仍存在且 `model` 是非空字符串，但该模型名不在 ProviderConfig.modelOptions 中
-   **THEN** 归一化 SHALL 保留该记录
-   **AND** SHALL NOT 仅因为模型列表刷新未返回该模型就删除用户手动配置的输出控制
