# Design

## Context

动机见 proposal.md。本设计的依据是对整个仓库做的四个维度（复用、简化、效率、层次）的审查。每条结论都用 grep 或阅读代码核对过调用方。下面是会影响实现方式的几个现状：

- 桌面端有两套 HTTP 传输。流式请求走自建通道：`fetch_stream` 命令配合 `fetch-stream-status-code` / `fetch-stream-chunk` / `abort-fetch-stream` 三个全局事件，JS 侧还要维护有序队列、监听器追踪和取消竞速，`fetchSSE` 中为此有约 100 行 Tauri 专用分支。`src-tauri/src/fetch.rs` 自带 UTF-8 解码器，也自己构造 reqwest 代理（与 `edge_tts.rs` 中的 `apply_proxy_config` 重复）。非流式请求（模型列表、fallback、OpenAI TTS、语言检测）以及 `ProxyTester` 则走 `@tauri-apps/plugin-http`。plugin-http 无法在服务端静默时取消正在读取的正文：直到 2.8.3，`fetch_read_body` 在 `res.chunk().await` 期间一直持有响应的 `Arc`，`fetch_cancel_body` 只是从资源表中移除这一项。上游 issue tauri-apps/plugins-workspace#3713（2026-10-15 提出，仍未关闭）实测发现，服务端不再发送数据时连接永远不会关闭。原生 `fetch.rs` 用 `Abortable` 包裹字节流，abort 会立即丢弃响应，这一点是正确的。
- 设置写入有两个入口：`utils.setSettings` 负责持久化，`useSettings().setSettings` 只改 SWR 缓存，每个写入点都要两个都调。`useThemeType` 另开一个 SWR key 缓存同一份数据，靠 `refreshThemeType()` 手动同步。设置面板提交的是整份表单快照，所以要在两条保存路径上重新读存储，单独保护 `renderMarkdown`。`utils.setSettings` 每次写入都会额外 `remove` 约 55 个旧 key。在桌面端这意味着第二次 `update_config` IPC 和第二次原子重写 `config.json`。它还在存储层里弹 toast 并懒加载 i18n。
- 内容脚本入口静态导入 Translator、i18n、Styletron、jss，`main()` 却只注册监听器。manifest 声明了 `<all_urls>` + `all_frames`，所以每个页面的每个 frame 都要解析约 1.45 MB。本次不处理这一点（见 Non-Goals）。
- userscript 的 `runtime.onMessage.addListener` 是空实现，而内容脚本只在收到 `open-translator` 消息时打开卡片，所以 userscript 目前无法打开翻译器。
- 已确认无任何调用方：Tauri 命令 `show_translator_window_command`、`show_translator_window_with_selected_text_command`、`hide_translator_window`、`detect_lang`、`clear_config_cache`（作为命令；`config.rs` 内部仍会调用该函数）；`exportToCsv`、`isDarkMode`、`DurationPicker`、`show-settings` 事件。`Cargo.toml` 中 `clipboard`、`arboard`、`cpuid`、`tauri-utils`、`objc` 在 `src-tauri/src` 中零引用。

## Goals / Non-Goals

**Goals:**
- 删除没有入口或调用方的代码、依赖、权限与资源。
- 每个概念只保留一个实现：传输、设置写入、主题缓存、协议辅助函数、Edge TTS 播放、窗口构建、更新检查。
- 消除页面加载时就产生、且有实际代价的开销（未打开卡片时的设置读取、宿主 DOM 观察、每次写设置的冗余存储操作）。内容脚本体积不在本次范围内（见 Non-Goals）。
- 全部依赖（npm 与 Cargo）升级到最新稳定版，规则见 D10。
- 每个任务组完成后产品都可构建、可运行、测试通过。

**Non-Goals:**
- 桌面端"翻译窗口内嵌设置"与"独立设置窗口"两条入口的合并（属于 UX 决策，已与用户确认不在本次范围内）。
- 不重写桌面端 Edge TTS 的原生合成。`text-to-speech` 规定它必须原生合成；本次只合并 JS 侧播放。用 IPC Channel 传输音频字节、并行合成分段等优化留作后续。
- 升级依赖只为保持依赖处于最新稳定版，不借此引入新功能或额外的 API 迁移；只做大版本升级必需的改动。
- 不为 `getSettings()` 引入跨上下文快照缓存，也不改 SWR 的焦点重新验证。目前跨窗口同步依赖焦点重新验证，改动需要另设订阅机制，收益与复杂度不匹配。
- 不做纯搬迁式拆分，例如把 Translator 的样式、页脚或翻译执行逻辑拆成新文件，或把 `utils.ts` 拆成多个模块。这类拆分不减少代码，只在能顺带删除代码时才做（见 D7）。
- 内容脚本不做按需加载。WXT 把内容脚本构建为单文件 IIFE，`await import()` 会被内联（WXT `builders/vite` 的 lib 模式；文档 `es-modules.md` 的 Content Scripts 一节；wxt-dev/wxt#357 仍未关闭）。官方示例中的变通方案需要额外自写一个 ESM 构建模块，并手动把 CSS 注入 shadow root，复杂度与收益不相称。现有构建的内容脚本加载器也会立即导入整个 chunk，所以这不是倒退。等 #357 落地后再考虑。
- 不新增只有两个调用方的抽象，例如 `useScrollEdges`、`EnumSelect`、共享测试工具文件。
- 不修 `main.rs` 定时更新循环忽略 `automaticCheckForUpdates` 的问题（D5 中更新窗口 checking 状态的修复是合并更新检查时顺带完成的），也不重做 Bing 语言检测的 token 缓存、历史搜索防抖或结构化预览解析节流。前者属于行为缺陷，后几项收益很小，都不在简化范围内。

