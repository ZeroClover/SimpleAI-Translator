## MODIFIED Requirements

### Requirement: ISettings 类型字段精简

`src/common/types.ts` 中 `ISettings` 接口 SHALL NOT 声明以下字段:
- `hotkey`
- `displayWindowHotkey`
- `alwaysShowIcons`
- `autoTranslate`
- `selectInputElementsText`
- `readSelectedWordsFromInputElementsText`
- `hideTheIconInTheDock`
- `autoHideWindowWhenOutOfFocus`
- `disableCollectingStatistics`
- `useStructuredOutput`
- `useStrictSchema`

`src/common/utils.ts` 中默认值与规范化函数 SHALL NOT 为这些字段提供 default、不在迁移路径中保留它们。Structured Output 与 Strict JSON Schema SHALL 通过 ProviderModelOutputControls 表示。

#### Scenario: types.ts 字段缺失

- **WHEN** 在 `src/common/types.ts` 检查 `ISettings` 接口
- **THEN** 上述字段名 SHALL NOT 出现

#### Scenario: utils.ts 默认值缺失

- **WHEN** 在 `src/common/utils.ts` 中搜索上述字段名
- **THEN** SHALL NOT 命中(允许 `openspec/` 与 git history 中保留历史)

### Requirement: Structured Output & Strict Schema Setting Toggles

The settings UI SHALL provide two boolean preferences for the currently selected provider + model combination:
1. "Use Structured Output": The main toggle enabling JSON responses for that provider + model.
2. "Strict JSON Schema": A sub-toggle (default true, only active when Structured Output is enabled) that forces the use of strict JSON Schema constraints for that provider + model.

These toggles SHALL be edited in the LLM Provider/model settings surface and persisted to the matching ProviderModelOutputControls record. The UI SHALL NOT expose a global Structured Output or Strict JSON Schema toggle that applies to every provider and model.

#### Scenario: Toggle Visibility & Dependency

- **WHEN** a user opens the settings panel and selects a provider + model
- **THEN** a switch for "Use Structured Output" SHALL be available for that provider + model
- **AND** a sub-switch for "Strict JSON Schema" SHALL be visible for that provider + model
- **AND** if "Use Structured Output" is false, "Strict JSON Schema" SHALL be disabled or hidden

#### Scenario: Warning Tooltip

- **WHEN** the "Strict JSON Schema" setting is rendered
- **THEN** it SHALL display a warning or tooltip indicating that some older or third-party models only support JSON Object mode and may fail with Strict Schema enabled.

#### Scenario: Switching models loads matching controls

- **WHEN** 用户先为 Provider A + Model X 启用 Structured Output，然后切换到 Provider A + Model Y
- **THEN** 设置面板 SHALL 显示 Model Y 自己保存的 Structured Output / Strict JSON Schema 状态
- **AND** 如果 Model Y 没有保存记录，设置面板 SHALL 显示 Structured Output 关闭

### Requirement: ISettings 更新

`src/common/types.ts` 中 `ISettings` 接口 SHALL 包含 `providerModelOutputControls?: ProviderModelOutputControls[]` 字段，用于保存 Provider + Model 输出控制。

运行时行为 SHALL NOT 依赖全局 `useStructuredOutput` 或 `useStrictSchema` 字段决定翻译请求是否启用结构化输出。旧版本设置中的同名字段 SHALL 在归一化时丢弃，且 SHALL NOT 写回持久化设置。

#### Scenario: types.ts 字段添加

- **WHEN** 在 `src/common/types.ts` 检查 `ISettings` 接口
- **THEN** `providerModelOutputControls?: ProviderModelOutputControls[]` 字段 SHALL 存在
- **AND** `useStructuredOutput` 与 `useStrictSchema` 字段 SHALL NOT 存在

#### Scenario: 全局结构化输出字段不再驱动请求

- **WHEN** 旧设置中 `useStructuredOutput === true`，但当前 Provider + Model 没有启用 Structured Output 的 ProviderModelOutputControls 记录
- **THEN** 翻译请求 SHALL NOT 启用结构化输出
- **AND** 设置面板 SHALL NOT 把该旧全局字段显示为当前 Provider + Model 已启用
