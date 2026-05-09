## Why

`slim-to-translation-core` 已完成把项目聚焦回"翻译"这一核心定位的工作,但仍残留着早期项目阶段引入的非翻译 UX(整套快捷键面板、捐赠入口、"选中文字时显示图标 / 输入框划词 / 自动翻译"等自动触发路径)、桌面平台 UX 旋钮("隐藏 Dock 图标 / 失去焦点自动隐藏窗口")以及 Sentry + Google Analytics + Aptabase 三套统计埋点。这些项目在新的"轻量、单功能、无追踪"产品定位下不再必要,且让设置面板继续显得拥挤、让构建产物继续依赖三方 telemetry SDK。

本变更要完成应用身份切换(更名为 SimpleAI Translator、桌面 Bundle ID 改为 `io.zeroclover.app.simpleai-translator`)与上述功能精简。浏览器插件的**代码与功能**可以纳入本次清理,但浏览器插件的**所有者 / 商店条目 / 签名身份 / Chrome 或 Firefox 扩展 ID**不在本次变更范围内。GitHub 远程仓库、仓库 URL、README 徽章/链接、Tauri updater endpoint 指向的远程仓库也不在本次变更范围内。

## What Changes

- **BREAKING** 桌面端 Bundle Identifier 从 `xyz.yetone.apps.openai-translator` 改为 `io.zeroclover.app.simpleai-translator`;Product Name 从 `NextAI Translator` 改为 `SimpleAI Translator`。新 Bundle ID 与旧 Bundle ID 不共享 `~/Library/Application Support/<id>/` 目录,本变更按"新 App"处理,**不迁移**旧 Bundle ID 下的任何用户数据(Provider 配置、历史记录、设置)。
- **BREAKING** 应用可见产品名切换为 `SimpleAI Translator`:Tauri `productName`、桌面/插件窗口标题、`<title>`、浏览器插件 manifest `name` / `description`、Tauri 窗口 / 托盘菜单、所有 i18n 展示文案中的 "NextAI Translator" 替换为 "SimpleAI Translator"。不修改 GitHub 远程仓库 URL、`package.json.repository.url`、README 远程链接、Tauri updater endpoint URL、Firefox `gecko.id`、Chrome Web Store 条目或扩展签名身份。
- **BREAKING** `src/common/constants.ts` 中 `PREFIX` 与浏览器插件 content script 中 `popupThumbID / popupCardID / containerID / popupCardInnerContainerId` 的命名空间从 `__yetone-nextai-translator*` 改为 `__zeroclover-simpleai-translator*`;Tauri IPC socket 路径从 `/tmp/openai-translator.sock` 改为 `/tmp/simpleai-translator.sock`。这属于代码命名空间变更,不是浏览器插件所有者变更。
- **BREAKING** 删除 `src-tauri/src/config.rs` 中从 `xyz.yetone.apps.openai-translator` → `xyz.yetone.apps.nextai-translator` 的历史迁移代码;新 Bundle ID 启动时不读取任何旧目录,首次启动即创建空的 `io.zeroclover.app.simpleai-translator/` 配置目录。
- **BREAKING** 移除整个**快捷键设置区与快捷键触发链路**:包括 `ISettings.hotkey` / `displayWindowHotkey` 字段、`Settings.tsx` 中 `HotkeyRecorder` 组件与对应 FormItem、`react-hotkeys-hook` 依赖在 Settings 中的使用、`src-tauri/src/config.rs` 中 `hotkey` / `display_window_hotkey` Rust 字段、Tauri `tray.rs` 显示窗口菜单项上的 accelerator、`TranslatorWindow.tsx` 中 `bindHotkey` / `bindDisplayWindowHotkey` 调用、`src/tauri/utils.ts` 中全局快捷键注册 helper 与对应测试、浏览器插件 manifest `commands` / background command listener / content script `hotkeys-js` 绑定、Tauri capabilities 中的 global-shortcut permission,以及所有相关 i18n 键。本应用不再注册全局快捷键或浏览器插件命令快捷键;托盘菜单点击、浏览器插件按钮点击、浏览器右键菜单(若保留)与输入框内回车仍是显式触发入口。
- **BREAKING** 移除"赞助 / Buy me a coffee"功能:`Settings.tsx` 中 `showBuyMeACoffee` 状态、按钮、Modal、`wechat.png` / `alipay.png` 图片资源(若仅供该 Modal 使用)、`buy_me_a_coffee_clicked` 埋点(随统计移除一并删除)、所有 i18n 中的 `Buy me a coffee` / `请我喝杯咖啡` / 介绍语键。
- **BREAKING** 移除以下设置项及其全部代码路径:
  - `alwaysShowIcons`(选中文字时显示图标)— 移除 `ISettings` 字段、`Settings.tsx` UI、Tauri 鼠标 hook 中相关分支、浏览器插件 content script 中弹浮标分支;由于该应用不再依赖"选中即弹图标"流,鼠标 hook / thumb window 相关入口若仅供此功能可一并裁剪。
  - `autoTranslate`(自动翻译)— 移除 `ISettings` 字段、`AutoTranslateCheckbox` 组件、浏览器插件 content script 中所有 `settings.autoTranslate` 分支(改为始终需要显式触发翻译);若 `Translator.tsx` 中存在同类自动翻译读取也一并删除,当前实现以 code search 结果为准。
  - `selectInputElementsText`(输入框划词)— 移除 `ISettings` 字段、`Settings.tsx` UI、浏览器插件 content script 中针对 input/textarea 的 selection 监听分支。
  - `hideTheIconInTheDock`(隐藏 Dock 栏中的图标)— 移除 `ISettings` 字段、Tauri `config.rs` 中 `hide_the_icon_in_the_dock` 字段、`main.rs` 中 `set_activation_policy` 相关分支;桌面端始终保留 Dock 图标(macOS `Regular` activation policy)。
  - `autoHideWindowWhenOutOfFocus`(失去焦点时自动隐藏窗口)— 移除 `ISettings` 字段、`TranslatorWindow.tsx` 中焦点丢失隐藏窗口的副作用与依赖。