## Decisions

### D1. 桌面端只保留一个原生 fetch，删除 plugin-http

参照 Vercel AI SDK 和 OpenAI / Anthropic 官方 SDK 的约定：传输层只提供一个与 `fetch` 兼容的函数，返回标准的 `Response`，其 `body` 是 `ReadableStream`；上层通过 `signal` 和 `reader.cancel()` 取消，关闭 socket 由传输层负责。这些 SDK 都假定传输层会真正关闭连接，plugin-http 目前做不到（#3713）。NextChat 的原生实现是个反例：它的 Rust 侧把 `bytes_stream()` 读到结束，没有任何取消路径，所以点击停止后上游请求仍会继续。本设计吸取这个教训：

- **Rust**：`fetch.rs` 改写为一个通用的 `fetch` 命令，参数为请求 id（由 JS 生成）、请求描述（method、url、headers、文本 body、可选的 `proxy` 覆盖）和一个 `tauri::ipc::Channel<InvokeResponseBody>`。
  - 取消信号用一个按 id 索引的 `oneshot::Sender` 表。命令在调用 `send()` **之前**注册取消信号；如果 `fetch_cancel(id)` 先于注册到达，就记一个"已取消"标记，注册时发现标记便直接返回取消错误。
  - 请求的两个阶段都可以取消：`send().await`（连接、TLS、代理握手、等待响应头）用 `tokio::select!` 与取消信号竞争；收到响应头后，命令返回 `{ status, statusText, headers }`，正文在派生的任务里用 `tokio::select!` 同时等待 `stream.next()` 和取消信号。
  - 正文以 `InvokeResponseBody::Raw` 原始字节经 Channel 发送，结束或出错时发送终止消息；请求结束时移除表项。
  - 取消后任务丢弃响应，连接立即关闭。这与 plugin-http 在 `fetch_send` 中的 `select!` 写法一致，区别在于正文阶段也能取消。Rust 侧不再做 UTF-8 解码，删除 `Utf8StreamDecoder`，由 JS 的 `createUTF8Decoder` 负责。代理默认从已存储配置读取，与现有行为一致；`config.rs` 提供 `ProxyConfig → reqwest::Proxy` 的单一实现，`fetch` 和 `edge_tts` 共用。
- **JS**：`polyfills/tauri.ts` 的 `tauriFetch(input, init)` 先生成请求 id，并在调用 `invoke` **之前**设置 Channel 的 `onmessage`，把在 `ReadableStream` 创建之前到达的块先缓存起来。
  - abort 监听从调用 `invoke` 之前就注册。如果在等待响应头期间 abort，就调用 `fetch_cancel` 并以 `AbortError` 拒绝 `tauriFetch` 返回的 Promise，不等 `invoke` 返回。
  - 收到响应头之后构造 `ReadableStream`：abort 时 `controller.error(AbortError)` 并调用 `fetch_cancel`；`cancel()` 中同样调用 `fetch_cancel`。
  - 这样，请求的任何阶段，`AbortController.abort()` 和 `reader.cancel()` 都能传到 Rust。`getUniversalFetch()` 在桌面端返回 `tauriFetch`，所有桌面请求（流式与非流式）都只走这一条路径。`ProxyTester` 改为用 `tauriFetch` 加 `proxy` 覆盖和 `AbortSignal.timeout(10000)`，`getFetchProxy` / `getFetchProxyConfig` 与 JS 侧代理拼装随之删除。
- **fetchSSE**：删除 `isTauri()` 分支，所有平台都走现有的 reader 循环。调用 `fetcher` 之前，如果信号已中止，直接抛 `DOMException('Aborted', 'AbortError')`。读取期间按 AI SDK 的做法（`packages/ai/src/generate-text/stream-text.ts`），在 abort 时立即 `reader.cancel()`，这样即使传输层迟迟不结束，挂起的 `read()` 也会马上返回。
  - `reader.cancel()` 会让挂起的 `read()` 以 `{ done: true }` 正常返回，而不是抛错。所以每次 `read()` 返回后，在处理 `done` 或数据之前，都要先检查 `options.signal?.aborted`，已中止就抛出 `AbortError`，不进入正常的 flush / `end()` 路径。这一点也与 AI SDK 的做法一致。
  - catch 中只要 `options.signal?.aborted`，就统一转换为 `AbortError`。已中止后同一块中剩余的 SSE 事件由 `EngineSession` 丢弃（`interfaces.ts` 中 `finished || fallback || signal.aborted` 的检查）。
