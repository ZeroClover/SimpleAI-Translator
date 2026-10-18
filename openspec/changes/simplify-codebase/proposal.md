# Proposal

## Why

前几轮瘦身（`slim-to-translation-core`、去遥测、去全局快捷键等）删掉了功能入口，但留下了大量没有入口的实现：没有调用方的 Tauri 命令和 Rust crate、OCR 时代的 Windows feature、Tauri v1 IPC 兼容层、只为已删功能存在的依赖、每次写设置都执行的旧字段清理，以及桌面端并存的两套 HTTP 传输（自建流式通道与 `@tauri-apps/plugin-http`）。userscript 目标因为打开翻译卡片的唯一入口（右键菜单消息）在 userscript 中是空实现，实际已经无法使用，却仍随每次发布打包。这些代码增加了维护面、构建时间和包体积（token 计数单独占 3.3 MB 的 chunk），也让共享模块需要处理它们本不该关心的平台差异。同时，依赖普遍落后于最新稳定版多个大版本，扩展构建插件已停止维护。现在核心功能已稳定，适合一次性清理并升级。

## What Changes

**删除不可用或无人构建的目标**
- **BREAKING** 移除 userscript 构建目标：`vite.config.userscript.ts`、`polyfills/userscript.ts` 及其测试、所有 `isUserscript()` 分支、`vite-plugin-monkey` / `@types/tampermonkey` / `rollup-plugin-visualizer`、Makefile 目标、release workflow 步骤与 README 说明。
- 移除无人构建且仍带旧品牌标识的 `src-safari/`。
- 移除仅用于展示、对非 OpenAI 模型不准确的 token 计数（`token.ts`、页脚显示、`js-tiktoken`）。

**删除死代码与无用依赖**
- 前端：`legacy-tauri-ipc.ts`（v1 IPC 桥）、`exportToCsv` / `isDarkMode` 以及只为它存在的 `plugin-fs`、`DurationPicker.tsx`、无人监听的 `show-settings` 链路、无调用方的导出、所有 locale 都未使用的 i18n key（目前 28 个，删除 `DurationPicker` 后再多 4 个）、`src/index.d.ts` 中无用的模块声明。
- 依赖：删除从未导入的运行时依赖（`date-fns`、`dayjs`、`js-sha3`、`react-use`、`url-join-ts`、`use-resize-observer`、`@tauri-apps/plugin-notification`、`@tauri-apps/plugin-fs`、`i18next-http-backend`）；用已有依赖或平台 API 替换 `underscore`、`qs`；删除 esbuild 时代遗留和未使用的 devDependencies（含 `vite-plugin-svgr`）。
- 桌面端：删除没有任何调用方的 Tauri 命令（`show_translator_window_command`、`show_translator_window_with_selected_text_command`、`hide_translator_window`、`detect_lang`、`clear_config_cache` 的命令注册）及它们独占的代码与 crate（`get-selected-text`、`whatlang`）；删除 AppleScript 资源与死的键盘模拟函数、`sysinfo` / `CPU_VENDOR`、未使用的 crate（`clipboard`、`arboard`、`cpuid`、`tauri-utils`、`objc`、`once_cell`、`tauri-plugin-os`、`tauri-plugin-fs`）、OCR 遗留的 `windows` crate feature，以及对应的 capability 权限和 `Config` 死字段。

**合并重复实现**
- 桌面端只保留一个原生 `fetch`：Rust 命令通过 `tauri::ipc::Channel` 推送正文，在 JS 侧表现为标准的 `Response` / `ReadableStream`，停止时立即关闭连接。它取代自建的事件通道和 `@tauri-apps/plugin-http`。plugin-http 直到 2.8.3 都无法在服务端静默时取消正在读取的正文（tauri-apps/plugins-workspace#3713），推理模型思考期间点击停止，服务端仍会继续生成并计费。`fetchSSE` 删除约 100 行 Tauri 专用逻辑，桌面端的代理构造也只剩一份（与 Edge TTS 共用）。
- **BREAKING** 设置读写只处理当前 schema：删除每次写入都执行的旧字段 key 清理、`defaultTargetLanguage` → `nativeLanguage` 迁移和 `enableMica` 字段；设置面板只持久化用户改动的字段；React 层只保留一个设置缓存（主题从中派生），一个写入入口同时持久化和更新缓存。
- 引擎与 TTS：协议层共用一份请求头、错误消息、默认 endpoint 与配置类型；TTS 模型判断复用 `model-filter`；"哪些 Provider 能做 TTS"只定义一次；Edge TTS 在桌面与浏览器共用一个播放器；`translate.ts` 只计算一次翻译模式。
- 平台适配：`IBrowser` 收窄为实际使用的 `storage`；历史服务去掉逐方法转发层；全应用只用一套 headless toast，每个根界面挂一个渲染器；设置写入接口去掉无人使用的删除键能力；`Form` 模块缩减为设置页真正使用的部分；Rust 侧合并三份窗口构建函数和三份更新检查逻辑。
- 组件与构建配置：删除 Translator / Settings 中未使用的样式、ref 和重复片段；Chromium / Firefox 的 vite 配置与 `manifest.ts` 由一个 `wxt.config.ts` 取代；无更新器的 Tauri 配置改为只覆盖差异字段。

