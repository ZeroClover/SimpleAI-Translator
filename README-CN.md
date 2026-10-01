# SimpleAI Translator

<p align="center">
    <br> <a href="README.md">English</a> | 中文
</p>

SimpleAI Translator 是同时支持浏览器扩展和桌面端的翻译工具，专注于翻译、语言检测、翻译历史与文本朗读。

## 功能

1. 流式文本翻译。
2. 本地与远端语言检测。
3. 源语言、目标语言选择，以及默认目标语言设置。
4. 一键复制翻译结果。
5. 翻译历史，记录使用的 Provider 与模型。
6. 朗读源文本与翻译结果。
7. 支持 Edge TTS、系统语音合成与 OpenAI 兼容 TTS。
8. 支持浏览器扩展与 Windows、macOS、Linux 桌面端。

## LLM Provider

Provider 按协议配置，不按厂商模板配置。当前支持三种协议：

-   `openai-chat`：兼容 OpenAI Chat Completions API。
-   `openai-responses`：兼容 OpenAI Responses API。
-   `anthropic`：兼容 Anthropic Messages API。

你可以为同一种协议添加多份 Provider 并分别命名，再从所有已配置 Provider 的模型中选择默认模型。翻译窗口中的模型选择器也可以切换模型，所选模型会保存为新的默认模型。

Endpoint 留空时，应用使用对应协议的官方 Endpoint：`openai-chat` 与 `openai-responses` 为 `https://api.openai.com/v1`，`anthropic` 为 `https://api.anthropic.com`。要接入兼容协议的第三方服务，请填写其 Base URL；也可以填写 `.../chat/completions` 这类完整请求地址，`/v1beta/openai` 这类带版本号的路径会按原样保留。Provider 表单的 `高级` 区域可以用 JSON 填写额外请求头。

配置示例：

| 服务          | 协议                                 | Endpoint                                                   | 示例模型                          |
| ------------- | ------------------------------------ | ---------------------------------------------------------- | --------------------------------- |
| OpenAI        | `openai-responses` 或 `openai-chat`  | 留空                                                       | `gpt-5.6-sol`、`gpt-6-luna`       |
| Anthropic     | `anthropic`                          | 留空                                                       | `claude-sonnet-5-5`、`claude-opus-5-5` |
| Google Gemini | `openai-chat`                        | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.8-flash`                |

Gemini 的 OpenAI 兼容 API 没有 `/responses` 端点，因此请使用 `openai-chat`。

每个 Provider 旁的 `刷新` 按钮会从 Provider API 拉取可用模型。对话/翻译模型列表会过滤嵌入、实时语音、音频、转录、审核、TTS、图像、视频与搜索专用模型。模型字段仍支持手动输入，因此私有模型别名和不提供 `/models` 端点的服务仍可使用。

默认模型下方的设置按 Provider 与模型分别保存：

-   `启用思考` 与 `思考强度`（`低`、`中`、`高`，默认 `中`）。关闭思考时，始终推理的模型会以最低强度运行。OpenAI 推理模型建议使用 `openai-responses` 协议。
-   `使用结构化输出` 通过 Provider 的结构化输出 API 请求 JSON 结果。`严格 JSON Schema` 默认开启；在 OpenAI 协议下关闭后会回退到 JSON Object 模式，适用于不支持严格 Schema 的旧模型或第三方模型。

## 文本朗读

TTS 设置支持三种 backend：

-   `edge`：Microsoft Edge TTS。
-   `system`：浏览器或操作系统语音合成。
-   `openai`：OpenAI 兼容 `/audio/speech`。

OpenAI TTS 会复用已有的 `openai-chat` 或 `openai-responses` Provider，不会单独保存 TTS Endpoint 或 API Key。TTS 模型选择器会过滤出 `tts-1`、`tts-1-hd`、`gpt-4o-mini-tts` 与 `gpt-4o-mini-tts-YYYY-MM-DD`，同时保留手动输入模型名的能力。

## 1.0 破坏性变更

1.0 版本将桌面端 Bundle ID 改为 `io.zeroclover.app.simpleai-translator`，并按全新应用处理。旧 Provider 设置和旧历史数据不会迁移；全新启动时默认没有 Provider，需要先在设置中添加 LLM Provider 后才能翻译。

1.0 版本移除了 OCR、写作助手、生词本、自定义 Action、远程推广提示、赞助入口、遥测、全局快捷键、自动翻译，以及选中文字后弹出浮标的触发路径。

如需继续使用旧功能，可切换到 `v-pre-slim` 源码 tag：

https://github.com/nextai-translator/nextai-translator/tree/v-pre-slim

## 安装

在 [Latest Release](https://github.com/ZeroClover/SimpleAI-Translator/releases/latest) 页面下载安装包。

### Windows

1. 下载 `.exe` 安装包（x64）。
2. 双击安装包进行安装。
3. 如果 Windows SmartScreen 提示不安全，点击 `更多信息` -> `仍要运行`。

### macOS

1. 下载对应芯片的 `.dmg`：Apple Silicon 选 `aarch64`，Intel 选 `x64`。
2. 打开 `.dmg`，将 `SimpleAI Translator` 拖入 `Applications`。

正式版本已使用 Developer ID 证书签名，并通过 Apple 公证。

### Linux

下载 `.deb` 安装包或 `.AppImage`（x86_64）。`SHA256SUMS-linux.txt` 列出了它们的 SHA-256 校验值。

### 浏览器扩展

每个版本都附带浏览器扩展包与用户脚本：

-   `SimpleAI-Translator-chromium-extension-<version>.zip`：解压后打开 `chrome://extensions`，开启 `开发者模式`，点击 `加载已解压的扩展程序` 并选择解压后的目录。
-   `SimpleAI-Translator-firefox-extension-<version>.xpi`：该安装包未经 Mozilla 签名。可在 `about:debugging` -> `此 Firefox` -> `临时载入附加组件` 中加载，或在 Firefox Developer Edition / Nightly 中将 `xpinstall.signatures.required` 设为 `false` 后永久安装。
-   `SimpleAI-Translator-<version>.user.js`：使用 Tampermonkey、Violentmonkey 等用户脚本管理器安装。

安装后打开设置，添加 LLM Provider，选择默认模型，然后刷新当前网页。

## 桌面端划词扩展

详情见 [桌面端划词扩展](./CLIP-EXTENSIONS-CN.md)。

## 开发

安装依赖：

```sh
pnpm install
```

常用命令：

-   `pnpm dev-chromium`：启动 Chromium 扩展开发构建。
-   `pnpm dev-firefox`：以监听模式构建 Firefox 扩展。
-   `pnpm dev-tauri`：启动 Tauri 桌面端。
-   `pnpm build-browser-extension`：构建 Chromium 与 Firefox 扩展。
-   `pnpm build-userscript`：构建用户脚本。
-   `pnpm build-tauri`：构建桌面端。
-   `pnpm lint`：运行 ESLint。
-   `pnpm test`：单次运行单元测试。
-   `pnpm test:e2e`：运行 Playwright 测试。

## License

[LICENSE](./LICENSE)