- **删除**：`@tauri-apps/plugin-http`、`tauri-plugin-http`、`.plugin(tauri_plugin_http::init())`、capability 中的 `http:default` 及其 URL 范围；`fetch-stream-*` / `abort-fetch-stream` 事件和 `listen_any`；`utils.ts` 对 `uuid`、`@tauri-apps/api/event`、`@/tauri/bindings` 的依赖。
- **备选 1**：升级到最新 plugin-http，删除 `fetch.rs`。没有选，因为 #3713 仍未修复：推理模型在静默思考时，点击停止后服务端还会继续生成并计费，直到第一个输出块到来。用户已确认不接受这一点。等上游修复后，可以重新评估是否换回 plugin-http。
- **备选 2**：只有流式请求走原生通道，非流式继续用 plugin-http。没有选，因为桌面端会同时存在两套传输和两份代理实现。
- **连接复用**：与现有 `fetch.rs` 一样，每次请求新建 `reqwest::Client`，本次不做改进。

### D2. 设置只有一条写入路径

- `utils.setSettings(partial)` 仍是唯一的持久化函数：读取已存储设置，经 `sanitizeSettingsForStorage` 校验，执行一次 `storage.sync.set`。它返回实际写入的字段，不再 `remove` 旧 key，不再弹 toast，也不再导入 i18n 和 react-hot-toast。删除 `legacySettingKeys`、`migrationSettingKeys`、`storageSettingKeys`、`defaultTargetLanguage` 迁移、`enableMica`（`ISettings`、`settingKeys`、归一化，以及 Rust `Config` 中如有的对应字段）。
- `useSettings()` 返回 `{ settings, updateSettings(partial) }`。`updateSettings` 先调用 `utils.setSettings`，再用写入结果乐观更新 SWR：`mutate(prev => normalizeSettings({ ...prev, ...written }), { revalidate: false })`。原来只改缓存的 `setSettings` 被删除，Translator 中 `setSettings as persistSettings` 的别名随之消失。
- 主题：`useCurrentThemeType` 直接读 `useSettings().settings.themeType`。删除 `useThemeType.ts` 与所有 `refreshThemeType()` 调用。
- 设置面板以 `savedValues` 为基准，用 `dequal` 逐个顶层字段比较，只把变化的字段交给 `updateSettings`，没有变化就不写。`onSubmit` 等于"持久化改动 + 'Saved' toast + `onSave`"，失焦保存只做"持久化改动"，两者共用一个函数。由于 `renderMarkdown` 不在面板中，它永远不会出现在 diff 里，因此两处重新读存储的特殊处理可以删除。这符合 `settings-surface` 中"部分设置写入"的修改。
- OpenAI TTS 失效引用的 toast（`text-to-speech` 要求的行为）从存储层移到设置面板的保存函数：如果提交的 `tts.provider === 'openai'` 而写入结果为 `'edge'`，就按原逻辑选择文案并弹出 toast。`setSettings` 返回写入结果，正是为了支持这个判断。按 diff 保存时，删除 Provider 或修改其协议不会改动 `tts`，所以这种关联回退放在 `sanitizeSettingsForStorage` 里处理，而不是由设置面板提交表单中的 `tts`：写入包含 `providers` 而调用方没有提交 `tts` 时，就用**已存储的** `tts` 和新的 Provider 列表做判断；只有已存储的 `tts.provider === 'openai'`，且它关联的 Provider 在新列表中不再满足 `canProvideTTS`，才把归一化后的 `tts`（provider 为 `'edge'`，其余字段取自已存储值）加入这次写入。这样不会用设置面板的旧快照覆盖其它界面保存的 TTS 设置。设置面板据此判断是否提示：Provider 写入的结果中包含 `tts`，就说明发生了关联回退；再根据新列表中关联 Provider 是缺失还是改成了 Anthropic，选择 deleted 或 Anthropic 文案。
- "哪个 Provider 能提供 TTS"由 `utils.ts` 导出的 `canProvideTTS(provider)` 统一定义（协议为 `openai-chat` 或 `openai-responses`）。归一化、设置面板下拉列表和 `openai-tts` 都调用它。
- **备选**：把设置面板改为每个字段受控并立即写入。没有选，因为改动面更大，而 diff 方案已经能满足规格。

### D3. 平台适配层收窄