- **BREAKING** 移除"禁用统计"设置项及全部统计/遥测代码:删除 `ISettings.disableCollectingStatistics` 字段;删除整个 `src/common/analysis.ts`(Sentry + Google Analytics 初始化);删除 Tauri 侧 Aptabase 集成(`package.json` 中 `@aptabase/tauri`、`src-tauri/Cargo.toml` 中 `tauri-plugin-aptabase` 依赖、`main.rs` 中 plugin 注册与 `track_event("app_started" / "app_exited", ...)`、Tauri capabilities / generated schemas 中 Aptabase permission);删除 `src/tauri/windows/HistoryWindow.tsx` / `UpdaterWindow.tsx` / `src/tauri/components/Window.tsx` / `Settings.tsx` 中所有 `trackEvent` / `trackTauriEvent` 调用;移除 `package.json` 中 `@sentry/react`、`react-ga4` 依赖;移除浏览器插件 manifest 中 Sentry / GA host permissions。本应用从此**不发送任何遥测**,设置面板也不再展示"禁用统计"开关(因为没有统计可禁)。
- 同步更新所有 i18n 文件:删除上述被删功能引用的所有 key(每个 locale 文件保持结构一致);更新提及 "NextAI Translator" 的产品名文案。

## Capabilities

### New Capabilities

- `app-identity`:产品标识(应用名、桌面 Bundle ID、DOM/IPC 命名空间前缀、可执行文件名)、安装目录归属、首次启动行为(无旧数据迁移路径)、浏览器插件可见 manifest 字段(name / description)。明确排除浏览器插件所有者 / 商店条目 / 签名身份 / 扩展 ID,也排除 GitHub 远程仓库和 updater endpoint 远程地址。
- `settings-surface`:精简后的桌面端 + 浏览器插件共用设置面板形态 —— 明确禁止再次出现已删项(快捷键区、捐赠区、自动触发类 UX 旋钮、Dock 行为旋钮、统计开关),同时保留原始提示词未要求删除的现有设置能力(Provider、TTS、目标语言、语言检测引擎、主题、代理、字体、开机启动、自动更新、窗口背景等)。
- `no-telemetry`:产品对外的"零遥测"承诺 —— 进程不向任何第三方遥测域名发送请求;构建产物不依赖 Sentry / GA / Aptabase 类 SDK;浏览器插件 manifest 不申请相关 host permission。

