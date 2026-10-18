# Spec Delta

## ADDED Requirements

### Requirement: Markdown 阅读偏好持久化

Markdown 渲染 SHALL 是独立于 Provider、模型和结构化输出控制的布尔阅读偏好，默认关闭；仅保存值为布尔 `true` 时 SHALL 开启。该偏好 SHALL 通过现有设置设施保存，重新打开翻译界面或重启应用后 SHALL 读取保存值；切换模型、重试、清空译文或恢复历史 SHALL NOT 重置偏好。

设置面板 SHALL NOT 新增重复的 Markdown 开关，唯一入口 SHALL 位于主界面结果工具栏（见 translation-core）。保存设置面板中的其它字段 SHALL 保留该偏好。

#### Scenario: 空设置和旧设置默认关闭

-   **WHEN** 设置为空、缺少 Markdown 偏好，或该值不是布尔 `true`
-   **THEN** Markdown 渲染 SHALL 关闭

#### Scenario: 记住选择

-   **WHEN** 用户开启 Markdown 后重新打开翻译界面或重启应用
-   **THEN** 界面 SHALL 读取已保存的开启状态，并用于下一次显示的译文

#### Scenario: 开启后关闭也被保存

-   **WHEN** 用户先开启再关闭 Markdown，并在保存完成后重新打开翻译界面
-   **THEN** Markdown SHALL 保持关闭，SHALL NOT 恢复之前的开启状态
-   **AND** Chrome、Firefox、Tauri 与用户脚本的现有设置存储路径 SHALL 均遵守此行为

#### Scenario: 保存其它设置

-   **WHEN** 用户开启 Markdown，再进入设置修改并保存字号、语言或其它字段
-   **THEN** Markdown 偏好 SHALL 仍为开启
-   **AND** 设置页 SHALL 不出现第二个 Markdown 开关

#### Scenario: 设置页旧快照不覆盖阅读偏好

-   **WHEN** 设置页先读取旧的 Markdown 偏好，用户随后在翻译界面切换该偏好，再从设置页提交或失焦保存其它字段
-   **THEN** 保存 SHALL 保留当前存储中的 Markdown 偏好，SHALL NOT 用旧表单快照覆盖它

## MODIFIED Requirements

### Requirement: ISettings 更新

`src/common/types.ts` 中 `ISettings` 接口 SHALL 包含以下 Provider 相关字段:`providers: ProviderConfig[]`、`defaultProviderId: string | null`、`defaultModel: ModelSelection | null`、`providerModelOutputControls?: ProviderModelOutputControls[]`。其余字段 SHALL 为 `automaticCheckForUpdates`、`enableBackgroundBlur`、`enableMica`(仅用于向 `enableBackgroundBlur` 提供缺省值)、`nativeLanguage`、`translationTargetLanguage`、`themeType`、`i18n`、`tts`、`restorePreviousPosition`、`runAtStartup`、`pinned`、`languageDetectionEngine`、`proxy`、`fontSize`、`renderMarkdown: boolean`。

运行时行为 SHALL NOT 依赖全局 `useStructuredOutput` 或 `useStrictSchema` 字段决定翻译请求是否启用结构化输出。旧版本设置中的同名顶层字段 SHALL NOT 被读取,且 SHALL NOT 写回持久化设置。`renderMarkdown` SHALL 作为已知设置字段读取和保存，SHALL NOT 作为 Provider + Model 的输出控制或请求参数。

#### Scenario: types.ts 字段添加

-   **WHEN** 在 `src/common/types.ts` 检查 `ISettings` 接口
-   **THEN** `providerModelOutputControls?: ProviderModelOutputControls[]`、`defaultModel: ModelSelection | null`、`renderMarkdown: boolean` 字段 SHALL 存在
-   **AND** `useStructuredOutput` 与 `useStrictSchema` 字段 SHALL NOT 存在

#### Scenario: 归一化默认值

-   **WHEN** 系统读取空 settings
-   **THEN** `automaticCheckForUpdates` SHALL 为 `true`,`themeType` 为 `'followTheSystem'`,`i18n` 为 `'en'`,`languageDetectionEngine` 为 `'local'`,`fontSize` 为 `15`,`nativeLanguage` 为 `'zh-Hans'`,`translationTargetLanguage` 为 `'en'`,`tts.provider` 为 `'edge'`,`renderMarkdown` 为 `false`
-   **AND** `proxy` SHALL 默认关闭,协议 `HTTP`,服务器 `127.0.0.1`,端口 `1080`,`noProxy` 为 `localhost,127.0.0.1`

#### Scenario: 全局结构化输出字段不再驱动请求

-   **WHEN** 旧设置中 `useStructuredOutput === true`，但当前 Provider + Model 没有启用 Structured Output 的 ProviderModelOutputControls 记录
-   **THEN** 翻译请求 SHALL NOT 启用结构化输出
-   **AND** 设置面板 SHALL NOT 把该旧全局字段显示为当前 Provider + Model 已启用