- 移除 userscript 后，`getBrowser()` 只区分两种情况：Tauri（`tauriBrowser`）和扩展（`webextension-polyfill`）。`IBrowser` 收窄为 `{ storage: { sync: { get; set } } }`。D2 删除旧 key 清理后，`remove` 已经没有调用方，所以 Rust `update_config` 的 `remove` 参数及其删除键循环也一并删除（`settings-surface`"桌面设置文件完整性"）。`polyfills/tauri.ts` 删除 `BrowserRuntime`、`BrowserI18n` 等空壳类，只导出存储对象和 D1 的 `tauriFetch`。内容脚本是扩展独有的，`runtime.onMessage` 与 `getURL` 直接使用 `webextension-polyfill`。
- 删除 `isDesktopApp`（它是 `isTauri` 的别名），统一使用 `isTauri()`。
- `services/history.ts` 直接导出 `isTauri() ? historyInternalService : backgroundHistoryService`，并从接口和四个实现中删除从未被调用的 `get()`。
- `usePinned` 只被 `src/tauri/components/Window.tsx` 使用，移到 `src/tauri/hooks/`，同时去掉其中恒为真的 `isTauri()` 判断。
- Toast 统一使用 `react-hot-toast/headless` 加自有 `Toaster.tsx`，每个根界面挂一个渲染器。`Settings`、`ProviderForm` 改为从 `react-hot-toast/headless` 导入 `toast`，删除 `InnerSettings` 内的样式化 `<Toaster>`。Translator、`SettingsWindow.tsx`、`options/index.tsx` 这三个根界面各自保留现有的 headless `Toaster`，只删除说明双系统的注释。`HistoryWindow.tsx` 目前没有渲染器，导致 `TranslationHistory` 的复制提示不可见，这里补上一个 headless `Toaster`。`InnerSettings` 本身不挂 Toaster，所以内嵌在 Translator 中时也只有一个渲染器。
- `Form` 模块只保留设置页实际使用的部分：一个包装 rc-field-form `Field` 与 baseui `FormControl` 的 `FormItem`（name、label、caption、style），再加 `useForm` 与 `Form` 的再导出。删除 `validators.ts`、`FormList`、`FormProvider`、`createShouldUpdate`，以及 `Paths` / `PathType` 类型体系。

### D4. 引擎与 TTS 去重

- `openai-api-path.ts` 导出 `DEFAULT_ENDPOINT_BY_PROTOCOL`，供三个协议、`openai-tts` 与 `ProviderForm` 共用。
- `openai-chat.ts` 导出 `getHeaders`，供 `openai-responses` 与 `openai-tts` 复用。`EngineProviderConfig` 只保留 `engines/index.ts` 中的一份声明。`openai-responses` 直接从 `openai-chat` 导出 `listModels`，去掉包装层。
- `interfaces.ts` 导出 `getErrorMessage(error, fallback = 'Unknown error')`，取值顺序为 `response.error.message`、`error.message`、`message`、`detail`。`EngineSession` 直接使用它，不再接收注入的回调。删除四个协议文件中各自的变体；`openai-tts` 以 i18n 文案作为 fallback 调用它。这一顺序是原有三个顺序的并集，`translation-core` 中"翻译失败处理"的错误消息顺序随之统一。
- `model-filter.ts` 导出 TTS 模型谓词，`openai-tts` 不再重复定义正则。
- `translate.ts` 只调用一次 `getStructuredOutputMode`，单词模式和句子模式都由它的返回值决定。删除重复赋值以及与 `mode` 等价的 `isWordMode` 和条件判断。
- 删除 `tts/index.ts` 中没有调用方的 `speak()`。`SpeakerIcon` 保持现有 props：设置页试听要用未保存的表单值，Translator 的两处朗读按钮继续自行解析 voice。这样改动最小，也不会丢失 `onStartSpeaking` 等生命周期回调。
- Edge TTS：桌面端（原生分段，base64）和浏览器端（`edge-tts-universal` 返回 Blob）各自只负责产出 `ArrayBuffer[]`，之后共用一个播放循环：同一个 `AudioContext`、一套停止与中止逻辑，结束后统一调用 `onFinish`。浏览器端相当于只有一个分段。`text-to-speech` 规定的资源释放、取消和静默失败上限保持不变，并由现有 `edge-tts.spec.ts` 覆盖。

### D5. Rust 侧去重

