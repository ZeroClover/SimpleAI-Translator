## ADDED Requirements

### Requirement: Structured Output & Strict Schema Setting Toggles
The settings UI SHALL provide two boolean preferences:
1. "Use Structured Output": The main toggle enabling JSON responses.
2. "Strict JSON Schema": A sub-toggle (default true, only active when Structured Output is enabled) that forces the use of strict JSON Schema constraints.

#### Scenario: Toggle Visibility & Dependency
- **WHEN** a user opens the settings panel
- **THEN** a switch for "Use Structured Output" SHALL be available
- **AND** a sub-switch for "Strict JSON Schema" SHALL be visible
- **AND** if "Use Structured Output" is false, "Strict JSON Schema" SHALL be disabled or hidden

#### Scenario: Warning Tooltip
- **WHEN** the "Strict JSON Schema" setting is rendered
- **THEN** it SHALL display a warning or tooltip indicating that some older or third-party models only support JSON Object mode and may fail with Strict Schema enabled.

### Requirement: ISettings 更新
`src/common/types.ts` 中 `ISettings` 接口 SHALL 包含 `useStructuredOutput` 和 `useStrictSchema` 字段。

#### Scenario: types.ts 字段添加
- **WHEN** 在 `src/common/types.ts` 检查 `ISettings` 接口
- **THEN** `useStructuredOutput` (boolean) 和 `useStrictSchema` (boolean) 字段 SHALL 存在
