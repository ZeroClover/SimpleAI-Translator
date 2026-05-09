# settings-surface Specification

## Purpose
TBD - created by archiving change simpleai-translator-rebrand. Update Purpose after archive.
## Requirements
### Requirement: 设置面板保留现有未删功能

设置面板(`Settings.tsx`)SHALL 删除本变更明确列出的设置项,但 MUST NOT 因本变更额外删除原始提示词未要求删除的设置能力。

以下现有设置能力 MAY 继续保留,也 MAY 按现有 UI 结构组织在 General / Proxy / Text-to-Speech 等 tab 中:
- 语言、主题、字体大小、窗口背景模糊、固定位置
- 默认目标语言、语言检测引擎
- LLM Provider 多配置列表与新增/编辑表单
- TTS backend / voice / volume / rate,以及 OpenAI TTS 子区
- 代理配置、开机启动、自动检查更新

设置面板 MUST NOT 出现以下被本变更移除的区域或表单项:
- 任何"快捷键 / Hotkey / Shortcut / 全局热键"区域或表单项
- 任何"Buy me a coffee / 赞助 / 捐赠 / WeChat Pay / Alipay"按钮、图片或弹窗
- `alwaysShowIcons`(选中文字时显示图标 / Always show icons)开关
- `autoTranslate`(自动翻译 / Auto Translate)开关
- `selectInputElementsText`(输入框划词 / Word selection in input)开关
- `readSelectedWordsFromInputElementsText`(输入框选词朗读 / Read the selected words in input)开关
- `hideTheIconInTheDock`(隐藏 Dock 栏中的图标 / Hide the icon in the Dock bar / Hide the icon in the taskbar)开关
- `autoHideWindowWhenOutOfFocus`(失去焦点时自动隐藏窗口)开关
- `disableCollectingStatistics`(禁用统计 / Disable collecting statistics)开关

#### Scenario: 设置面板渲染保留项

- **WHEN** 用户首次打开设置面板(空 settings)
- **THEN** UI SHALL 继续渲染 Provider、TTS、语言/主题/字体、代理(桌面端)、启动/更新等未被本变更点名删除的设置能力
- **AND** UI SHALL NOT 渲染任何上述被列为移除的表单项或按钮

#### Scenario: 设置面板源码不含被删 FormItem

- **WHEN** 在 `src/common/components/Settings.tsx` 中搜索如下 `name=` 字符串:
  `'hotkey'` / `'displayWindowHotkey'` / `'alwaysShowIcons'` / `'autoTranslate'` / `'selectInputElementsText'` / `'hideTheIconInTheDock'` / `'autoHideWindowWhenOutOfFocus'` / `'disableCollectingStatistics'`
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

`src/common/utils.ts` 中默认值与规范化函数 SHALL NOT 为这些字段提供 default、不在迁移路径中保留它们。

#### Scenario: types.ts 字段缺失

- **WHEN** 在 `src/common/types.ts` 检查 `ISettings` 接口
- **THEN** 上述字段名 SHALL NOT 出现

#### Scenario: utils.ts 默认值缺失

- **WHEN** 在 `src/common/utils.ts` 中搜索上述字段名
- **THEN** SHALL NOT 命中(允许 `openspec/` 与 git history 中保留历史)

### Requirement: 删除快捷键依赖与基础设施

应用 SHALL NOT 注册任何全局键盘快捷键。具体:
- `src-tauri/src/config.rs` 的 `Config` 结构 MUST NOT 包含 `hotkey` / `display_window_hotkey` 字段
- `src-tauri/src/tray.rs` 的菜单项 MUST NOT 设置 accelerator(传 `None`)
- Tauri 主进程 MUST NOT 调用任何全局快捷键注册 API(`tauri::GlobalShortcutManager` 等)
- `src/tauri/windows/TranslatorWindow.tsx` MUST NOT 调用 `bindHotkey` / `bindDisplayWindowHotkey` 等等价函数
- `src/tauri/utils.ts` MUST NOT 保留 `bindHotkey` / `bindDisplayWindowHotkey` 等全局快捷键 helper
- 浏览器扩展 manifest MUST NOT 声明 `commands`,background MUST NOT 监听 `browser.commands.onCommand`,content script MUST NOT 使用 `hotkeys-js` 绑定用户配置快捷键
- `react-hotkeys-hook`、`hotkeys-js`、`@tauri-apps/plugin-global-shortcut` 在确认无其它使用点后从 `package.json` 依赖中移除
- `src-tauri/capabilities/migrated.json` MUST NOT 保留 `global-shortcut:*` permissions

`Translator.tsx` 内部针对回车 / Shift+Enter / Esc 等的局部 keydown 监听不属于"全局快捷键"范畴,SHALL 保留。

#### Scenario: Cargo.toml 与 config.rs

- **WHEN** 检查 `src-tauri/src/config.rs`
- **THEN** 文件 SHALL NOT 包含 `hotkey:` 或 `display_window_hotkey:` 字段
- **WHEN** 检查 `src-tauri/Cargo.toml`
- **THEN** SHALL NOT 包含 `tauri-plugin-global-shortcut` 等全局快捷键插件依赖(若曾经存在)

#### Scenario: Tauri 启动不注册全局快捷键

- **WHEN** 启动桌面端应用并在系统层观察 macOS Accessibility 权限请求
- **THEN** 应用 SHALL NOT 触发与全局快捷键相关的辅助功能权限请求

#### Scenario: 快捷键依赖引用

- **WHEN** 在仓库中搜索 `from 'react-hotkeys-hook'` / `hotkeys-js` / `@tauri-apps/plugin-global-shortcut`
- **THEN** SHALL 满足以下之一:
  - 命中数为 0(已移除依赖),且 `package.json` 中无对应依赖
  - 仅在非快捷键用途的局部组件中命中(则保留依赖,但 PR 中 MUST 说明保留原因)

