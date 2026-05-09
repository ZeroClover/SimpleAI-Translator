# app-identity Specification

## Purpose
TBD - created by archiving change simpleai-translator-rebrand. Update Purpose after archive.
## Requirements
### Requirement: 桌面端 Bundle 标识

桌面端(Tauri)应用 SHALL 使用以下身份字段:
- Bundle Identifier(macOS `CFBundleIdentifier` / Windows AppUserModelID / Linux .desktop ID 等价位):`io.zeroclover.app.simpleai-translator`
- Product Name(macOS `CFBundleName` / `CFBundleDisplayName`):`SimpleAI Translator`
- 可执行文件名 与 `.app` 包名:`SimpleAI Translator`(允许空格,以匹配 `productName` 显示)

桌面端 MUST NOT 在运行时代码、配置文件、构建脚本中的**应用身份字段**继续使用 `xyz.yetone.apps.openai-translator`、`xyz.yetone.apps.nextai-translator`、`NextAI Translator`、`NextAI`、`yetone`、`nextai-translator`、`openai-translator` 等历史字符串。

以下内容明确不属于本需求:
- GitHub 远程仓库 URL、`package.json.repository.url`、README 徽章/链接、Tauri updater endpoint URL
- 浏览器插件所有者、Chrome Web Store 条目、Firefox AMO owner、Firefox `gecko.id` / `applications.gecko.id`、Chrome 扩展 ID、签名身份

`package.json` 中面向包名或构建身份的字段 SHALL 同步切换为 SimpleAI Translator,包括 package `name` / `description` 以及仍保留的 legacy Electron `build.appId` / `build.productName` / `build.extraMetadata.name`。若 legacy Electron build 配置已确认无任何使用者,实施者 MAY 直接删除该 `build` 配置块,但 MUST NOT 保留旧身份字符串。`repository.url` 不在本次变更范围内。

#### Scenario: tauri.conf.json 标识字段正确

- **WHEN** 检查 `src-tauri/tauri.conf.json`
- **THEN** `productName` SHALL 等于字符串 `"SimpleAI Translator"`
- **AND** `identifier` SHALL 等于字符串 `"io.zeroclover.app.simpleai-translator"`
- **AND** `updater.endpoints` 不因本变更被要求修改

#### Scenario: package.json 标识字段正确

- **WHEN** 检查 `package.json`
- **THEN** package `name` / `description` SHALL NOT 包含 `nextai-translator` 或 `openai-translator`
- **AND** 若存在 legacy `build` 配置,其中 `appId` SHALL NOT 包含 `xyz.yetone`,`productName` SHALL NOT 等于 `NextAI Translator`,`extraMetadata.name` SHALL NOT 等于 `nextai-translator`
- **AND** `repository.url` MAY 继续指向现有 GitHub 远程仓库

#### Scenario: 构建产物 macOS Info.plist 一致

- **WHEN** 在 macOS 上对发布版执行 `defaults read /Applications/SimpleAI\ Translator.app/Contents/Info.plist`
- **THEN** `CFBundleIdentifier` SHALL 等于 `io.zeroclover.app.simpleai-translator`
- **AND** `CFBundleName` SHALL 等于 `SimpleAI Translator`
- **AND** `CFBundleDisplayName` SHALL 等于 `SimpleAI Translator`

#### Scenario: 已发布二进制不含旧标识字符串

- **WHEN** 对发布构建产物运行 `strings <binary> | grep -Ei 'yetone|nextai-translator|NextAI Translator|openai-translator'`
- **THEN** 输出 SHALL 为空(license 文件、第三方 SDK 中不可控字符串例外)

### Requirement: 桌面端窗口标题

Tauri 主窗口、历史记录窗口、设置窗口、更新器窗口的标题 SHALL 全部使用 `SimpleAI Translator` 前缀:
- 主翻译窗口:`SimpleAI Translator`
- 历史记录窗口:`SimpleAI Translator History`
- 设置窗口:`SimpleAI Translator Settings`
- 更新器窗口:`SimpleAI Translator Updater`

#### Scenario: windows.rs 字符串

- **WHEN** 检查 `src-tauri/src/windows.rs`
- **THEN** 文件中所有窗口标题字符串字面量 SHALL 全部以 `SimpleAI Translator` 起始
- **AND** 文件中 SHALL NOT 出现 `NextAI Translator` 字符串

### Requirement: HTML <title> 与产品名文案

所有静态 HTML 入口的 `<title>` 标签 SHALL 使用 SimpleAI Translator 命名:
- `src/tauri/index.html`:`<title>SimpleAI Translator</title>`
- `src/browser-extension/options/index.html`:`<title>SimpleAI Translator Options</title>`
- `src/browser-extension/popup/index.html`:`<title>SimpleAI Translator</title>`

所有 i18n locale 文件中提及产品名的字符串值 SHALL 使用 `SimpleAI Translator`,即便 i18n key 名仍可保持稳定(只换 value)。

运行时代码中的产品名展示(例如设置页 header、LogoWithText、浏览器右键菜单 title、TTS 示例文本、UpdaterWindow header) SHALL 使用 `SimpleAI Translator`。IndexedDB / local database 名称、JSS class prefix、highlight-in-textarea 内部 id/class 等项目自有命名空间 SHALL 不再使用 `openai-translator`、`nextai-translator` 或 `yetone`。

#### Scenario: HTML title 字符串

