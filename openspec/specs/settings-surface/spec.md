# settings-surface Specification

## Purpose
定义设置面板的组成与 `ISettings` 字段范围，以及对已移除能力(全局快捷键、赞助入口、Dock 隐藏与失焦隐藏、选词触发)的不再出现保证、i18n locale 文件结构和按 Provider + Model 配置的结构化输出开关。

## Requirements

### Requirement: 背景模糊不叠加

桌面端应用背景模糊前 SHALL 清除旧原生效果；快速切换主题或开关时 SHALL 顺序完成清除与应用，避免叠加多个原生视图。macOS 模糊层 SHALL 使用圆角，与窗口外观保持一致。

#### Scenario: 连续切换主题

- **WHEN** 启用背景模糊后连续切换主题
- **THEN** 最终窗口 SHALL 仅保留当前设置对应的效果，不残留旧模糊层

### Requirement: 桌面设置文件完整性

桌面设置的保存与键删除 SHALL 先写入同目录的唯一临时文件，再替换 `config.json`；失败时 SHALL 保留旧文件并清理临时文件。读取到损坏 JSON 或非对象 JSON 时 SHALL 将原文件保留为唯一的 `.corrupted` 备份并初始化空设置，不覆盖既有备份。原生字段类型错误 SHALL 使用原生默认值，不改写用户文件。配置读取错误 SHALL NOT 导致原生进程 panic。

#### Scenario: 写入失败

- **WHEN** 临时文件写入或替换失败
- **THEN** 原设置 SHALL 保持有效，错误 SHALL 传回调用方

#### Scenario: 损坏文件恢复

- **WHEN** 启动时发现 `config.json` 被截断
- **THEN** 系统 SHALL 保留损坏文件的全部字节，并以空设置继续启动

### Requirement: 更新检查不阻塞桌面任务

桌面端定期更新检查及更新提示前的等待 SHALL 使用异步计时器，不得阻塞 Tokio worker。等待期间，翻译、设置及其它桌面命令 SHALL 继续正常响应。

#### Scenario: 等待下一次更新检查

- **WHEN** 更新任务正在等待下一次检查
- **THEN** 等待 SHALL 让出执行线程，不占用运行时 worker 睡眠

### Requirement: 设置面板组成

设置面板(`src/common/components/Settings.tsx`)SHALL 按以下标签组织现有设置能力:

- General:界面语言(i18n)、LLM Providers 区块(Provider 列表、模型选择、思考与结构化输出控件)、母语(Native language)、翻译目标语言(Translation target language)、语言检测引擎、主题、字体大小;桌面端额外显示窗口背景模糊(Window background blur)、固定位置(Fixed Position)、自动检查更新;Tauri 端额外显示开机启动(Run at startup)
- Proxy:仅 Tauri 端显示，包含启用开关、协议、服务器、端口、用户名、密码、No proxy
- TTS:TTS backend / voice / volume / rate，以及 OpenAI TTS 子区(关联 Provider、TTS 模型及刷新、Voice、Audio format)

设置面板 MUST NOT 出现以下已移除的区域或表单项:
- 任何"快捷键 / Hotkey / Shortcut / 全局热键"区域或表单项
- 任何"Buy me a coffee / 赞助 / 捐赠 / WeChat Pay / Alipay"按钮、图片或弹窗
- `alwaysShowIcons`(选中文字时显示图标 / Always show icons)开关
- `autoTranslate`(自动翻译 / Auto Translate)开关
- `selectInputElementsText`(输入框划词 / Word selection in input)开关
- `readSelectedWordsFromInputElementsText`(输入框选词朗读 / Read the selected words in input)开关
- `hideTheIconInTheDock`(隐藏 Dock 栏中的图标 / Hide the icon in the Dock bar / Hide the icon in the taskbar)开关
- `autoHideWindowWhenOutOfFocus`(失去焦点时自动隐藏窗口)开关
- `disableCollectingStatistics`(禁用统计 / Disable collecting statistics)开关
- 全局的 Structured Output / Strict JSON Schema 开关(这两项只按 Provider + Model 配置)

