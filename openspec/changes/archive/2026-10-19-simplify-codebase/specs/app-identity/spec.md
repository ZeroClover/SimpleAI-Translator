## MODIFIED Requirements

### Requirement: HTML <title> 与产品名文案

以下静态 HTML 入口的 `<title>` 标签 SHALL 使用 SimpleAI Translator 命名:
- `src/tauri/index.html`:`<title>SimpleAI Translator</title>`
- `src/entrypoints/options/index.html`:`<title>SimpleAI Translator Options</title>`
- `src/entrypoints/popup/index.html`:`<title>SimpleAI Translator</title>`

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


### Requirement: DOM / IPC 命名空间前缀

应用使用的命名空间前缀 SHALL 为 `__zeroclover-simpleai-translator`,旧前缀 `__yetone-nextai-translator` SHALL NOT 出现在任何运行时代码中。

具体涉及:
- `src/common/constants.ts` 的 `PREFIX` 常量
- `src/browser-extension/content_script/consts.ts` 中的 DOM 元素 id(`containerID`、`popupCardID`、`popupCardInnerContainerId`)

内容脚本卡片的 shadow root 宿主是一个自定义元素。自定义元素名必须以小写字母开头,不能使用带双下划线的前缀,所以宿主元素名 SHALL 为 `zeroclover-simpleai-translator`;宿主内部元素的 DOM id 仍 SHALL 使用上述前缀。

桌面端在非 Windows 平台的 IPC Unix socket 默认路径(`src-tauri/src/main.rs` 的 `DEFAULT_IPC_SOCKET_PATH`)SHALL 为 `/tmp/simpleai-translator.sock`,并 SHALL 允许通过环境变量 `SIMPLEAI_TRANSLATOR_IPC_SOCKET` 覆盖。

#### Scenario: 命名空间字符串切换

- **WHEN** 在 `src/` 与 `src-tauri/src/` 下搜索 `yetone-nextai-translator`、`yetone-openai-translator`、`yetone-`
- **THEN** SHALL NOT 命中任何运行时代码

#### Scenario: 浏览器插件 DOM ID

- **WHEN** 检查 `src/browser-extension/content_script/consts.ts`
- **THEN** 其中所有 DOM id 字面量 SHALL 以 `__zeroclover-simpleai-translator` 开头

#### Scenario: 内容脚本宿主元素名

- **WHEN** 在浏览器扩展中打开翻译卡片
- **THEN** 卡片的 shadow root 宿主元素名 SHALL 为 `zeroclover-simpleai-translator`
- **AND** 宿主内部的卡片元素 SHALL 使用 `consts.ts` 中以 `__zeroclover-simpleai-translator` 开头的 DOM id

#### Scenario: IPC socket 路径

- **WHEN** 检查 `src-tauri/src/main.rs` 中 IPC socket 默认路径
- **THEN** 路径 SHALL 等于 `/tmp/simpleai-translator.sock`

## ADDED Requirements

### Requirement: 浏览器插件 manifest 身份字段

浏览器插件 manifest（由 `wxt.config.ts` 配置并在构建时生成）的可见产品字段 SHALL 使用以下身份:
- `name`:`SimpleAI Translator`
- `description`:以"使用兼容 OpenAI / Anthropic 协议的 LLM 翻译"为主旨(当前为 `Translate text with OpenAI-compatible and Anthropic-compatible LLM providers.`),MUST NOT 提及 ChatGPT / NextAI 等过时词

浏览器插件所有者与发布身份(Firefox `browser_specific_settings.gecko.id`、Chrome 扩展 ID、Chrome Web Store 条目、Firefox AMO owner、签名身份)不属于本需求。

#### Scenario: 生成的 manifest 可见字段

- **WHEN** 检查 `wxt.config.ts`，以及 Chromium 与 Firefox 构建生成的 `manifest.json`
- **THEN** `name` SHALL 等于 `"SimpleAI Translator"`
- **AND** `description` SHALL NOT 包含子串 `ChatGPT` / `NextAI`


## REMOVED Requirements

### Requirement: 浏览器插件可见身份字段
**Reason**: 浏览器扩展构建迁移到 WXT 后，`src/browser-extension/manifest.ts` 被 `wxt.config.ts` 取代，原需求中按文件路径命名的场景不再适用。
**Migration**: 由"浏览器插件 manifest 身份字段"取代，身份字段的要求不变，检查对象改为 `wxt.config.ts` 与构建生成的 manifest。