### Modified Capabilities

- `translation-core`(由 `slim-to-translation-core` 引入):新增"翻译只能由用户显式触发"的需求(禁止 `autoTranslate` 自动触发、禁止 `selectInputElementsText` 输入框划词触发);其余翻译流程不变。本变更以 ADDED Requirement 形式叠加在 `translation-core` spec 上,不修改 slim 已有 Requirement 的文本。
- `text-to-speech` 与 `llm-provider-config`(均由 `slim-to-translation-core` 引入):无需求级修改 —— 仅 i18n 文案中产品名替换的连带影响,不在本提案的 spec 范围内。

## Impact

- **代码影响**:
  - `src-tauri/tauri.conf.json` 改 `productName` 与 `identifier`;不改 `updater.endpoints` 的远程 URL。
  - `package.json` 改 package `name` / `description`;同步处理仍保留的 legacy Electron `build.appId` / `build.productName` / `build.extraMetadata.name`,或确认无用后删除 legacy `build` 块,但不修改 `repository.url`。
  - `src-tauri/Cargo.toml` 移除 `tauri-plugin-aptabase` 与 `tauri-plugin-global-shortcut` 依赖(若无其它使用);`src-tauri/src/main.rs` 移除 `tauri_plugin_aptabase::EventTracker` import、plugin 注册与 `track_event` 调用;移除 `bind_mouse_hook` 中 `always_show_icons` 分支(若 hook 整体仅供已删功能则整段删除);移除 `set_activation_policy` 中 `hide_the_icon_in_the_dock` 分支。
  - `src-tauri/capabilities/migrated.json` 移除 `aptabase:*` 与 `global-shortcut:*` permissions;重新生成或同步更新 `src-tauri/gen/schemas/*` 中因依赖移除而过期的 plugin schema。
  - `src-tauri/src/config.rs` 删除 `hotkey` / `display_window_hotkey` / `hide_the_icon_in_the_dock` 字段、删除从旧 Bundle ID 迁移配置目录的逻辑。
  - `src-tauri/src/windows.rs` 替换窗口标题字符串。
  - `src-tauri/src/tray.rs` 移除菜单项上的 `display_window_hotkey` accelerator 引用。
  - `src/common/types.ts` 从 `ISettings` 删除 `hotkey` / `displayWindowHotkey` / `alwaysShowIcons` / `autoTranslate` / `selectInputElementsText` / `hideTheIconInTheDock` / `autoHideWindowWhenOutOfFocus` / `disableCollectingStatistics` 字段。
  - `src/common/utils.ts` 删除上述字段在默认值 / 规范化函数中的映射。
  - `src/common/constants.ts` 修改 `PREFIX`。
  - `src/common/components/Settings.tsx` 删除 `HotkeyRecorder` 组件与样式、删除快捷键 FormItem、删除 Buy me a coffee 状态/按钮/Modal、删除上述五个 UX 设置项的 FormItem、删除 `disableCollectingStatistics` FormItem、删除 `trackTauriEvent` hook 与所有调用。
  - `src/common/components/Translator.tsx` 不应读取 `settings.autoTranslate`;当前若无读取则无需改动,只保留回车/按钮等局部显式触发。
  - `src/common/analysis.ts` 整文件删除;所有 `import { setupAnalysis } from '@/common/analysis'` 调用点(包括 Tauri 与浏览器插件入口)同步删除。
  - `src/tauri/windows/TranslatorWindow.tsx` 删除 `bindHotkey` / `bindDisplayWindowHotkey` 调用与失去焦点隐藏窗口副作用;`src/tauri/utils.ts` 删除全局快捷键 helper,并删除或重写 `src/tauri/utils.spec.ts` 中相关测试。
  - `src/tauri/windows/HistoryWindow.tsx` / `UpdaterWindow.tsx` / `src/tauri/components/Window.tsx` 删除 `@aptabase/tauri` import 与 `trackEvent` 调用。
  - `src/tauri/index.html` / `src/browser-extension/options/index.html` / `src/browser-extension/popup/index.html` 替换 `<title>`。
  - `src/browser-extension/manifest.ts` 替换 `name` / `description`、移除 Sentry / GA host permissions、移除任何快捷键相关 `commands`;不修改 Firefox `gecko.id` / `applications.gecko.id`。
  - `src/browser-extension/content_script/consts.ts` 替换四个 ID 命名空间。
  - `src/browser-extension/content_script/index.tsx`(或同等 entry)移除针对 input/textarea 的 `selectInputElementsText` 选词分支、`settings.autoTranslate` 自动翻译分支、`settings.alwaysShowIcons` 浮标分支、`hotkeys-js` 绑定与 `classNamePrefix='__yetone-nextai-translator-jss-'`。
  - `src/browser-extension/background/index.ts` 更新右键菜单 title 为 SimpleAI Translator,删除 `browser.commands.onCommand` 监听。
  - `src/tauri/App.tsx`、`src/tauri/windows/ThumbWindow.tsx`、`src-tauri/src/windows.rs` 中的 thumb window 代码若仅服务选中浮标,应与 `bind_mouse_hook` 一并删除;保留显式打开翻译窗口的命令和 tray 行为。
  - `src/common/internal-services/db.ts` 的 Dexie 数据库名从 `openai-translator` 改为新命名空间;`src/common/highlight-in-textarea/*` 中 `yetone-hit` 类名/ID 改为新命名空间;`src/common/components/LogoWithText.tsx` 与 `src/common/tts/index.ts` 中产品名同步替换。
  - `src/common/assets/images/wechat.png` / `alipay.png` 删除(若不再被任何组件引用)。
  - 所有 `src/common/i18n/locales/<lang>/translation.json`:删除被删功能的所有 i18n 键、替换产品名文案。
  - `README.md` / `README-CN.md` 可更新产品名与功能列表,但不得要求修改 GitHub 远程 URL、徽章链接或 Releases 链接。