#### Scenario: 设置面板渲染现有项

- **WHEN** 用户首次打开设置面板(空 settings)
- **THEN** UI SHALL 渲染 General 与 TTS 标签，桌面 Tauri 端额外渲染 Proxy 标签
- **AND** General 标签 SHALL 渲染 LLM Providers 区块、语言、主题、字体大小等上述设置项
- **AND** UI SHALL NOT 渲染任何上述被列为移除的表单项或按钮

#### Scenario: 设置面板源码不含被删 FormItem

- **WHEN** 在 `src/common/components/Settings.tsx` 中搜索如下 `name=` 字符串:
  `'hotkey'` / `'displayWindowHotkey'` / `'alwaysShowIcons'` / `'autoTranslate'` / `'selectInputElementsText'` / `'hideTheIconInTheDock'` / `'autoHideWindowWhenOutOfFocus'` / `'disableCollectingStatistics'` / `'useStructuredOutput'` / `'useStrictSchema'`
- **THEN** SHALL NOT 命中

#### Scenario: 设置面板源码不含被删组件

- **WHEN** 在 `src/common/components/Settings.tsx` 中搜索 `HotkeyRecorder` / `useRecordHotkeys` / `showBuyMeACoffee` / `setShowBuyMeACoffee` / `AutoTranslateCheckbox`
- **THEN** SHALL NOT 命中

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

`src/common/utils.ts` 的设置 key 列表(`settingKeys`)、默认值与 `normalizeSettings` SHALL NOT 包含或产出这些顶层字段;由于 `getSettings` 只读取已知 key、`setSettings` 只写已知 key,这些旧顶层字段 SHALL 既不被读取也不被写回。`useStructuredOutput` 与 `useStrictSchema` SHALL 只作为 ProviderModelOutputControls 的字段存在。

#### Scenario: types.ts 字段缺失

- **WHEN** 在 `src/common/types.ts` 检查 `ISettings` 接口
- **THEN** 上述字段名 SHALL NOT 作为 `ISettings` 的属性出现
- **AND** `useStructuredOutput` / `useStrictSchema` SHALL 仅出现在 `ProviderModelOutputControls` 接口中

#### Scenario: utils.ts 不处理被删字段

- **WHEN** 在 `src/common/utils.ts` 中按全词(独立标识符)搜索 `hotkey`、`displayWindowHotkey`、`alwaysShowIcons`、`autoTranslate`、`selectInputElementsText`、`readSelectedWordsFromInputElementsText`、`hideTheIconInTheDock`、`autoHideWindowWhenOutOfFocus`、`disableCollectingStatistics`
- **THEN** SHALL NOT 命中
- **AND** `useStructuredOutput` / `useStrictSchema` SHALL 只出现在 ProviderModelOutputControls 的归一化与解析逻辑中,SHALL NOT 出现在 `settingKeys` 中

### Requirement: 删除快捷键依赖与基础设施

应用 SHALL NOT 注册任何全局键盘快捷键。具体:
- `src-tauri/src/config.rs` 的 `Config` 结构 MUST NOT 包含 `hotkey` / `display_window_hotkey` 字段
- Tauri 主进程 MUST NOT 调用任何全局快捷键注册 API,`src-tauri/Cargo.toml` MUST NOT 依赖 `tauri-plugin-global-shortcut`
- `src-tauri/capabilities/` 下的 capability 文件 MUST NOT 声明 `global-shortcut:*` permissions
- `src/tauri/windows/TranslatorWindow.tsx` 与 `src/tauri/utils.ts` MUST NOT 包含 `bindHotkey` / `bindDisplayWindowHotkey` 等全局快捷键 helper 或调用
- 浏览器扩展 manifest MUST NOT 声明 `commands`,background MUST NOT 监听 `browser.commands.onCommand`,content script MUST NOT 使用 `hotkeys-js` 绑定快捷键
- `package.json` MUST NOT 依赖 `react-hotkeys-hook`、`hotkeys-js`、`@tauri-apps/plugin-global-shortcut`

