## MODIFIED Requirements

### Requirement: ISettings 更新

`src/common/types.ts` 中 `ISettings` 接口 SHALL 包含以下 Provider 相关字段:`providers: ProviderConfig[]`、`defaultProviderId: string | null`、`defaultModel: ModelSelection | null`、`providerModelOutputControls?: ProviderModelOutputControls[]`。其余字段 SHALL 为 `automaticCheckForUpdates`、`enableBackgroundBlur`、`nativeLanguage`、`translationTargetLanguage`、`themeType`、`i18n`、`tts`、`restorePreviousPosition`、`runAtStartup`、`pinned`、`languageDetectionEngine`、`proxy`、`fontSize`、`renderMarkdown: boolean`。

运行时行为 SHALL NOT 依赖全局 `useStructuredOutput` 或 `useStrictSchema` 字段决定翻译请求是否启用结构化输出。旧版本设置中的同名顶层字段 SHALL NOT 被读取,且 SHALL NOT 写回持久化设置。`renderMarkdown` SHALL 作为已知设置字段读取和保存，SHALL NOT 作为 Provider + Model 的输出控制或请求参数。

#### Scenario: types.ts 字段添加

-   **WHEN** 在 `src/common/types.ts` 检查 `ISettings` 接口
-   **THEN** `providerModelOutputControls?: ProviderModelOutputControls[]`、`defaultModel: ModelSelection | null`、`renderMarkdown: boolean` 字段 SHALL 存在
-   **AND** `useStructuredOutput`、`useStrictSchema` 与 `enableMica` 字段 SHALL NOT 存在

#### Scenario: 归一化默认值

-   **WHEN** 系统读取空 settings
-   **THEN** `automaticCheckForUpdates` SHALL 为 `true`,`themeType` 为 `'followTheSystem'`,`i18n` 为 `'en'`,`languageDetectionEngine` 为 `'local'`,`fontSize` 为 `15`,`nativeLanguage` 为 `'zh-Hans'`,`translationTargetLanguage` 为 `'en'`,`tts.provider` 为 `'edge'`,`renderMarkdown` 为 `false`
-   **AND** `proxy` SHALL 默认关闭,协议 `HTTP`,服务器 `127.0.0.1`,端口 `1080`,`noProxy` 为 `localhost,127.0.0.1`

#### Scenario: 全局结构化输出字段不再驱动请求

-   **WHEN** 旧设置中 `useStructuredOutput === true`，但当前 Provider + Model 没有启用 Structured Output 的 ProviderModelOutputControls 记录
-   **THEN** 翻译请求 SHALL NOT 启用结构化输出
-   **AND** 设置面板 SHALL NOT 把该旧全局字段显示为当前 Provider + Model 已启用

### Requirement: 部分设置写入

只修改部分字段的设置写入(如主界面 Markdown 开关、主界面模型切换、浮窗固定、OpenAI TTS 回退)SHALL 只持久化被修改的字段,存储中的其它字段 SHALL 保持原值。写入值 SHALL 在当前已存储设置的基础上校验,依赖 Provider 的字段 SHALL 以已存储的 `providers` 校验。每次写入 SHALL 只对设置存储发起一次写操作。`providers` SHALL 仅在写入包含它时写入;写入包含 `providers`、`defaultProviderId` 或 `defaultModel` 中任一字段时,SHALL 同时写入校验后的 `defaultProviderId` 与 `defaultModel`。设置面板的提交与失焦保存 SHALL 同样只持久化相对其上次加载或保存的值发生变化的字段;没有变化时 SHALL NOT 写入。写入包含 `providers` 而不包含 `tts` 时,若**已存储的** `tts` 关联 OpenAI TTS 且其 Provider 在新列表中已失效,系统 SHALL 在同一次写入中把已存储的 `tts` 以 `provider: 'edge'` 写回(其余字段保持已存储值),并 SHALL NOT 使用调用方持有的旧 `tts` 快照。

#### Scenario: 其它界面保存后再切换 Markdown

-   **WHEN** 翻译界面保持打开期间,另一个界面保存了新的 Provider 与字号,随后用户在翻译界面切换 Markdown
-   **THEN** 存储中的 `renderMarkdown` SHALL 为新值
-   **AND** 另一个界面保存的 Provider 与字号 SHALL 保持不变