- `windows.rs` 中 `get_history_window`、`get_settings_window`、`get_updater_window` 合并为一个 `get_or_create_window(label, title, size, min_size)`。删除 `get_translator_window` 中恒为 `false` 的 `center` 参数和不可达分支，并删除 `show_updater_window` 中无人监听的 `update_result` 事件。
- `main.rs` 中两段更新检查与 `windows.rs` 的 `CheckUpdateEvent` 处理合并为一个 `check_update(handle) -> Option<UpdateResult>`，再加一个"写入结果并刷新托盘"的函数。`UPDATE_RESULT` 的 `Mutex<Option<Option<_>>>` 保留：它需要区分"尚未检查"和"检查过但没有更新"。合并后只加一次锁。`CheckUpdateResultEvent` 的载荷改为 `Option<UpdateResult>`。检查成功时（有更新或无更新）发送这个事件，`UpdaterWindow` 收到后结束 checking 状态。这替代了原先无人监听的 `update_result` 事件，也修复了无更新时更新窗口一直停在 checking 的问题。检查失败时不发送事件，保持现有行为：`UpdaterWindow` 把 `null` 显示为"已是最新版本"，失败若也发 `None` 就会误导用户；为失败单独设计界面属于新功能，不在本次范围内。
- `APP_HANDLE` 改用 `std::sync::OnceLock`，删除 `once_cell`。
- `edge_tts.rs` 中手写的 HTTP 日期格式化改用已有依赖 `time` 的 `formatting` + `macros` feature。
- 代理：`config.rs` 提供 `ProxyConfig → reqwest::Proxy` 的单一实现，D1 的原生 `fetch` 与 `edge_tts.rs` 共用；删除 `edge_tts.rs` 中的 `apply_proxy_config` 和 `fetch.rs` 中的内联拼装。
- `insertion.rs` 的异步命令中，`thread::sleep` 改为 `tokio::time::sleep`。这与 `settings-surface` 中"更新检查不阻塞桌面任务"的原则一致。
- `ConfigUpdatedEvent` 的监听器中，对 `CONFIG_CACHE` 的重复清理删除（`update_config` 已经清理过），只保留托盘重建。

### D6. 内容脚本

- 内容脚本入口是 `src/entrypoints/content.ts` 的 `defineContentScript`（见 D11）。`matches`、`allFrames`、`matchAboutBlank` 写在入口选项中，与现在 manifest 中的内容一致。
- 浏览器相关的代码都放在 `main(ctx)` 中：WXT 构建时会在 Node 中导入入口模块以读取选项，所以入口顶层不能有这类代码。例如 `@/common/i18n` 在模块作用域调用 `i18n.use(LanguageDetector).init(...)`，会访问 `document` 和 `localStorage`，所以入口改为在 `main(ctx)` 中动态导入它和渲染模块，而不是在顶层静态导入。
- 入口注册三个监听：
  - `mouseup` / `touchend`：记录坐标。
  - `open-translator` 消息：打开卡片。
  - `mousedown` / `touchstart`：只在卡片已存在时才读取 `pinned` 并决定是否关闭。卡片不存在时直接返回，不读取设置，也不创建容器。
- 卡片用 WXT 的 `createShadowRootUi`（`cssInjectionMode: 'ui'`）挂载，这样随 Translator 打进来的 CSS module 会被注入 shadow root，手写的 `getContainer` / shadow root 创建以及 `PLUGIN_WEB_EXT_CHUNK_CSS_PATHS` / `addViteStyleTarget` 的 CSS 注入代码都可以删除。
- `createShadowRootUi` 的宿主元素名必须是合法的自定义元素名，所以用 `zeroclover-simpleai-translator`。`consts.ts` 中的 DOM id（`containerID`、`popupCardID`、`popupCardInnerContainerId`）保持不变，设在宿主内部的元素上，符合 `app-identity` 的命名空间要求。Playwright 的选择器可以穿透 open shadow root，e2e 的定位方式不变。
- Firefox 的 Dexie `then` 修补：升级到 Dexie 4 后先确认是否仍然需要。如果仍需要，就放在 `main(ctx)` 开头；如果不需要，直接删除。

`Translator` 的滚动边缘检测中，`MutationObserver` 观察 Translator 自己的根节点，不再观察 `document.body`。在 popup 中二者结果相同；在内容脚本中则不再被宿主页面的 DOM 变动触发。

### D7. 组件中只删不搬

Translator 中删除：7 个未使用的样式 key；`logoWithTextRef`、`languagesSelectorRef` 两个死 ref，以及随之不再需要的 `LogoWithText` `forwardRef` / `useImperativeHandle`；`MovementXY`；失效的 `eslint-disable`；只传给 `translate` 的空 `onStatusCode`。两处相同的"打开扩展设置页"代码块合并为一个回调。Translator 与 Settings 之间那两段很短的选项映射（模型选项、语言选项）保持各自一份：Translator 已经导入了 `InnerSettings`，如果再让 Settings 从 Translator 导入，就会形成循环依赖。

Settings 中：`RestorePreviousPositionCheckbox` 与 `RunAtStartupCheckbox` 改用 `MyCheckbox`，删除 `console.debug`，`onSubmit` 与 `persistSettings` 按 D2 合并。

`TranslatorWindow.tsx` 删除 `show-settings` 监听、`showSettings` 状态及 Translator 的对应 prop。Translator 在 `props.uuid` 变化时把内嵌设置切回翻译视图的行为保留，只是不再读取已删除的 prop。

### D8. 构建配置