**依赖升级**
- 把 npm 与 Cargo 的全部直接依赖升级到最新稳定版。如果被 peer 约束挡住，就用约束允许的最高版本并记录原因：目前 TypeScript 只能到 6.0（typescript-eslint 的上限），eslint 只能到 9.x（eslint-plugin-react 的上限）。
- 浏览器扩展构建从已停止维护、只支持 vite ≤5 的 `@samrum/vite-plugin-web-extension` 迁移到 WXT，从而升级到 vite 8 / vitest 5。WXT 的 `createShadowRootUi` 取代手写的内容脚本容器与 CSS 注入。WXT 把内容脚本构建为单文件，所以本次不做内容脚本的按需加载（wxt-dev/wxt#357）。
- Node 运行时基线升级到最新 Active LTS（不低于 22.12，新版 WXT / vite / vitest 的要求），同步更新五个 CI workflow 与本地开发说明。
- 删除 eslint 中无效或只为旧版本存在的插件（`eslint-plugin-baseui`、`eslint-plugin-import` 与其 resolver），配置迁移到 flat config。

**运行时开销**
- 未打开卡片时，内容脚本的 `mousedown` / `touchstart` 不再读取设置，也不创建容器。
- 翻译卡片的滚动边缘检测只观察自身节点，不再观察宿主页面的 `document.body`。
- 异步 Tauri 命令中的阻塞 `thread::sleep` 改为异步等待。

## Capabilities

### New Capabilities
- `build-targets`: 不再提供 userscript 与 Safari 构建目标的约束；不限制其它既有产物。

### Modified Capabilities
- `translation-core`: "翻译失败处理"由"翻译失败与取消处理"取代：桌面流式取消语义不再绑定原生事件监听器实现，三个协议共用一套错误消息取值顺序。"结构化响应传输完整性"由"结构化响应传输一致性"取代，去掉 userscript 传输。
- `llm-provider-config`: "新 App schema 初始化与旧字段清理"不再迁移 `defaultTargetLanguage`、不再在写入时清理旧 key；"浏览器扩展自定义 Endpoint 权限"去掉 userscript。
- `settings-surface`: "ISettings 更新"去掉 `enableMica`；"部分设置写入"让设置面板也只持久化改动字段；"Markdown 阅读偏好持久化"去掉用户脚本存储路径；"桌面设置文件完整性"去掉删除键能力。
- `text-to-speech`: "Edge TTS 错误回退"与"TTS 静默失败上限"去掉用户脚本平台。
- `app-identity`: HTML `<title>` 的入口路径改为 `src/entrypoints/`；"DOM / IPC 命名空间前缀"增加 shadow root 宿主元素名 `zeroclover-simpleai-translator` 的例外；"浏览器插件可见身份字段"由"浏览器插件 manifest 身份字段"取代，检查对象改为 `wxt.config.ts` 与生成的 manifest。
- `no-telemetry`: manifest 权限检查改为针对 `wxt.config.ts` 生成的 manifest；CI grep 守卫的路径清单用 `wxt.config.ts` 替换 `manifest.ts`，并且路径失效时脚本失败。

## Impact

- **代码**：`src/common/utils.ts`、`universal-fetch.ts`、`polyfills/`、`hooks/`、`engines/protocols/*`、`tts/*`、`services/history.ts`、`components/{Translator,Settings,Form,Toaster,LogoWithText}`、`src/browser-extension/*`（实现模块保留，薄壳入口放在 `src/entrypoints/`）、`src/tauri/*`；`src-tauri/src/{main,windows,utils,config,insertion,edge_tts}.rs`，改写 `fetch.rs`，删除 `lang.rs`。
- **依赖**：约 25 个 npm 包、12 个 Rust crate（含 `tauri-plugin-http`）及多项 Windows feature 被移除；新增直接依赖 `dequal`（已经作为传递依赖安装）和 `wxt`。其余直接依赖全部升级到最新稳定版（含 React 19、vite 8、tauri 2.12、reqwest 0.13），`rust-version` 随之提高。
- **构建**：扩展的开发、构建和打包命令改为 WXT；Makefile、release workflow 与 e2e fixtures 同步更新，产物文件名保持不变。
- **存储**：旧版本留下的旧字段 key 不再被读取、迁移或删除，会原样留在存储中且不产生影响。只存在 `defaultTargetLanguage` 而没有 `nativeLanguage` 的极旧安装，母语会回到默认值。Windows 用户只设置过 `enableMica` 而未设置 `enableBackgroundBlur` 的，背景模糊会回到默认关闭。
- **发布**：release 产物不再包含 `.user.js`；README / README-CN / AGENTS.md 同步更新。
- **测试**：删除 userscript 与原生 `fetch_stream` 的专用测试；e2e 的桌面流式模拟改为在 `universal-fetch` 边界返回可控的流式 `Response`。
- **行为**：除上述 BREAKING 项和 token 计数外，用户可见的变化只有两处：桌面更新窗口在没有更新时不再一直停在 checking；历史窗口的复制提示可以显示。