- **依赖影响**:`package.json` 移除 `@sentry/react`、`react-ga4`、`@aptabase/tauri`;`src-tauri/Cargo.toml` 移除 `tauri-plugin-aptabase`;评估 `react-hotkeys-hook`、`hotkeys-js`、`@tauri-apps/plugin-global-shortcut` 在删除快捷键 UI/触发链路后是否还有其它使用点 —— 若无则一并删除。
- **存储/迁移影响**:新 Bundle ID `io.zeroclover.app.simpleai-translator` 与旧 Bundle ID 数据目录互不可见;首次启动写入空配置;旧 Bundle ID(包括曾用 `xyz.yetone.apps.openai-translator` / `xyz.yetone.apps.nextai-translator`)不迁移、不读取、不清理。浏览器插件 storage/扩展 ID/商店身份不在本次范围内。
- **浏览器插件发布影响**:仅修改插件代码和功能行为;不改变插件所有者、Chrome Web Store 条目、Firefox AMO owner、Firefox `gecko.id` 或签名身份。
- **遥测/隐私影响**:本变更后,产品对外网络请求收敛为:用户主动配置的 LLM Provider endpoint、用户主动选择的 TTS endpoint(Edge TTS / OpenAI TTS)、既有 Tauri updater endpoint、外部翻译时按用户输入文本检测语言所需的可选远端语言检测 endpoint。其余无任何被动遥测请求。
- **测试影响**:删除快捷键、Buy me a coffee、`autoTranslate` / `alwaysShowIcons` / `hideTheIconInTheDock` / `autoHideWindowWhenOutOfFocus` / `selectInputElementsText` / `disableCollectingStatistics` / 统计相关的所有测试用例;新增"零遥测"回归测试(对扩展构建产物 grep 不应出现 sentry / ga / aptabase 相关字符串;对桌面构建产物 `cargo tree` / 二进制 strings 不应出现 aptabase)。
- **文档影响**:`README.md` / `README-CN.md` 可改产品名、改截图说明、删除关于快捷键 / 自动翻译 / 划词图标 / Dock 隐藏 / 自动隐藏窗口 / 赞助 / 统计开关的章节;不改 GitHub 远程仓库链接。