- 迁移到 WXT 后（D11），`vite.config.chromium.ts`、`vite.config.firefox.ts` 和 `src/browser-extension/manifest.ts` 由一个 `wxt.config.ts` 取代：manifest 按 `browser` 生成，两个浏览器共用一份配置。`vite.config.tauri.ts` 与供 vitest 使用的 `vite.config.ts` 保留，删除其中与 `tsconfigPaths()` 重复的 `@` alias 和无用的 `svgr()`。
- `tauri.production-no-updater.conf.json` 只保留与基础配置不同的字段（updater、`createUpdaterArtifacts`、`signCommand`），由 `tauri build --config` 以 JSON merge patch 方式合并到基础配置上：`signCommand` 要删除，所以写成 `null`。两份配置中的 `resources` 条目随 AppleScript 资源一起删除，`plugins.fs` 随 `tauri-plugin-fs` 一起删除。

### D9. e2e 中桌面流式请求的模拟方式

`e2e/translator.spec.ts` 已经通过 route 替换 `universal-fetch.ts` 来模拟非流式 fallback。改造后，流式请求也在这一层模拟：POST 且请求体 `stream: true` 时，返回一个 `Response`，其 body 是测试控制的 `ReadableStream`。`NativeStream.status(...)`、`chunk(...)`、`end()` 保持原有接口，内部改为设置响应状态和 `controller.enqueue` / `close`，因此现有用例不需要修改断言。同时删除 `mockIPC` 中的 `fetch_stream` 分支。`utils.fetch.spec.ts` 中针对原生事件的测试一并删除，改为用 mock fetcher 验证取消语义的测试。`tauriFetch` 自身另有单元测试，用 mock 的 `invoke` 和 Channel 覆盖：响应头与正文、abort 时调用 `fetch_cancel`、`reader.cancel()` 时调用 `fetch_cancel`。Rust 侧的取消用一个本地 TCP 服务做集成测试：先发送部分正文再暂停，取消后服务端应立即观察到连接关闭。

### D10. 依赖升级规则

- 每个直接依赖（`package.json` 与 `src-tauri/Cargo.toml`）都升级到最新稳定版。规则如下：
  - 预发布版本不算稳定版。唯一的例外是没有稳定 2.x 的 `specta` / `tauri-specta`：它们在 crates.io 上的"最新稳定版"是与 tauri 2 不兼容的 1.x 旧线，所以使用与所选 tauri 兼容的最新 2.0 rc。`specta-typescript` 使用其最新稳定版中与该 `specta` rc 配套的版本（目前是依赖 `specta =2.0.0-rc.25` 的 0.0.12）。
  - 如果某个依赖的最新版被另一个依赖的 peer 约束挡住，就用约束允许的最高版本，并在 `validation.md` 中记录原因。
  - 只为过时依赖存在的阻碍，优先删除或替换那个过时依赖。
- 目前已核实的约束：
  - `typescript-eslint` 8.x 要求 `typescript <6.1`，所以 TypeScript 用 6.0.x，而不是 7。
  - `eslint-plugin-react` 7.37 的 peer 范围到 eslint 9.7+，所以 eslint 用 9.x 最新版。需要把 `.eslintrc.js` 迁移到 flat config（`eslint.config.js`）。
  - `eslint-plugin-baseui` 只支持 eslint ≤8，而且只提供 3 条警告级规则，所以删除。
  - `eslint-plugin-import` / `eslint-import-resolver-typescript` 只出现在 `settings.import/resolver` 中，没有启用任何规则，所以删除。
  - 实施时确认：`baseui-sd` 12.2.4 的 peer 是 `react < 19`，npm 上 14.x 全是未构建的源码包，无法用于 React 19。`baseui-sd` 12.2.4 等于上游 `baseui` 12.2.0 加 Select 的一处 shadow DOM 修正（外部点击判断用 `event.composedPath()[0]`），所以换成上游 `baseui` 18.2.0，并用 `pnpm patch` 携带这处修正。
  - `@samrum/vite-plugin-web-extension` 最后一次发布在 2024-09，只支持 vite ≤5，而 `@vitejs/plugin-react` 6 需要 vite 8，vitest 5 需要 vite ≥6.4。所以用 WXT 替换它（D11），之后 vite、vitest、`@vitejs/plugin-react`、`vite-tsconfig-paths` 都可以升到最新。
