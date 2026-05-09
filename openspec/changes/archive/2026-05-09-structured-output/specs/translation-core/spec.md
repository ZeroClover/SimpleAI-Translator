## ADDED Requirements

### Requirement: Request Builder Payload Injection
翻译引擎的请求构建器 (Request Builders) SHALL 根据配置决定是否在请求体中注入结构化输出相关的参数。

#### Scenario: Inject Parameters
- **WHEN** 用户触发翻译且 `useStructuredOutput` 设置为 true
- **THEN** 对应的翻译 API Request Builder SHALL 修改请求体以适配结构化输出规范
- **AND** 若设置为 false，请求体 SHALL 保持传统的自然语言格式

#### Scenario: Structured Output Request Context
- **WHEN** `useStructuredOutput` 为 true
- **THEN** 翻译核心 SHALL 将结构化输出模式、JSON Schema、严格模式标志与结果格式化策略传递给 Engine 请求接口
- **AND** Engine SHALL NOT 通过读取 UI 状态或重新推断输入类型来决定结构化输出 schema

### Requirement: 错误处理与模型拒绝 (Refusal)
系统 SHALL 精准识别各家 API 规范下的 Refusal 状态，而非混淆。

#### Scenario: Handle OpenAI Refusal
- **WHEN** 响应来自 OpenAI 且包含了 `message.refusal` 字段 (注意：`finish_reason` 仍为 "stop")
- **THEN** 系统 SHALL 捕获此拒绝状态，抛出明确的安全或拒绝错误

#### Scenario: Handle Anthropic Refusal
- **WHEN** 响应来自 Anthropic 且 `stop_reason` 为 `"refusal"`
- **THEN** 系统 SHALL 捕获此拒绝状态，抛出明确的安全或拒绝错误

### Requirement: 结构化流式解析与 UI 渲染保护 (CRITICAL)
UI 层 (`Translator.tsx`) 期望接收到的是可以直接拼接渲染的 Markdown 或纯文本内容。当启用结构化输出时，Engine 层 MUST NOT 将未解析的 JSON 字符串片段或完整 JSON 字符串直接派发给 UI。

#### Scenario: Engine 解析 JSON 并格式化 (流式权衡)
- **WHEN** `useStructuredOutput` 为 true 且引擎收到了模型的 JSON 输出
- **THEN** Engine 层 SHALL 负责将 JSON 对象转换为可读的 Markdown 或纯文本格式 (例如：从 `translatedText` 提取文本，或将 word schema 的各个字段按约定格式拼装)
- **AND** 仅将最终组装好的可读文本通过 `onMessage` 派发给 UI，确保 UI 屏幕上绝对不会出现 `{"translatedText":"你好"}` 这种破坏性输出
- **AND** 系统接受为了保证格式正确而导致的 UX 退化（即可能需要在底层完整缓冲 JSON 结束后再 emit Markdown，表现为非流式返回；除非实施者实现了高鲁棒性的 Partial JSON Parser）

### Requirement: 结构化输出缓存隔离
结构化输出设置会改变请求体、模型输出格式与最终渲染文本，系统 SHALL 避免复用不同结构化输出配置下的旧缓存。

#### Scenario: Cache Key Includes Structured Output Settings
- **WHEN** 用户对同一文本、语言、Provider 与模型切换 `useStructuredOutput` 或 `useStrictSchema`
- **THEN** 翻译缓存 key SHALL 包含这些设置以及当前结构化输出模式
- **AND** 系统 SHALL NOT 返回另一个结构化输出配置下生成的缓存结果