### Requirement: 删除 Buy me a coffee / 赞助路径

应用 MUST NOT 提供任何"赞助 / 捐赠 / Buy me a coffee / 请我喝杯咖啡"入口、按钮、Modal 或外链。具体:
- `Settings.tsx` 中 `showBuyMeACoffee` 状态、按钮、Modal 全部删除
- `src/common/assets/images/wechat.png` 与 `alipay.png`,若不再被任何组件引用,SHALL 从仓库中删除
- 所有 i18n locale 中的相关 key(`Buy me a coffee` / 介绍语)SHALL 删除

#### Scenario: 设置 About 区无赞助按钮

- **WHEN** 用户打开设置页、设置 header 或任何关于/版本区域
- **THEN** 页面 SHALL NOT 显示带 ❤️ 或"Buy me a coffee" / "请我喝杯咖啡"字样的按钮
- **AND** 页面 SHALL NOT 在任何交互后弹出包含微信支付 / 支付宝 / Patreon / Ko-fi / 收款二维码的 Modal

#### Scenario: 资产文件移除

- **WHEN** 检查 `src/common/assets/images/`
- **THEN** SHALL NOT 包含 `wechat.png` 或 `alipay.png`(除非这些文件还被其它非赞助场景引用,该例外需要在 PR 中显式说明)

#### Scenario: i18n key 移除

- **WHEN** 在所有 `src/common/i18n/locales/<lang>/translation.json` 中搜索 `Buy me a coffee`、`请我喝杯咖啡`、对应的"介绍语" key
- **THEN** SHALL NOT 命中

### Requirement: 删除 macOS Dock 与窗口焦点行为

桌面端 macOS App 的 activation policy SHALL 始终为 `Regular`(在 Dock 与 Cmd+Tab 中可见)。`src-tauri/src/main.rs` 中 SHALL NOT 包含基于设置切换 `set_activation_policy(ActivationPolicy::Accessory)` 的代码路径。

桌面端窗口在失去焦点时 SHALL NOT 自动隐藏。`src/tauri/windows/TranslatorWindow.tsx` 中针对 `blur` / `focus_out` / `WindowEvent::Focused(false)` 的副作用 SHALL 仅保留必要的非副作用观察(若任何),MUST NOT 因失焦而调用 `hide()` / `close()`。

#### Scenario: macOS 始终在 Dock 显示

- **WHEN** 用户在 macOS 上启动 SimpleAI Translator 主窗口
- **THEN** Dock 中 SHALL 显示该 App 图标
- **AND** Cmd+Tab 应用切换器 SHALL 显示该 App
- **AND** 关闭主窗口 SHALL NOT 把 App 切换为 Accessory 模式

#### Scenario: 窗口失焦不隐藏

- **WHEN** 用户在 SimpleAI Translator 主窗口可见时切换到另一个 App
- **THEN** SimpleAI Translator 主窗口 SHALL 保持可见(可能在背景层),MUST NOT 自动 `hide()`

### Requirement: 删除选词/划词触发链路

桌面端的鼠标全局 hook(`bind_mouse_hook` 等)与浏览器扩展 content script 中的 input/textarea 选词监听 SHALL 不再因 `alwaysShowIcons` / `autoTranslate` / `selectInputElementsText` 等设置触发任何 UI 或翻译请求。具体:
- 若 `bind_mouse_hook` 仅供 `alwaysShowIcons` 使用,SHALL 整段删除
- 若浏览器扩展 content script 中存在仅服务 `autoTranslate` / `alwaysShowIcons` / `selectInputElementsText` 的 selection 监听分支,SHALL 删除该分支
- 删除后,选中文字 SHALL NOT 自动发起翻译、弹出任何浮动图标或翻译触发按钮

#### Scenario: 选中文字无浮标

- **WHEN** 用户在桌面端任意位置或浏览器扩展宿主页面选中一段文本
- **THEN** SHALL NOT 出现 SimpleAI Translator 提供的浮动图标 / 弹气泡

#### Scenario: 鼠标 hook 代码

- **WHEN** 在 `src-tauri/src/main.rs` 中搜索 `bind_mouse_hook` / `MouseHookEvent`
- **THEN** SHALL 满足以下之一:
  - 命中数为 0(整段删除)
  - 仅命中调试日志或非"弹图标"用途的代码,且不读取 `always_show_icons` 配置

### Requirement: i18n locale 文件结构对齐

所有 `src/common/i18n/locales/<lang>/translation.json` 文件 SHALL 拥有完全相同的 key 集合(value 可不同),且 SHALL 删除以下被本变更移除的 key(完整列表来自 proposal 与代码探查):

- `Hotkey`、`Display window Hotkey`、`Please press the hotkey you want to set.`、`Click above to set hotkeys.`、`Shortcuts`
- `Buy me a coffee`、与"赞助"介绍相关的长句 key
- `Always show icons`、`Show icon when text is selected`
- `Auto Translate`
- `Word selection in input`、`Enable word selection for lookup in the input field`、`Read the selected words in input`
- `Hide the icon in the Dock bar`、`Hide the icon in the taskbar`
- `Auto hide window when out of focus`
- `disable collecting statistics`、`Disable collecting statistics`

#### Scenario: 各 locale key 数量一致

- **WHEN** 比较各 locale `translation.json` 的 key 集合(去除 value)
- **THEN** 所有 locale 文件 SHALL 拥有完全相同的 key 集合

#### Scenario: 已删 key 不存在

- **WHEN** 在任意一个 `translation.json` 中搜索本需求列出的 key 字符串
- **THEN** SHALL NOT 命中

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