- **Node 运行时基线**：升级后的依赖要求 Node ≥22.12（WXT 0.21 要求 `>=22`；vite 8、`@vitejs/plugin-react` 6 要求 `^20.19 || >=22.12`；vitest 5 要求 `^22.12 || ^24 || >=26`；eventsource-parser 4 要求 `>=22.12`）。所以在第一个需要新 Node 的依赖升级之前，先把 Node 基线定为实施时的最新 Active LTS（不低于 22.12），并同步更新以下位置：五个 workflow（`lint.yaml`、`unit-test.yaml`、`playwright.yml`、`test-build.yaml`、`release.yaml`）中的 `NODE_VERSION`、`package.json` 的 `engines.node`，以及 README / AGENTS 中的本地开发要求。
- 升级顺序遵循"先删后升"：第 1–3 组删除的依赖不再升级；第 4 组用原生 fetch 取代 plugin-http 之后，plugin-http 也不再升级。
- 升级分三组，每组独立验证：
  - Rust 依赖：tauri 2.12 及插件、reqwest 0.13 与 reqwest-websocket、rand、sha2、base64、enigo、active-win-pos-rs、cocoa、windows、xcb 等，并把 `rust-version` 提高到新版本要求的 MSRV。
  - 前端运行时依赖：React 19、baseui-sd 14、rc-field-form 2、i18next 26 / react-i18next 17、Dexie 4 与 dexie-react-hooks 4、eventsource-parser 4、zustand 5、lru-cache 11、swr、color 5、clsx 2、react-error-boundary 6 等。
  - 构建与检查工具链：WXT、vite 8、vitest 5、jsdom、TypeScript 6.0、eslint 9 flat config、Playwright 等。
- 大版本升级只做该版本必需的迁移，按各依赖的官方迁移指南逐项处理。例如 React 19 移除了 `findDOMNode`，需要确认 `react-draggable` 使用了 `nodeRef`；eventsource-parser 4 的 `createParser` 改为接收回调对象。

### D11. 浏览器扩展构建迁移到 WXT

- WXT 是活跃维护的 Web 扩展构建框架（0.21，支持 vite 8，同时支持 Chromium 与 Firefox）。aklinker1 的 `vite-plugin-web-extension` 已宣布由它接替。CRXJS 3 虽然支持 vite 8，但 Firefox 支持还没有文档，也不支持后台页面（crxjs/chrome-extension-tools#1070、#1222），所以没有选。
- 目录与配置：
  - `wxt.config.ts` 设 `srcDir: 'src'`，入口放在 `src/entrypoints/`，因此仍在 `tsc` 和 `eslint "src/**"` 的覆盖范围内；`wxt.config.ts` 本身加入 `tsconfig.json` 的 `include`。
  - 入口只是薄壳，分别导入实现模块：`src/entrypoints/background.ts`、`src/entrypoints/content.ts`（D6）、`src/entrypoints/popup/index.html`、`src/entrypoints/options/index.html`。实现模块（包括 `content_script/consts.ts` 等）仍留在 `src/browser-extension/`，共享代码仍在 `src/common`。
  - `src/browser-extension/manifest.ts` 和 `src/index.d.ts` 中对 `@samrum/vite-plugin-web-extension/client` 的类型引用一并删除。
- manifest 的生成方式：WXT 会根据入口自动生成部分字段，所以不能把旧 manifest 整个搬进 `wxt.config.ts`。
  - 两个浏览器都设 `manifestVersion: 3`；WXT 对 Firefox 默认使用 MV2。
  - `options_ui.open_in_tab` 用 options 入口 HTML 的 `<meta name="manifest.open_in_tab" content="true">` 保留。
  - `content_scripts` 的选项写在 `defineContentScript` 中。
  - 以下字段写在 `wxt.config.ts` 的 `manifest` 中：权限、`host_permissions`、`optional_host_permissions`、`browser_specific_settings`、`name` / `description` 等身份字段、按浏览器的差异，以及 WXT 不会自动生成的两项：
    - `icons` 与 `action.default_icon`：WXT 只识别带尺寸的图标文件名，而仓库只有 `public/icon.png`。
    - 内容脚本用到的图片资产（`LogoWithText` 的 icon、设置面板的 `icon-large` 与 `beams`）的 `web_accessible_resources`，`matches` 为 `<all_urls>`：WXT 只会自动加入 `cssInjectionMode: 'ui'` 的 CSS。
  - 迁移前后的 manifest 按语义比较：上面这些字段（包括 `icons`、`action.default_icon` 和图片资产的 `web_accessible_resources`），以及内容脚本的 `matches` / `all_frames` / `match_about_blank`、MV3 后台的形态，都应一致；入口文件路径和 WXT 自动追加的 `web_accessible_resources` 按 WXT 的约定变化。