菜单加速键不属于全局快捷键:托盘菜单 "Settings" 项 MAY 显示 `CmdOrCtrl+,`,macOS 应用菜单 MAY 提供 "Settings…" `Cmd+,`;托盘中以 `MenuItem::with_id` 创建的其它菜单项 SHALL NOT 设置加速键。`Translator.tsx` 内部针对 Enter / Shift+Enter 等的局部 keydown 监听 SHALL 保留。

#### Scenario: config.rs 与 Cargo.toml

- **WHEN** 检查 `src-tauri/src/config.rs`
- **THEN** 文件 SHALL NOT 包含 `hotkey` 或 `display_window_hotkey` 字段
- **WHEN** 检查 `src-tauri/Cargo.toml` 与 `src-tauri/capabilities/`
- **THEN** SHALL NOT 包含 `global-shortcut` 相关依赖或 permission

#### Scenario: 托盘菜单加速键

- **WHEN** 检查 `src-tauri/src/tray.rs` 中创建的菜单项
- **THEN** 只有 "Settings" 项 SHALL 带 `CmdOrCtrl+,` 加速键,"Check for Updates..."、"Show"、"Pin" 等其它项 SHALL 传 `None`

#### Scenario: 快捷键依赖引用

- **WHEN** 在 `src/`、`src-tauri/` 与 `package.json` 中搜索 `react-hotkeys-hook` / `hotkeys-js` / `@tauri-apps/plugin-global-shortcut` / `GlobalShortcut`
- **THEN** 命中数 SHALL 为 0

### Requirement: 删除 Buy me a coffee / 赞助路径

应用 MUST NOT 提供任何"赞助 / 捐赠 / Buy me a coffee / 请我喝杯咖啡"入口、按钮、Modal 或外链。具体:
- `Settings.tsx` SHALL NOT 包含 `showBuyMeACoffee` 状态、赞助按钮或赞助 Modal
- 仓库 SHALL NOT 包含 `wechat.png` / `alipay.png` 收款图片
- i18n locale SHALL NOT 包含 `Buy me a coffee` 等赞助相关 key

#### Scenario: 设置 About 区无赞助按钮

- **WHEN** 用户打开设置页、设置 header 或任何关于/版本区域
- **THEN** 页面 SHALL NOT 显示带 ❤️ 或"Buy me a coffee" / "请我喝杯咖啡"字样的按钮
- **AND** 页面 SHALL NOT 在任何交互后弹出包含微信支付 / 支付宝 / Patreon / Ko-fi / 收款二维码的 Modal

#### Scenario: 资产文件移除

- **WHEN** 检查 `src/common/assets/images/`
- **THEN** SHALL NOT 包含 `wechat.png` 或 `alipay.png`

#### Scenario: i18n key 移除

- **WHEN** 在所有 `src/common/i18n/locales/<lang>/translation.json` 中搜索 `Buy me a coffee`、`请我喝杯咖啡`、`coffee`
- **THEN** SHALL NOT 命中

### Requirement: 删除 macOS Dock 与窗口焦点行为

桌面端 macOS App 的 activation policy SHALL 始终为 `Regular`(在 Dock 与 Cmd+Tab 中可见)。`src-tauri/src/main.rs` SHALL 在启动时设置 `ActivationPolicy::Regular`,且 SHALL NOT 包含切换到 `ActivationPolicy::Accessory` 的代码路径。

桌面端窗口在失去焦点时 SHALL NOT 自动隐藏。`src/tauri/windows/TranslatorWindow.tsx` 的失焦回调 SHALL 只记录当前活动窗口(`rememberActiveWindowCommand`),MUST NOT 因失焦而调用 `hide()` / `close()`。

