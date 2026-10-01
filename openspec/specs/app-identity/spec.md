# app-identity Specification

## Purpose
定义 SimpleAI Translator 在桌面端、浏览器扩展与运行时代码中的产品身份:Bundle 标识、窗口与页面标题、manifest 可见字段、DOM/IPC 命名空间,以及不继承旧 NextAI / OpenAI Translator 身份与数据的约束。
## Requirements
### Requirement: 桌面端 Bundle 标识

桌面端(Tauri)应用 SHALL 使用以下身份字段:
- Bundle Identifier(`tauri.conf.json` 的 `identifier`,对应 macOS `CFBundleIdentifier` 等平台等价位):`io.zeroclover.app.simpleai-translator`
- Product Name(`tauri.conf.json` 的 `productName`,对应 macOS `CFBundleName` / `CFBundleDisplayName` 与 `.app` 包名):`SimpleAI Translator`

`src-tauri/tauri.conf.json` 与 `src-tauri/tauri.production-no-updater.conf.json` SHALL 使用相同的 `productName` 与 `identifier`。

桌面端 MUST NOT 在运行时代码、配置文件、构建脚本中的应用身份字段使用 `xyz.yetone.apps.openai-translator`、`xyz.yetone.apps.nextai-translator`、`NextAI Translator`、`NextAI`、`yetone`、`nextai-translator`、`openai-translator` 等历史字符串。

以下内容不属于本需求:
- 指向 GitHub 仓库 `github.com/nextai-translator/nextai-translator` 的 URL(`package.json.repository.url`、设置页中的下载/安装说明链接)、README 徽章/链接
- Tauri updater endpoint URL(`plugins.updater.endpoints`)
- 浏览器插件所有者、Chrome Web Store 条目、Firefox AMO owner、Firefox `browser_specific_settings.gecko.id`、Chrome 扩展 ID、签名身份

`package.json` 的 package `name` SHALL 为 `simpleai-translator`,`description` SHALL 为 `SimpleAI Translator`;`package.json` SHALL NOT 包含 legacy Electron `build` 配置块。

#### Scenario: tauri.conf.json 标识字段正确

- **WHEN** 检查 `src-tauri/tauri.conf.json`
- **THEN** `productName` SHALL 等于字符串 `"SimpleAI Translator"`
- **AND** `identifier` SHALL 等于字符串 `"io.zeroclover.app.simpleai-translator"`

#### Scenario: package.json 标识字段正确

- **WHEN** 检查 `package.json`
- **THEN** `name` SHALL 等于 `simpleai-translator`,`description` SHALL 等于 `SimpleAI Translator`
- **AND** SHALL NOT 存在 `build` 配置块
- **AND** `repository.url` MAY 继续指向现有 GitHub 远程仓库

#### Scenario: 构建产物 macOS Info.plist 一致

- **WHEN** 在 macOS 上对发布版执行 `defaults read /Applications/SimpleAI\ Translator.app/Contents/Info.plist`
- **THEN** `CFBundleIdentifier` SHALL 等于 `io.zeroclover.app.simpleai-translator`
- **AND** `CFBundleName` SHALL 等于 `SimpleAI Translator`
- **AND** `CFBundleDisplayName` SHALL 等于 `SimpleAI Translator`

#### Scenario: 已发布二进制不含旧标识字符串

- **WHEN** 对发布构建产物运行 `strings <binary> | grep -Ei 'yetone|nextai-translator|NextAI Translator|openai-translator'`
- **THEN** 输出 SHALL 只包含上文列为例外的 GitHub 仓库 URL(license 文件、第三方 SDK 中不可控字符串另行例外)

### Requirement: 桌面端窗口标题

Tauri 中面向用户的窗口标题 SHALL 使用 `SimpleAI Translator` 前缀:
- 主翻译窗口:`SimpleAI Translator`
- 历史记录窗口:`SimpleAI Translator History`
- 设置窗口:`SimpleAI Translator Settings`
- 更新器窗口:`SimpleAI Translator Updater`

始终隐藏的内部 `dummy` 窗口(标题 `Dummy`)不属于本需求。

#### Scenario: windows.rs 字符串

- **WHEN** 检查 `src-tauri/src/windows.rs`
- **THEN** 主翻译、历史记录、设置、更新器四个窗口的标题字面量 SHALL 与上表一致
- **AND** 文件中 SHALL NOT 出现 `NextAI Translator` 字符串

### Requirement: HTML <title> 与产品名文案

以下静态 HTML 入口的 `<title>` 标签 SHALL 使用 SimpleAI Translator 命名:
- `src/tauri/index.html`:`<title>SimpleAI Translator</title>`
- `src/browser-extension/options/index.html`:`<title>SimpleAI Translator Options</title>`
- `src/browser-extension/popup/index.html`:`<title>SimpleAI Translator</title>`

所有 i18n locale 文件中提及产品名的字符串值 SHALL 使用 `SimpleAI Translator`。

运行时代码中的产品名展示(`LogoWithText`、浏览器扩展右键菜单 title、TTS 试听示例文本、UpdaterWindow header)SHALL 使用 `SimpleAI Translator`。项目自有命名空间 SHALL 使用 SimpleAI Translator 命名:IndexedDB 数据库名为 `simpleai-translator`,内容脚本 JSS class 前缀为 `__zeroclover-simpleai-translator-jss-`,Styletron class 前缀为 `__zeroclover-simpleai-translator-styletron-`;它们 SHALL NOT 使用 `openai-translator`、`nextai-translator` 或 `yetone`。