- 图片 URL：
  - WXT 把 `import.meta.url` 定义为 `self.location.href`（`builders/vite/plugins/define-import-meta.ts`），在内容脚本中它是宿主页面的 URL。所以 `utils.getAssetUrl` 不能再用 `new URL(asset, import.meta.url)`。
  - 改为：在浏览器扩展中返回 `chrome.runtime.getURL(asset)`，这是 WXT 文档 `assets.md` "Inside Content Scripts" 给出的做法；在 Tauri 中原样返回 `asset`。
    - 使用运行时全局的 `chrome.runtime`（Chromium 与 Firefox 的扩展页面和内容脚本中都存在），不在 `utils.ts` 顶层静态导入 `webextension-polyfill`：那个 polyfill 在模块加载时就会检查扩展环境，在 Tauri 构建中会抛错。
  - WXT 的内容脚本采用 Vite library mode，而 library mode 会忽略 `assetsInlineLimit`，总是把资产内联为 data URL（Vite 文档 `build-options.md` 中 `build.assetsInlineLimit` 的说明；`plugins/asset.ts` 的 `shouldInline` 会先检查 `?no-inline` 再判断 library mode）。所以 `LogoWithText` 和 `Settings` 中的图片改用 `?no-inline` 导入，强制以文件形式输出，再配合上面的 `web_accessible_resources`。这样也避免了这些图片约 400 KB 的 base64 进入每个 frame 都要解析的内容脚本。
  - 两个浏览器共用一份配置后，Firefox 原来的 `assetsInlineLimit: 1MB` 特例也一并删除。
  - WXT 在内容脚本的 lib 构建中，把非 CSS 资产命名为 `assets/<入口名>.[ext]`，不含原文件名和 hash。所以 `web_accessible_resources` 与任务 12.1 的路径验收要按实际输出路径写（目前是 `assets/content.png` 与 `assets/content.jpg`；`icon.png` 与 `icon-large.png` 字节相同，合并为一个文件不影响显示）。以后在内容脚本中再引入同扩展名、内容不同的图片时，两者会互相覆盖，需要在实施时留意。
- 以下位置引用的扩展输出目录和开发命令改为 WXT 的（`wxt` / `wxt -b firefox` / `wxt zip`）：`Makefile`；`release.yaml`；`playwright.yml`（现在执行 `pnpm vite build -c vite.config.chromium.ts`）；`test-build.yaml`（`make build-browser-extension`，并上传 `dist/browser-extension/`）；e2e fixtures 与 `e2e/common.ts`（popup / options 页面变为 `/popup.html`、`/options.html`）；`AGENTS.md`。打包产物的文件名保持现在的命名，这样 release 资产和更新说明不需要改。
- `app-identity` 规定的 manifest 可见字段与 DOM / JSS / Styletron 命名空间前缀字符串保持不变；唯一的新增是 shadow root 宿主元素名的例外（见 D6 和 app-identity 增量）。`createShadowRootUi` 的宿主元素名见 D6。`app-identity` 与 `no-telemetry` 规格中写死的 `manifest.ts` 和旧 HTML 路径随之更新；两个 grep 守卫脚本的路径清单中，`src/browser-extension/manifest.ts` 替换为 `wxt.config.ts`。脚本还要改为：路径清单中任一路径不存在时就失败，避免以后再出现路径失效、覆盖被静默丢掉的情况。

## Risks / Trade-offs

- [原生 fetch 需要自己覆盖 plugin-http 原本处理的细节（重定向、请求头、二进制响应、错误映射）] → reqwest 默认跟随重定向；响应正文按原始字节传输，因此 TTS 音频和 JSON 用同一条路径；网络错误映射为 `TypeError`，与浏览器 `fetch` 一致。单元测试覆盖这几点，并在 macOS 和 Windows 上手动验证模型刷新、三个协议的流式增量与停止、OpenAI TTS、语言检测、代理和代理测试。
- [取消实现有缺陷，导致连接没有关闭] → Rust 集成测试用会暂停发送的本地 TCP 服务验证取消后连接立即关闭；手动验证同一场景。
- [依赖大版本升级引入行为变化] → 升级分三组（D10），每组按官方迁移指南处理并独立验证；Rust 组还需在 macOS、Windows、Linux 上验证启动、托盘、更新器、自动启动和单实例通知。
- [WXT 迁移改变扩展产物] → 按 D11 列出的语义字段对比迁移前后生成的 Chromium 与 Firefox manifest；e2e 在 WXT 构建产物上运行；在 Firefox 中手动验证右键打开卡片、popup、选项页与权限请求。
- [删除旧 key 清理后，存储中会残留旧 key] → 这些 key 不会被读取，不影响行为。此前版本的每次保存都已删除这些 key，所以升级过的安装中通常不会残留。
- [只设置过 `defaultTargetLanguage` 或 `enableMica` 的极旧安装会回到默认值] → proposal 中已标为 BREAKING，用户在设置里重新选择一次即可。
- [设置面板改为写 diff 后，某些字段可能被漏写] → 用 `dequal` 逐个比较顶层字段；嵌套对象（`tts`、`proxy`）整体作为一个字段写入。单元测试覆盖"只改字号"与"未改动不写入"。
- [删除依赖时误删间接使用的包] → 每删一个包都要用 `git grep` 和构建验证；`pnpm build-browser-extension`、`pnpm build-tauri-renderer` 与 `cargo check` 必须全部通过。

## Migration Plan

不做数据迁移。按 tasks.md 的分组顺序实施，每组完成后运行该组的验证命令再进入下一组；需要回滚时按组 revert 即可。发布说明中注明三点：移除 userscript、移除 token 计数、极旧设置字段不再迁移。依赖升级不改变用户可见行为，无需单独说明。