#### Scenario: macOS 始终在 Dock 显示

- **WHEN** 用户在 macOS 上启动 SimpleAI Translator 主窗口
- **THEN** Dock 中 SHALL 显示该 App 图标
- **AND** Cmd+Tab 应用切换器 SHALL 显示该 App
- **AND** 关闭主窗口 SHALL NOT 把 App 切换为 Accessory 模式

#### Scenario: 窗口失焦不隐藏

- **WHEN** 用户在 SimpleAI Translator 主窗口可见时切换到另一个 App
- **THEN** SimpleAI Translator 主窗口 SHALL 保持可见(可能在背景层),MUST NOT 自动 `hide()`

### Requirement: 删除选词/划词触发链路

选中文字 SHALL NOT 自动发起翻译、弹出任何浮动图标或翻译触发按钮。具体:
- 桌面端 SHALL NOT 包含鼠标全局 hook(`bind_mouse_hook` / `MouseHookEvent`)
- 浏览器扩展 content script SHALL 只在收到右键菜单(`contextMenus`)发出的 `open-translator` 消息时打开翻译卡片,并以菜单提供的 `selectionText` 作为原文;`mouseup` / `touchend` 监听 SHALL 仅记录卡片定位坐标,`mousedown` / `touchstart` 监听 SHALL 仅在未固定(`pinned`)时关闭卡片

#### Scenario: 选中文字无浮标

- **WHEN** 用户在桌面端任意位置或浏览器扩展宿主页面选中一段文本
- **THEN** SHALL NOT 出现 SimpleAI Translator 提供的浮动图标 / 弹气泡
- **AND** SHALL NOT 自动发起翻译请求

#### Scenario: 鼠标 hook 代码

- **WHEN** 在 `src-tauri/src/` 中搜索 `bind_mouse_hook` / `MouseHookEvent` / `always_show_icons`
- **THEN** 命中数 SHALL 为 0

### Requirement: i18n locale 文件结构对齐

界面语言 SHALL 为以下 6 种 locale:`en`、`zh-Hans`、`zh-Hant`、`ja`、`th`、`tr`,每种对应 `src/common/i18n/locales/<lang>/translation.json`,设置页 i18n 选择框 SHALL 只提供这 6 项。`en` SHALL 作为 `fallbackLng`;所有 6 种 locale 的 key 集合 SHALL 完全相同,新增或删除 key 时 SHALL 同步修改全部 locale。该约束由 `src/common/i18n/locales.spec.ts` 测试守护。

所有 locale SHALL NOT 包含以下已移除功能的 key:

- `Hotkey`、`Display window Hotkey`、`Please press the hotkey you want to set.`、`Click above to set hotkeys.`、`Shortcuts`
- `Buy me a coffee`、与"赞助"介绍相关的长句 key
- `Always show icons`、`Show icon when text is selected`
- `Auto Translate`
- `Word selection in input`、`Enable word selection for lookup in the input field`、`Read the selected words in input`
- `Hide the icon in the Dock bar`、`Hide the icon in the taskbar`
- `Auto hide window when out of focus`
- `disable collecting statistics`、`Disable collecting statistics`
- `Country Not Supported`、`Country Not Detected`

#### Scenario: 所有 locale key 集合相同

- **WHEN** 比较各 locale `translation.json` 与 `en/translation.json` 的 key 集合
- **THEN** 每个 locale 的 key 集合 SHALL 与 `en` 完全相同,既不缺失也不多出

#### Scenario: 已删 key 不存在

- **WHEN** 在任意一个 `translation.json` 中搜索本需求列出的 key 字符串
- **THEN** SHALL NOT 命中

### Requirement: Structured Output & Strict Schema Setting Toggles