- **WHEN** 检查上述三个 HTML 文件的 `<title>` 内容
- **THEN** 内容 SHALL 严格匹配本需求列出的字符串

#### Scenario: 产品名仅出现在 i18n value

- **WHEN** 在 `src/common/i18n/locales/<lang>/translation.json` 中搜索 `NextAI Translator`
- **THEN** 全部 locale 文件中 SHALL NOT 命中
- **WHEN** 在同一文件搜索 `SimpleAI Translator`
- **THEN** 各 locale 文件中关于"推荐下载桌面应用"等提及产品名的 value SHALL 使用 `SimpleAI Translator`

#### Scenario: 运行时代码不含旧展示名

- **WHEN** 在 `src/`、`src-tauri/src/`、`package.json` 中搜索 `NextAI Translator`、`nextai-translator`、`openai-translator`、`yetone`
- **THEN** SHALL NOT 命中运行时代码、配置或构建身份字段
- **AND** 命中 `package.json.repository.url`、Tauri updater endpoint URL、README 历史说明、`openspec/changes/**`、浏览器插件签名/所有者身份字段时不视为本需求失败

### Requirement: 浏览器插件可见身份字段

浏览器插件 manifest 的**可见产品字段** SHALL 使用以下身份:
- `name`:`SimpleAI Translator`
- `description`:不再继续描述为 "uses the ChatGPT API for translation",改为以"使用兼容 OpenAI / Anthropic 协议的 LLM 翻译器"为主旨的描述(具体措辞由实施者定,但 MUST NOT 提及 ChatGPT / NextAI 等过时词)

本需求 MUST NOT 修改浏览器插件所有者或发布身份:
- Firefox `browser_specific_settings.gecko.id` / `applications.gecko.id` 不在本变更中改动
- Chrome 扩展 ID、Chrome Web Store 条目、Firefox AMO owner、签名身份不在本变更中改动或决定

#### Scenario: manifest.ts 可见字段

- **WHEN** 检查 `src/browser-extension/manifest.ts`
- **THEN** `name` SHALL 等于 `"SimpleAI Translator"`
- **AND** `description` SHALL NOT 包含子串 `ChatGPT` / `NextAI`
- **AND** 本变更不要求 `gecko.id` / `applications.gecko.id` 变更

### Requirement: DOM / IPC 命名空间前缀

应用使用的命名空间前缀 SHALL 切换为 `__zeroclover-simpleai-translator-*`,旧前缀 `__yetone-nextai-translator-*` SHALL NOT 出现在任何运行时代码中。

具体涉及:
- `src/common/constants.ts` 的 `PREFIX` 常量
- `src/browser-extension/content_script/consts.ts` 中所有 DOM 元素 id(thumb / card / container / inner container)
- 任何使用 `PREFIX + 'something'` 模式拼接 localStorage / IndexedDB key 的位置

Tauri IPC socket 路径 SHALL 从 `/tmp/openai-translator.sock` 改为 `/tmp/simpleai-translator.sock`(在 `src-tauri/src/main.rs` 的 `DEFAULT_IPC_SOCKET_PATH` 等价位置)。

#### Scenario: 命名空间字符串切换

- **WHEN** 在 `src/` 与 `src-tauri/src/` 下搜索 `yetone-nextai-translator`、`yetone-openai-translator`、`yetone-`
- **THEN** SHALL NOT 命中任何运行时代码

#### Scenario: 浏览器插件 DOM ID

- **WHEN** 检查 `src/browser-extension/content_script/consts.ts`
- **THEN** 四个 DOM id 字面量 SHALL 全部以 `__zeroclover-simpleai-translator` 开头

#### Scenario: IPC socket 路径

- **WHEN** 检查 `src-tauri/src/main.rs` 中 IPC socket 默认路径
- **THEN** 路径 SHALL 等于 `/tmp/simpleai-translator.sock`

### Requirement: 不迁移旧 Bundle ID 数据

新 Bundle ID `io.zeroclover.app.simpleai-translator` 在首次启动时 SHALL 创建空配置目录,并 MUST NOT 读取或复制 `~/Library/Application Support/xyz.yetone.apps.openai-translator/` 或 `~/Library/Application Support/xyz.yetone.apps.nextai-translator/` 下的任何文件。

`src-tauri/src/config.rs` 中既有的"从 `xyz.yetone.apps.openai-translator` → `xyz.yetone.apps.nextai-translator` 的目录迁移代码"SHALL 被整段删除,不替换为新 ID 之间的迁移。

#### Scenario: 首次启动行为

- **WHEN** 用户从未安装过 SimpleAI Translator 但安装过任意一个旧 Bundle ID 版本
- **AND** 启动新版 SimpleAI Translator
- **THEN** 应用 SHALL 创建 `~/Library/Application Support/io.zeroclover.app.simpleai-translator/`(macOS)等空目录
- **AND** 应用 SHALL NOT 读取任何旧 Bundle ID 目录的内容
- **AND** Settings UI SHALL 表现为全新安装(`providers: []`、`defaultProviderId: null`)

#### Scenario: config.rs 不含旧迁移代码

- **WHEN** 检查 `src-tauri/src/config.rs`
- **THEN** 文件 SHALL NOT 包含 `xyz.yetone.apps.openai-translator` 或 `xyz.yetone.apps.nextai-translator` 字符串
- **AND** 文件 SHALL NOT 包含读取旧目录路径并复制到新目录的逻辑

