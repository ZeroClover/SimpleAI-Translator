# NextAI Translator

<p align="center">
    <br> <a href="README.md">English</a> | 中文
</p>

NextAI Translator 是同时支持浏览器扩展和桌面端的翻译工具。1.0 版本重新聚焦于翻译、语言检测、翻译历史与文本朗读。

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

NextAI Translator 1.0 按协议配置 Provider，不再按厂商模板配置。当前支持三种协议：

-   `openai-chat`：兼容 OpenAI Chat Completions API。
-   `openai-responses`：兼容 OpenAI Responses API。
-   `anthropic`：兼容 Anthropic Messages API。

你可以为同一种协议添加多份 Provider，分别命名、设置默认 Provider，并在翻译窗口中临时切换。Endpoint 留空时，应用会使用对应协议的 OpenAI 或 Anthropic 官方 Endpoint。要接入兼容协议的第三方服务，请手动填写 Endpoint 与模型名。

Provider 表单支持从 API 刷新模型列表。对话/翻译模型列表会过滤嵌入、实时语音、音频、转录、审核、TTS、图像、视频与搜索专用模型。模型字段仍支持手动输入，因此私有模型别名和不提供 `/models` 端点的服务仍可使用。

## 文本朗读

TTS 设置支持三种 backend：

-   `edge`：Microsoft Edge TTS。
-   `system`：浏览器或操作系统语音合成。
-   `openai`：OpenAI 兼容 `/audio/speech`。

OpenAI TTS 会复用已有的 `openai-chat` 或 `openai-responses` Provider，不会单独保存 TTS Endpoint 或 API Key。TTS 模型选择器会过滤出 `tts-1`、`tts-1-hd`、`gpt-4o-mini-tts` 与 `gpt-4o-mini-tts-YYYY-MM-DD`，同时保留手动输入模型名的能力。

## 1.0 破坏性变更

1.0 版本移除了 OCR、写作助手、生词本、自定义 Action、远程推广提示，以及旧的润色、总结、分析、代码解释模式。旧 Provider 设置和旧历史数据不会迁移。全新启动时默认没有 Provider，需要先在设置中添加 LLM Provider 后才能翻译。

如需继续使用旧功能，可切换到 `v-pre-slim` 源码 tag：

https://github.com/nextai-translator/nextai-translator/tree/v-pre-slim

## 安装

### Windows

1. 在 [Latest Release](https://github.com/nextai-translator/nextai-translator/releases/latest) 页面下载 `.exe` 安装包。
2. 双击安装包进行安装。
3. 如果系统提示不安全，点击 `更多信息` -> `仍要运行`。

### macOS

1. 在 [Latest Release](https://github.com/nextai-translator/nextai-translator/releases/latest) 页面下载对应芯片的 `.dmg` 安装包。
2. 打开 `.dmg`，将 `NextAI Translator` 拖入 `Applications`。

如果 macOS 提示开发者无法验证，请打开 `设置` -> `隐私与安全性`，点击 `仍要打开`，再确认 `打开`。

如果 Apple Silicon 版本提示文件损坏，请运行：

```sh
sudo xattr -d com.apple.quarantine /Applications/NextAI\ Translator.app
```

### 浏览器扩展

从浏览器扩展商店安装：

<p align="center">
  <a target="_blank" href="https://chrome.google.com/webstore/detail/nextai-translator/ogjibjphoadhljaoicdnjnmgokohngcc">
    <img src="https://img.shields.io/chrome-web-store/v/ogjibjphoadhljaoicdnjnmgokohngcc?label=Chrome%20Web%20Store&style=for-the-badge&color=blue&logo=google-chrome&logoColor=white" />
  </a>
  <a target="_blank" href="https://addons.mozilla.org/en-US/firefox/addon/nextai-translator/">
    <img src="https://img.shields.io/amo/v/nextai-translator?label=Firefox%20Add-on&style=for-the-badge&color=orange&logo=firefox&logoColor=white" />
  </a>
</p>

安装后打开设置，添加 LLM Provider，设为默认 Provider，然后刷新当前网页。

## 桌面端划词扩展

详情见 [桌面端划词扩展](./CLIP-EXTENSIONS-CN.md)。

## 开发

安装依赖：

```sh
pnpm install
```

常用命令：

-   `pnpm dev-chromium`：启动 Chromium 扩展开发构建。
-   `pnpm dev-tauri`：启动 Tauri 桌面端。
-   `pnpm build-browser-extension`：构建 Chromium 与 Firefox 扩展。
-   `pnpm build-tauri`：构建桌面端。
-   `pnpm lint`：运行 ESLint。
-   `pnpm exec vitest run`：单次运行单元测试。
-   `pnpm test:e2e`：运行 Playwright 测试。

## License

[LICENSE](./LICENSE)