#### Scenario: 部分写入不清空 Provider

-   **WHEN** 一次写入只包含 `renderMarkdown` 或 `pinned`
-   **THEN** 存储中的 `providers`、`defaultProviderId` 与 `defaultModel` SHALL 保持不变

#### Scenario: 设置面板只保存改动字段

-   **WHEN** 设置面板打开期间,翻译界面保存了新的 `defaultModel`,随后用户在设置面板只修改字号并保存
-   **THEN** 存储中的 `fontSize` SHALL 为新值
-   **AND** 翻译界面保存的 `defaultModel` SHALL 保持不变

#### Scenario: 删除 Provider 时不覆盖其它界面保存的 TTS

-   **WHEN** 设置面板加载时 `tts` 关联 Provider p1,随后另一界面把 TTS 改为 `system`(或改为关联仍有效的 p2)并保存,之后用户在设置面板删除 p1
-   **THEN** 存储中的 `tts` SHALL 保持另一界面保存的值
-   **AND** 系统 SHALL NOT 提示 OpenAI TTS 已切换到 Edge TTS

#### Scenario: 删除关联 Provider 时同次写入回退

-   **WHEN** 已存储的 `tts` 为 `openai` 并关联 p1,用户在设置面板删除 p1
-   **THEN** 同一次写入 SHALL 把存储中的 `tts.provider` 改为 `'edge'`,`tts` 的其它字段保持不变

#### Scenario: 切换模型不回写 Provider

-   **WHEN** 一次写入只包含 `defaultProviderId` 与 `defaultModel`
-   **THEN** 该写入 SHALL NOT 包含 `providers`,存储中的 Provider SHALL 保持不变

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
-   **AND** Chrome、Firefox 与 Tauri 的现有设置存储路径 SHALL 均遵守此行为

#### Scenario: 保存其它设置

-   **WHEN** 用户开启 Markdown，再进入设置修改并保存字号、语言或其它字段
-   **THEN** Markdown 偏好 SHALL 仍为开启
-   **AND** 设置页 SHALL 不出现第二个 Markdown 开关

#### Scenario: 设置页旧快照不覆盖阅读偏好

-   **WHEN** 设置页先读取旧的 Markdown 偏好，用户随后在翻译界面切换该偏好，再从设置页提交或失焦保存其它字段
-   **THEN** 保存 SHALL 保留当前存储中的 Markdown 偏好，SHALL NOT 用旧表单快照覆盖它

### Requirement: 桌面设置文件完整性

桌面设置的保存 SHALL 由原生进程在同一把锁内完成：读取当前 `config.json`，合并写入的键，先写入同目录的唯一临时文件，再替换 `config.json`；失败时 SHALL 保留旧文件并清理临时文件。各窗口的 WebView SHALL NOT 自行读改写整个 `config.json`;设置写入接口 SHALL NOT 提供删除键的能力。读取到非法 UTF-8、损坏 JSON 或非对象 JSON 时 SHALL 将原文件的全部字节保留为唯一的 `.corrupted` 备份并初始化空设置，不覆盖既有备份。原生字段类型错误 SHALL 使用原生默认值，不改写用户文件。配置读取错误 SHALL NOT 导致原生进程 panic。

#### Scenario: 写入失败

- **WHEN** 临时文件写入或替换失败
- **THEN** 原设置 SHALL 保持有效，错误 SHALL 传回调用方

#### Scenario: 多窗口同时保存

- **WHEN** 翻译窗口与设置窗口几乎同时保存不同的键
- **THEN** 两次保存的键 SHALL 都保留在 `config.json` 中，后完成的保存 SHALL NOT 恢复另一次保存之前的值

#### Scenario: 损坏文件恢复

- **WHEN** 启动时发现 `config.json` 被截断
- **THEN** 系统 SHALL 保留损坏文件的全部字节，并以空设置继续启动

#### Scenario: 非法 UTF-8 配置恢复

- **WHEN** `config.json` 包含非法 UTF-8 字节或被截断的多字节字符
- **THEN** 系统 SHALL 先逐字节完整保留原文件为 `.corrupted` 备份，再初始化空设置
- **AND** 后续保存设置 SHALL NOT 覆盖该备份