The settings UI SHALL provide two boolean preferences for the currently selected provider + model combination in the LLM Providers section of the General tab:
1. "Use Structured Output": The main toggle enabling JSON responses for that provider + model.
2. "Strict JSON Schema": A sub-toggle (default true, only active when Structured Output is enabled) that forces the use of strict JSON Schema constraints for that provider + model.

These toggles SHALL be persisted to the matching ProviderModelOutputControls record. Both toggles SHALL be disabled when no model is selected. The UI SHALL NOT expose a global Structured Output or Strict JSON Schema toggle that applies to every provider and model.

#### Scenario: Toggle Visibility & Dependency

- **WHEN** a user opens the settings panel and a provider + model is selected
- **THEN** a switch for "Use Structured Output" SHALL be available for that provider + model
- **AND** a sub-switch for "Strict JSON Schema" SHALL be visible for that provider + model
- **AND** if "Use Structured Output" is false, "Strict JSON Schema" SHALL be disabled

#### Scenario: Warning Caption

- **WHEN** the "Strict JSON Schema" setting is rendered
- **THEN** it SHALL display the caption "Some older or third-party models only support JSON Object mode and may fail with Strict Schema enabled."

#### Scenario: Switching models loads matching controls

- **WHEN** 用户先为 Provider A + Model X 启用 Structured Output，然后切换到 Provider A + Model Y
- **THEN** 设置面板 SHALL 显示 Model Y 自己保存的 Structured Output / Strict JSON Schema 状态
- **AND** 如果 Model Y 没有保存记录，设置面板 SHALL 显示 Structured Output 关闭

### Requirement: ISettings 更新

`src/common/types.ts` 中 `ISettings` 接口 SHALL 包含以下 Provider 相关字段:`providers: ProviderConfig[]`、`defaultProviderId: string | null`、`defaultModel: ModelSelection | null`、`providerModelOutputControls?: ProviderModelOutputControls[]`。其余字段 SHALL 为 `automaticCheckForUpdates`、`enableBackgroundBlur`、`enableMica`(仅用于向 `enableBackgroundBlur` 提供缺省值)、`nativeLanguage`、`translationTargetLanguage`、`themeType`、`i18n`、`tts`、`restorePreviousPosition`、`runAtStartup`、`pinned`、`languageDetectionEngine`、`proxy`、`fontSize`。

运行时行为 SHALL NOT 依赖全局 `useStructuredOutput` 或 `useStrictSchema` 字段决定翻译请求是否启用结构化输出。旧版本设置中的同名顶层字段 SHALL NOT 被读取,且 SHALL NOT 写回持久化设置。

#### Scenario: types.ts 字段添加

- **WHEN** 在 `src/common/types.ts` 检查 `ISettings` 接口
- **THEN** `providerModelOutputControls?: ProviderModelOutputControls[]`、`defaultModel: ModelSelection | null` 字段 SHALL 存在
- **AND** `useStructuredOutput` 与 `useStrictSchema` 字段 SHALL NOT 存在

#### Scenario: 归一化默认值

- **WHEN** 系统读取空 settings
- **THEN** `automaticCheckForUpdates` SHALL 为 `true`,`themeType` 为 `'followTheSystem'`,`i18n` 为 `'en'`,`languageDetectionEngine` 为 `'local'`,`fontSize` 为 `15`,`nativeLanguage` 为 `'zh-Hans'`,`translationTargetLanguage` 为 `'en'`,`tts.provider` 为 `'edge'`
- **AND** `proxy` SHALL 默认关闭,协议 `HTTP`,服务器 `127.0.0.1`,端口 `1080`,`noProxy` 为 `localhost,127.0.0.1`

#### Scenario: 全局结构化输出字段不再驱动请求

- **WHEN** 旧设置中 `useStructuredOutput === true`，但当前 Provider + Model 没有启用 Structured Output 的 ProviderModelOutputControls 记录
- **THEN** 翻译请求 SHALL NOT 启用结构化输出
- **AND** 设置面板 SHALL NOT 把该旧全局字段显示为当前 Provider + Model 已启用