#### Scenario: HTML title 字符串

- **WHEN** 检查上述三个 HTML 文件的 `<title>` 内容
- **THEN** 内容 SHALL 严格匹配本需求列出的字符串

#### Scenario: 产品名仅出现在 i18n value

- **WHEN** 在 `src/common/i18n/locales/<lang>/translation.json` 中搜索 `NextAI Translator`
- **THEN** 全部 locale 文件中 SHALL NOT 命中
- **AND** 各 locale 文件中"推荐下载桌面应用"等提及产品名的 value SHALL 使用 `SimpleAI Translator`

#### Scenario: 运行时代码不含旧展示名

- **WHEN** 在 `src/`、`src-tauri/src/`、`package.json` 中搜索 `NextAI Translator`、`nextai-translator`、`openai-translator`、`yetone`
- **THEN** SHALL NOT 命中运行时代码、配置或构建身份字段
- **AND** 命中 `github.com/nextai-translator/nextai-translator` 仓库 URL、Tauri updater endpoint URL、浏览器插件签名/所有者身份字段时不视为本需求失败

### Requirement: 浏览器插件可见身份字段

浏览器插件 manifest 的可见产品字段 SHALL 使用以下身份:
- `name`:`SimpleAI Translator`
- `description`:以"使用兼容 OpenAI / Anthropic 协议的 LLM 翻译"为主旨(当前为 `Translate text with OpenAI-compatible and Anthropic-compatible LLM providers.`),MUST NOT 提及 ChatGPT / NextAI 等过时词

浏览器插件所有者与发布身份(Firefox `browser_specific_settings.gecko.id`、Chrome 扩展 ID、Chrome Web Store 条目、Firefox AMO owner、签名身份)不属于本需求。

#### Scenario: manifest.ts 可见字段

- **WHEN** 检查 `src/browser-extension/manifest.ts`
- **THEN** `name` SHALL 等于 `"SimpleAI Translator"`
- **AND** `description` SHALL NOT 包含子串 `ChatGPT` / `NextAI`

### Requirement: DOM / IPC 命名空间前缀

应用使用的命名空间前缀 SHALL 为 `__zeroclover-simpleai-translator`,旧前缀 `__yetone-nextai-translator` SHALL NOT 出现在任何运行时代码中。

具体涉及:
- `src/common/constants.ts` 的 `PREFIX` 常量
- `src/browser-extension/content_script/consts.ts` 中的 DOM 元素 id(`containerID`、`popupCardID`、`popupCardInnerContainerId`)

桌面端在非 Windows 平台的 IPC Unix socket 默认路径(`src-tauri/src/main.rs` 的 `DEFAULT_IPC_SOCKET_PATH`)SHALL 为 `/tmp/simpleai-translator.sock`,并 SHALL 允许通过环境变量 `SIMPLEAI_TRANSLATOR_IPC_SOCKET` 覆盖。

#### Scenario: 命名空间字符串切换

- **WHEN** 在 `src/` 与 `src-tauri/src/` 下搜索 `yetone-nextai-translator`、`yetone-openai-translator`、`yetone-`
- **THEN** SHALL NOT 命中任何运行时代码

#### Scenario: 浏览器插件 DOM ID

- **WHEN** 检查 `src/browser-extension/content_script/consts.ts`
- **THEN** 其中所有 DOM id 字面量 SHALL 以 `__zeroclover-simpleai-translator` 开头

#### Scenario: IPC socket 路径

- **WHEN** 检查 `src-tauri/src/main.rs` 中 IPC socket 默认路径
- **THEN** 路径 SHALL 等于 `/tmp/simpleai-translator.sock`

### Requirement: 不迁移旧 Bundle ID 数据

桌面端 SHALL 在新 Bundle ID 对应的应用配置目录中读写配置,目录不存在时 SHALL 创建;MUST NOT 读取或复制 `xyz.yetone.apps.openai-translator` 或 `xyz.yetone.apps.nextai-translator` 配置目录下的任何文件。`src-tauri/src/config.rs` SHALL NOT 包含任何旧 Bundle ID 之间或旧到新 Bundle ID 的目录迁移代码。

#### Scenario: 首次启动行为

- **WHEN** 用户从未安装过 SimpleAI Translator 但安装过任意一个旧 Bundle ID 版本
- **AND** 启动 SimpleAI Translator
- **THEN** 应用 SHALL 使用 `~/Library/Application Support/io.zeroclover.app.simpleai-translator/`(macOS)等新目录
- **AND** 应用 SHALL NOT 读取任何旧 Bundle ID 目录的内容
- **AND** Settings SHALL 表现为全新安装(`providers: []`、`defaultProviderId: null`)

#### Scenario: config.rs 不含旧迁移代码

- **WHEN** 检查 `src-tauri/src/config.rs`
- **THEN** 文件 SHALL NOT 包含 `xyz.yetone.apps.openai-translator` 或 `xyz.yetone.apps.nextai-translator` 字符串
- **AND** 文件 SHALL NOT 包含读取旧目录路径并复制到新目录的逻辑
