# Tasks

开始实施前，在本变更的 `validation.md` 中记录基线 commit 与实施分支，以及基线上的体积和行数，供 13.2 对比。每组完成后都应满足以下基线：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test` 通过；涉及 Rust 的组还需 `cargo check --manifest-path src-tauri/Cargo.toml` 与 `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` 通过。删除任何符号或依赖之前，先用 `git grep -n -w <name>` 确认没有调用方。

## 1. 移除 userscript 与 Safari 目标

- [x] 1.1 删除 `vite.config.userscript.ts`、`src/common/polyfills/userscript.ts`、`userscript.spec.ts`、`package.json` 中的 `build-userscript` 脚本、Makefile 的 `build-userscript` 目标，以及 `.github/workflows/release.yaml` 中的 userscript 构建与上传步骤；验证：`git grep -n -i userscript -- package.json Makefile .github vite.config.*.ts` 无结果
- [x] 1.2 删除 `src/` 中所有 `isUserscript()` 分支与该函数本身（`utils.ts`、`universal-fetch.ts`、`services/history.ts`、`getAssetUrl` 等）；验证：`git grep -n -w -E 'isUserscript|GM_info|GM\.getValue|GM_getResourceURL' -- src` 无结果，并且 `pnpm build-browser-extension` 成功
- [x] 1.3 移除 `vite-plugin-monkey`、`@types/tampermonkey`、`rollup-plugin-visualizer`，并删除 `tsconfig.json` / `src/index.d.ts` 中的 tampermonkey 类型引用；验证：`pnpm install` 后 `pnpm exec tsc --noEmit` 通过
- [x] 1.4 删除 `src-safari/`，以及 `.eslintignore` 中的 `src-safari` 条目；验证：`git ls-files src-safari` 为空，`git grep -n src-safari -- ':!openspec'` 无结果
- [x] 1.5 更新 `README.md`、`README-CN.md`，删除 userscript 产物与构建说明，并在 `AGENTS.md` 的构建命令中删除 `pnpm build-userscript`；验证：`git grep -n -i -E 'userscript|user\.js' -- README.md README-CN.md AGENTS.md` 无结果
- [x] 1.6 核对实现是否满足 `build-targets` 的三个场景；验证：逐条执行场景中的 grep 与文件检查，全部符合

## 2. 删除前端死代码、无用依赖与 i18n key

- [x] 2.1 删除 `src/tauri/legacy-tauri-ipc.ts` 及 `src/tauri/index.tsx` 中对它的导入；验证：`git grep -n __TAURI_IPC__ -- src` 无结果，`pnpm test:e2e` 中桌面端用例通过
- [x] 2.2 删除 `exportToCsv`、`isDarkMode`、`src/common/components/DurationPicker.tsx`，以及无调用方的导出 `getPageX`、`getPageY`、`getCaretNodeType`、`calculateMaxXY`、`CUSTOM_MODEL_ID`、`IMessage`、`langMapReverse`、`intoLangCode`、`isSimplified`、`BackgroundHistoryServiceMethodNames`、`TranslateResult`，并从 `useSettings` 的返回值中删除 `isSettingsLoading`；验证：tsc 与 lint 通过
- [x] 2.3 删除 token 计数：删除 `src/common/token.ts`、Translator 中的 `tokenCount` 状态与页脚显示、只为它存在的 `src/common/hooks/useLazyEffect.ts`，以及 `js-tiktoken` 依赖；验证：`git grep -n -E 'tokenCount|useLazyEffect|js-tiktoken' -- src package.json` 无结果，`pnpm build-browser-extension` 产物中不再有 `token-*.js` chunk，手动确认页脚的 Provider / Model 信息显示正常
- [x] 2.4 从 `package.json` 删除未被导入的依赖：`date-fns`、`dayjs`、`js-sha3`、`react-use`、`url-join-ts`、`use-resize-observer`、`@tauri-apps/plugin-notification`、`@tauri-apps/plugin-fs`、`i18next-http-backend`（同时删除 `i18n/index.ts` 中的 `.use(Backend)`）；验证：`pnpm install && pnpm build-browser-extension && pnpm build-tauri-renderer` 成功
- [x] 2.5 用 `lodash.debounce` 替换 `_.debounce`，用新增的直接依赖 `dequal` 替换 `_.isEqual`，删除 `underscore` 与 `@types/underscore`；`lang/index.ts` 中两处 `qs.stringify` 改为 `URLSearchParams`，删除 `qs` 与 `@types/qs`；验证：`lang/index.spec.ts` 通过，并在单元测试中断言 Google / Bing 检测请求解析后的参数键值对与原来一致（空格会从 `%20` 变为 `+`，两种写法都是合法的表单编码）
- [x] 2.6 删除未使用的 devDependencies：`archiver`、`base64-inline-loader`、`chokidar-cli`、`esbuild`、`esbuild-plugin-copy`、`esbuild-plugin-inline-import`、`esbuild-server`、`fs-extra`、`@types/fs-extra`、`vite-plugin-dynamic-import`、`vite-plugin-svgr`（同时从 4 个 vite 配置和 `tsconfig.json` 的 `types` 中删除 svgr）；删除 `src/index.d.ts` 中无用的 `iso-639-3-to-1`、`*.svg`、`*.svg?react`、`*.css?inline`、`*.jpeg` 声明；验证：所有 `pnpm build-*` 与 `pnpm test:e2e` 通过
- [x] 2.7 在 2.2 和 2.3 完成之后，以 `en/translation.json` 为基准，用脚本找出 `src` 中没有任何字面量引用的 key，并从全部 6 个 locale 中删除。目前是 28 个，删除 `DurationPicker` 后还会多出 `Seconds`、`Minutes`、`Hours`、`Forever`；验证：`src/common/i18n/locales.spec.ts` 通过（6 个 locale 的 key 集合一致）
- [x] 2.8 删除被跟踪的本地工具产物 `.antigravitycli/`，并加入 `.gitignore`；验证：`git ls-files .antigravitycli` 为空

## 3. 删除桌面端死代码、crate 与权限

- [x] 3.1 删除无调用方的 Tauri 命令及其独占代码：`show_translator_window_command`、`show_translator_window_with_selected_text_command`（以及 `get-selected-text` crate）、`hide_translator_window`、`position_translator_window_to_cursor`、`focus_translator_window`、`detect_lang`（`lang.rs`、`whatlang` crate）；取消 `clear_config_cache` 的命令注册，内部函数保留；用 `pnpm dev-tauri` 重新生成 `src/tauri/bindings.ts`；验证：`cargo check` 通过，bindings 中不再有这些命令
- [x] 3.2 删除 `utils.rs` 中死的键盘模拟函数（`select_all`、`up_control_keys`、`paste` 及其常量）、`src-tauri/resources/*.applescript`，以及两份 tauri 配置中的 `"resources"` 条目；验证：`cargo clippy -D warnings` 通过，`pnpm build-tauri-no-updater` 成功
- [x] 3.3 删除 `sysinfo` 和 `CPU_VENDOR`；删除未使用的 crate `clipboard`、`arboard`、`cpuid`、`tauri-utils`、`objc`；把 `APP_HANDLE` 改为 `std::sync::OnceLock` 并删除 `once_cell`；验证：三个平台目标的 `cargo check` 通过（可交给 CI）
- [x] 3.4 删除 `tauri-plugin-os`、`tauri-plugin-fs`（同时删除 `.plugin(tauri_plugin_fs::init())` 和两份 tauri 配置中的 `plugins.fs`），以及 `capabilities/main.json` 中的 `os:*`、`fs:*`、`notification:*` 权限（Rust 侧使用通知不需要 capability），并提交 `cargo check` 重新生成的 `src-tauri/gen/schemas/`；验证：桌面端二次启动仍弹出"already running"通知
- [x] 3.5 删除 `windows` crate 中 OCR 遗留的 feature（`Graphics_Imaging`、`Media_Ocr`、`Foundation`、`Foundation_Collections`、`Globalization`、`Storage`、`Storage_Streams`）；验证：Windows 目标的 `cargo check --target x86_64-pc-windows-msvc` 通过（可交给 CI）
- [x] 3.6 删除 `Config` 中的死字段 `allow_using_clipboard_when_selected_text_not_available`、`get_translator_window` 恒为 `false` 的 `center` 参数、`show_updater_window` 中无人监听的 `update_result` 事件，以及 `TranslatorWindow.tsx` 中无人发出的 `show-settings` 监听链路（`showSettings` 状态与 Translator 的同名 prop），同时保留 `props.uuid` 变化时内嵌设置切回翻译视图的行为；验证：`cargo clippy` 与 `pnpm test:e2e` 通过
- [x] 3.7 `insertion.rs` 异步命令中的 `thread::sleep` 改为 `tokio::time::sleep(...).await`；验证：手动测试"插入译文到上一个输入框"仍然有效
- [x] 3.8 删除没有使用方的 asset 协议：`Cargo.toml` 中 tauri 的 `protocol-asset` feature、`tauri.conf.json` 的 `assetProtocol`，以及 CSP 中的 `asset:` / `asset.localhost` 条目；验证：`git grep -n -E 'convertFileSrc|asset://' -- src` 无结果，并手动确认桌面端各窗口的图片与图标正常显示
- [x] 3.9 删除 `config.rs` 中只做转发的 `get_config_by_app`，调用方直接使用 `_get_config_by_app`（并去掉下划线前缀）；验证：`cargo test` 通过

## 4. 桌面端统一原生 fetch

- [x] 4.1 在 `config.rs` 中实现 `ProxyConfig → reqwest::Proxy` 的单一函数，替换 `edge_tts.rs` 的 `apply_proxy_config`；验证：`edge_tts.rs` 现有代理相关测试通过，`git grep -n apply_proxy_config -- src-tauri` 无结果
- [x] 4.2 按 design D1 把 `fetch.rs` 改写为通用 `fetch` 命令（请求描述、可选 `proxy` 覆盖、`tauri::ipc::Channel`、请求 id；返回响应头，正文按原始字节经 Channel 发送）和 `fetch_cancel(id)` 命令。取消信号在 `send()` 之前注册，并处理取消先于注册到达的情况；`send().await` 与正文循环都用 `tokio::select!` 等待取消；正文用 `InvokeResponseBody::Raw` 发送；删除 `Utf8StreamDecoder`、`fetch-stream-*` / `abort-fetch-stream` 事件与 `listen_any`；重新生成 bindings；验证：新增 Rust 集成测试并通过，覆盖四种情况：本地 TCP 服务接受连接后不发送响应头，取消后命令立即返回取消错误、服务端观察到连接关闭；先发送部分正文再暂停，取消后服务端立即观察到连接关闭；取消先于命令开始；正常读完和非 200 响应
- [x] 4.3 `polyfills/tauri.ts` 的 `tauriFetch` 改为调用原生 `fetch`：在 `invoke` 之前生成 id、设置 Channel 的 `onmessage` 并缓存早到的块、注册 abort 监听；等待响应头期间 abort 时调用 `fetch_cancel` 并以 `AbortError` 拒绝；之后用 Channel 构造 `ReadableStream`，`init.signal` abort 与 `reader.cancel()` 都调用 `fetch_cancel`；网络错误映射为 `TypeError`；验证：新增单元测试（mock `invoke` 与 Channel）并全部通过，覆盖：响应头与正文、早于响应头到达的块不丢失、二进制正文、`invoke` 挂起时 abort 立即以 `AbortError` 拒绝并调用取消、正文阶段 abort 时调用取消、`reader.cancel()` 时调用取消、网络错误类型
- [x] 4.4 删除 `fetchSSE` 的 `isTauri()` 分支，所有平台都走 `fetcher` reader 循环：调用 `fetcher` 之前如果信号已中止，直接抛出 `AbortError`；abort 时立即 `reader.cancel()`；每次 `read()` 返回后先检查信号，已中止就抛出 `AbortError`，不进入 flush / `end()`；catch 中按 `options.signal?.aborted` 统一抛出 `AbortError`；删除 `utils.ts` 对 `uuid`、`@tauri-apps/api/event`、`@/tauri/bindings` 的导入；验证：`utils.fetch.spec.ts` 删除原生事件测试，新增三条测试并通过："开始前已中止不调用 fetcher""流进行中中止后挂起的 read 立即结束并抛出 AbortError（用 cancel 时正常关闭、不主动 error 的流来测试）""fetcher 返回的流以非 AbortError 出错时也转换为 AbortError"
- [x] 4.5 `ProxyTester` 改为使用 `tauriFetch`，传入 `proxy` 覆盖与 `AbortSignal.timeout(10000)`；删除 `getFetchProxy`、`getFetchProxyConfig` 与 JS 侧的代理拼装；验证：手动测试代理测试按钮在代理可用与不可用时都给出正确结果
- [x] 4.6 删除 `@tauri-apps/plugin-http`、`tauri-plugin-http`、`.plugin(tauri_plugin_http::init())` 与 capability 中的 `http:default`，并提交重新生成的 `src-tauri/gen/schemas/`；验证：`git grep -n -E 'plugin-http|plugin:http|http:default' -- src src-tauri package.json` 无结果，`cargo clippy -D warnings` 与 `pnpm build-tauri-renderer` 通过
- [x] 4.7 按 design D9 改造 `e2e/translator.spec.ts`：流式模拟移到 `universal-fetch` route，返回可控的 `ReadableStream`，`NativeStream` 接口保持不变，并删除 `mockIPC` 中的 `fetch_stream` 分支；验证：`pnpm test:e2e` 全部通过，包括结构化预览、单次 fallback 和停止后保留部分文本
- [ ] 4.8 在 macOS 和 Windows 上用 `pnpm dev-tauri` 手动验证：模型刷新、OpenAI Chat / OpenAI Responses / Anthropic 三个协议的流式增量逐步出现、停止后立即不再有增量、OpenAI TTS、语言检测，以及启用代理后请求经过代理；另外用一个先发送部分 SSE 再暂停的本地服务，确认点击停止后服务端立即看到连接关闭；结果记录到本变更的 `validation.md`
- [x] 4.9 更新 `AGENTS.md` 代码地图中关于 `fetchSSE` 与桌面传输的描述；验证：文中描述的是单一原生 `fetch`，不再提到 plugin-http 或 `fetch_stream`

## 5. 设置单一写入路径

- [x] 5.1 `utils.ts` 删除 `legacySettingKeys`、`migrationSettingKeys`、`storageSettingKeys`、`defaultTargetLanguage` 迁移和 `enableMica`（`ISettings`、`settingKeys`、归一化、Rust `Config` 中如有）；`setSettings` 只执行一次 `get` 和一次 `set`，并返回写入的字段；随后删除已无调用方的 `storage.sync.remove`（`IBrowser`、`polyfills/tauri.ts`）、Rust `update_config` 的 `remove` 参数和删除键循环，以及相关测试与 e2e mock 中的 remove 分支，并重新生成 bindings；验证：`utils.spec.ts` 中关于旧 key 删除和迁移的用例按新规格改写，新增"写入只调用一次 `set`"与"只有 `defaultTargetLanguage` 时母语为默认值"两条用例并通过；`config.rs` 的并发写入测试去掉 remove 断言后通过
- [x] 5.2 把 OpenAI TTS 失效引用的 toast 从 `utils.setSettings` 移到设置面板的保存函数，`utils.ts` 不再导入 `react-hot-toast` 与 i18n；导出 `canProvideTTS(provider)`，供归一化、设置面板的 Provider 下拉和 `openai-tts` 共用；`sanitizeSettingsForStorage` 在写入 `providers` 而没有提交 `tts` 时，按已存储的 `tts` 处理关联回退（见 design D2）；验证：`openai-tts.spec.ts` 与设置相关测试覆盖以下用例并全部通过：从 Provider 列表删除被 OpenAI TTS 关联的 Provider，存储中的 `tts.provider` 变为 `'edge'` 并提示 deleted 文案；把它改成 Anthropic 协议时提示 Anthropic 文案；删除未被关联的 Provider 时不写 `tts`；另一界面已把 TTS 改为 system，或改为关联仍然有效的 p2，之后设置面板删除旧的 p1 时，不覆盖那次保存，也不弹回退提示
- [x] 5.3 `useSettings()` 改为返回 `{ settings, updateSettings }`（先持久化，再乐观更新缓存），删除只改缓存的 `setSettings`；Translator 的模型切换和 Markdown 开关改为调用 `updateSettings(change)`；验证：e2e"切换模型不回写 Provider""其它界面保存后切换 Markdown"通过
- [x] 5.4 删除 `useThemeType.ts`，`useCurrentThemeType` 改为从 `useSettings()` 读取 `themeType`，并删除所有 `refreshThemeType()`；验证：e2e 或手动确认保存主题后翻译界面立即切换主题
- [x] 5.5 设置面板以 `savedValues` 为基准，用 `dequal` 比较出改动的顶层字段后只写这些字段；`onSubmit` 和失焦保存共用一个持久化函数，删除两处重新读取 `renderMarkdown` 的代码；验证：新增单元测试或 e2e 覆盖 `settings-surface` 中"设置面板只保存改动字段"和"设置页旧快照不覆盖阅读偏好"两个场景
- [x] 5.6 `main.rs` 中 `ConfigUpdatedEvent` 的监听器不再重复清理 `CONFIG_CACHE`，只重建托盘；验证：设置窗口保存"固定"状态后托盘菜单同步更新

## 6. 平台适配层收窄

- [x] 6.1 把 `IBrowser` 收窄为 `storage.sync` 的 `get` / `set`；`polyfills/tauri.ts` 删除空壳类，只导出存储对象与 `tauriFetch`；内容脚本的 `runtime.onMessage` / `getURL` 直接使用 `webextension-polyfill`；验证：`polyfills/tauri.spec.ts` 与 e2e `index.spec.ts`（Chromium）通过，并在 Firefox 中手动确认右键菜单能打开卡片
- [x] 6.2 删除 `isDesktopApp`，所有调用方改为 `isTauri()`；验证：`git grep -n -w isDesktopApp -- src` 无结果
- [x] 6.3 `services/history.ts` 直接导出所选实现，并从接口、内部实现、后台实现和后台消息方法表中删除未使用的 `get()`；验证：e2e 历史记录用例通过
- [x] 6.4 把 `usePinned` 移到 `src/tauri/hooks/usePinned.ts`，并删除其中恒为真的 `isTauri()` 判断，以及 `Window.tsx` 中同样多余的判断；验证：e2e `titlebar.spec.ts` 通过
- [x] 6.5 Settings、ProviderForm 改用 `react-hot-toast/headless`，删除 `InnerSettings` 内的样式化 `<Toaster>`；Translator、`SettingsWindow.tsx`、`options/index.tsx` 各自保留一个 headless `Toaster`，只删除说明双系统的注释；`HistoryWindow.tsx` 补一个 headless `Toaster`；验证：`git grep -n "from 'react-hot-toast'" -- src` 无结果；在扩展选项页、桌面设置窗口和 Translator 内嵌设置中，保存提示与 TTS 错误提示都恰好显示一次；在历史窗口中，复制提示可见
- [x] 6.6 把 `components/Form/` 缩减为 `FormItem`（name、label、caption、style）以及 `Form` / `useForm` 的再导出，删除 `validators.ts`、`FormList`、`FormProvider`、`createShouldUpdate`、`Paths` / `PathType`；验证：设置面板渲染与保存的 e2e 通过

## 7. 引擎与 TTS 去重

- [x] 7.1 `openai-api-path.ts` 导出 `DEFAULT_ENDPOINT_BY_PROTOCOL`，替换三个协议、`openai-tts` 与 `ProviderForm` 中的 6 处定义；验证：`openai-api-path.spec.ts` 与 `protocols.spec.ts` 通过
- [x] 7.2 `openai-chat.ts` 导出 `getHeaders`，供 `openai-responses` 与 `openai-tts` 复用；`EngineProviderConfig` 只保留 `engines/index.ts` 中的一份；`openai-responses` 直接再导出 `listModels`；验证：`protocols.spec.ts`、`openai-tts.spec.ts` 通过
- [x] 7.3 在 `interfaces.ts` 导出 `getErrorMessage(error, fallback)`，取值顺序为 `response.error.message` → `error.message` → `message` → `detail`；`EngineSession` 不再接收回调；删除四处本地变体；验证：新增 translation-core"三个协议共用错误消息取值顺序"场景的测试并通过
- [x] 7.4 `model-filter.ts` 导出 TTS 模型谓词，`openai-tts.ts` 删除重复的正则；验证：`model-filter.spec.ts`、`openai-tts.spec.ts` 通过
- [x] 7.5 `translate.ts` 只计算一次 `getStructuredOutputMode`，句子模式和单词模式都由它决定，删除 `isWordMode` 和重复赋值；验证：`translate.spec.ts` 中提示词快照与缓存 key 测试保持不变并通过
- [x] 7.6 删除 `tts/index.ts` 中无调用方的 `speak()`，`SpeakerIcon` 的 props 保持不变；验证：`src/common/tts/index.ts` 不再导出 `speak`，tsc 通过，`tts/index.spec.ts` 通过
- [x] 7.7 Edge TTS 改为两端各自产出 `ArrayBuffer[]`，共用一个播放器；验证：`edge-tts.spec.ts` 中资源释放、取消、静默失败上限等用例全部通过

## 8. 组件清理

- [x] 8.1 Translator：删除 7 个未使用的样式 key、`logoWithTextRef` / `languagesSelectorRef`、`LogoWithText` 的 `forwardRef` / `useImperativeHandle`、`MovementXY`、失效的 `eslint-disable`、空的 `onStatusCode`；两处"打开扩展设置页"合并为一个回调；验证：lint（含 `react-hooks`）通过，e2e 通过
- [x] 8.2 Settings：`RestorePreviousPositionCheckbox` 和 `RunAtStartupCheckbox` 改用 `MyCheckbox`，并删除两处 `console.debug`；验证：设置页 e2e 通过

## 9. Rust 去重

- [x] 9.1 `windows.rs` 中三个 `get_*_window` 合并为 `get_or_create_window(label, title, size, min_size)`；验证：手动打开历史、设置、更新窗口，确认尺寸和标题不变
- [x] 9.2 三处更新检查合并为 `check_update` 加一个"保存结果并刷新托盘"函数，合并后对 `UPDATE_RESULT` 只加一次锁；`CheckUpdateResultEvent` 的载荷改为 `Option<UpdateResult>`，只在检查成功时发送，`UpdaterWindow` 收到后结束 checking 状态；检查失败时不发送；重新生成 bindings；验证：e2e `updater.spec.ts` 新增"无更新时结束 checking"用例并通过，`cargo clippy` 通过
- [x] 9.3 `edge_tts.rs` 的日期格式化改用 `time` crate 的 `format_description!`（启用 `formatting` 与 `macros` feature）；验证：`cargo test --manifest-path src-tauri/Cargo.toml` 中时间戳格式测试通过（如没有就新增一条固定时间的测试）
- [x] 9.4 `tauri.production-no-updater.conf.json` 改为只包含差异字段的覆盖配置，`signCommand` 用 `null` 删除；验证：`pnpm build-tauri-no-updater` 成功，产物中没有 updater 签名文件；合并后的配置中不含 `bundle.windows.signCommand`（Windows 实际构建交给 CI 的 test-build 矩阵）；且最终合并配置的 `productName` 和 `identifier` 与基础配置一致（`app-identity`）

## 10. Node 基线与 Rust 依赖升级

- [x] 10.1 按 design D10 把 Node 基线定为实施时的最新 Active LTS（不低于 22.12）：更新 `lint.yaml`、`unit-test.yaml`、`playwright.yml`、`test-build.yaml`、`release.yaml` 的 `NODE_VERSION`、`package.json` 的 `engines.node`，以及 README / README-CN / AGENTS 中的本地开发要求；验证：在新 Node 上 `pnpm install`、`pnpm test`、`pnpm build-browser-extension` 通过，CI 各 workflow 在新 Node 上通过
- [x] 10.2 把 `src-tauri/Cargo.toml` 的每个直接依赖升级到最新稳定版（规则见 design D10）：`tauri` / `tauri-build` 与全部 tauri 插件，以及 reqwest 0.13（连同 reqwest-websocket）、rand、sha2、base64、enigo、active-win-pos-rs、cocoa、windows、xcb、mouse_position、parking_lot、time、tokio 等；`specta` / `tauri-specta` 用与 tauri 兼容的最新 2.0 rc，`specta-typescript` 用与之配套的最新版本；按各 crate 的 CHANGELOG 处理破坏性变更，并把 `rust-version` 提高到所需的 MSRV；同步升级 `@tauri-apps/cli`、`@tauri-apps/api` 与剩余插件的 JS 包，使 JS 与 Rust 版本对应；验证：`cargo update` 后 `cargo check`、`cargo clippy -D warnings`、`cargo test` 通过，`pnpm build-tauri-renderer` 通过，bindings 重新生成后没有意外的 diff；用 `cargo tree -d` 检查重复的 reqwest 等大依赖，并在 `validation.md` 中记录
- [ ] 10.3 在 macOS、Windows、Linux 上用 `pnpm dev-tauri` 手动验证：启动、托盘菜单、自动启动开关、单实例通知、更新检查、窗口固定、插入译文（enigo / active-win-pos-rs 的 API 变化）、Edge TTS、流式翻译与停止；结果记录到 `validation.md`（Linux 与 Windows 可借助 CI 构建产物）

## 11. 升级前端运行时依赖

- [x] 11.1 把 `package.json` 的运行时依赖升级到最新稳定版（规则见 design D10）：React / React DOM 19 与对应的 `@types`、baseui-sd 14、styletron、react-jss / jss、rc-field-form 2、i18next 26 / react-i18next 17、Dexie 4 / dexie-react-hooks 4、eventsource-parser 4、zustand 5、swr、lru-cache 11、color 5、clsx 2、react-error-boundary 6、react-markdown、react-icons、react-hot-toast、react-draggable、react-country-flag、react-copy-to-clipboard、best-effort-json-parser、common-tags、uuid、web-streams-polyfill、webextension-polyfill 等；按官方迁移指南只做必需的改动（React 19 移除 `findDOMNode` 后确认 `react-draggable` 使用 `nodeRef`；eventsource-parser 4 改为 `createParser({ onEvent })`；Dexie 4 后确认 Firefox 的 `then` 修补是否仍然需要，不需要就删除）；验证：`pnpm test`、`pnpm test:e2e`、`pnpm build-browser-extension`、`pnpm build-tauri-renderer` 通过，在 Chromium、Firefox 与桌面端手动检查翻译、设置、历史与 TTS 的主要流程

## 12. 构建与检查工具链：WXT、vite 8、TypeScript 6、eslint 9

- [x] 12.1 按 design D11 把浏览器扩展构建迁移到 WXT：
  - `wxt.config.ts` 设 `srcDir: 'src'`、两个浏览器都用 `manifestVersion: 3`；薄壳入口放在 `src/entrypoints/`，实现模块留在 `src/browser-extension/`。
  - options 入口用 `<meta name="manifest.open_in_tab">` 保留 `open_in_tab`。
  - 在 `wxt.config.ts` 中手动声明 `icons`、`action.default_icon`，以及内容脚本图片资产的 `web_accessible_resources`（见 design D11）。
  - `utils.getAssetUrl` 改为：在浏览器扩展中返回全局 `chrome.runtime.getURL(asset)`（不静态导入 `webextension-polyfill`），在 Tauri 中原样返回；`LogoWithText` 和 `Settings` 中的图片改用 `?no-inline` 导入；删除 Firefox 的 `assetsInlineLimit` 特例；验证：构建产物中这些图片以文件形式输出、路径与 `web_accessible_resources` 一致，内容脚本中不含它们的 data URL
  - 删除 `vite.config.chromium.ts`、`vite.config.firefox.ts`、`src/browser-extension/manifest.ts`、`@samrum/vite-plugin-web-extension` 及 `src/index.d.ts` 中对它的类型引用；`wxt.config.ts` 加入 `tsconfig.json` 的 `include`。
  - 更新 `package.json` 脚本、`Makefile`、`release.yaml`、`playwright.yml`、`test-build.yaml`（构建命令与上传路径）、e2e fixtures、`e2e/common.ts`（`/popup.html`、`/options.html`）与 `AGENTS.md`；打包产物文件名保持不变。
  - 两个 grep 守卫脚本的路径清单用 `wxt.config.ts` 替换 `src/browser-extension/manifest.ts`，并改为任一路径不存在时失败。
  - 验证：
    - 按 design D11 的语义字段（包括 `icons`、`action.default_icon` 与图片资产的 `web_accessible_resources`）对比迁移前后生成的 Chromium 与 Firefox `manifest.json`，结果一致。
    - `pnpm test:e2e` 在 WXT 构建产物上通过。
    - `pnpm check:no-old-identity` 与 `pnpm check:no-telemetry` 通过；临时把清单中的某个路径改成不存在的路径时，脚本失败。
    - `app-identity` 与 `no-telemetry` 增量规格中的场景逐条核对通过。
- [x] 12.2 按 design D6 改造内容脚本：
  - 入口 `src/entrypoints/content.ts` 用 `defineContentScript` 声明 `matches`、`allFrames`、`matchAboutBlank`，浏览器相关的代码都放在 `main(ctx)` 中；`@/common/i18n` 和渲染模块在 `main(ctx)` 中动态导入，不在入口顶层静态导入。
  - 卡片用 `createShadowRootUi`（`cssInjectionMode: 'ui'`，宿主元素名 `zeroclover-simpleai-translator`）挂载；删除手写的 `getContainer` / shadow root 创建与 CSS 注入代码；`consts.ts` 中的 DOM id 保持不变。
  - 验证：e2e 中显式打开卡片与选中文本不自动打开卡片的用例通过；在 Chromium 和 Firefox 中手动确认：卡片样式（包括设置面板中 CSS module 的样式）正确；卡片的 logo 和设置面板的背景图可见；工具栏图标正常。
- [x] 12.3 `mousedown` / `touchstart` 处理器在卡片不存在时直接返回，不读取设置、不创建容器；验证：e2e 断言未打开卡片时点击页面不会调用 `storage.sync.get`，页面中也不会出现宿主元素
- [x] 12.4 Translator 滚动边缘检测的 `MutationObserver` 改为只观察 Translator 根节点；验证：在 popup 和桌面端，结果区滚动阴影的表现不变（e2e 或手动检查）
- [x] 12.5 升级 vite 8、`@vitejs/plugin-react`、`vite-tsconfig-paths`、vitest 5、jsdom、Playwright 与其余 devDependencies 到最新稳定版；删除 `vite.config.tauri.ts` 与 `vite.config.ts` 中与 `tsconfigPaths()` 重复的 `@` alias；验证：`pnpm test`、`pnpm test:e2e`、`pnpm build-tauri-renderer`、扩展构建全部通过
- [x] 12.6 TypeScript 升级到 6.0.x（typescript-eslint 的上限），eslint 升级到 9.x 最新版并把 `.eslintrc.js` / `.eslintignore` 迁移到 `eslint.config.js`；删除 `eslint-plugin-baseui`、`eslint-plugin-import` 与 `eslint-import-resolver-typescript`；`typescript-eslint`、`eslint-plugin-react`、`eslint-plugin-react-hooks`、`eslint-config-prettier`、`eslint-plugin-prettier`、prettier、lint-staged、simple-git-hooks 升到最新稳定版；在 `validation.md` 中记录 TypeScript 与 eslint 没有用最新大版本的原因；验证：`pnpm lint`、`pnpm exec tsc --noEmit` 通过，pre-commit 钩子能正常运行

## 13. 集成验收

- [x] 13.1 运行完整检查：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test`、`pnpm test:e2e`、`pnpm check:no-telemetry`、`pnpm check:no-old-identity`、扩展构建（Chromium 与 Firefox）、`pnpm build-tauri-no-updater`、`cargo clippy -- -D warnings`、`cargo test`，结果记录到 `validation.md`
- [x] 13.2 记录改动前后的体积对比（内容脚本入口、扩展总包、桌面安装包），以及 `src/` 与 `src-tauri/src` 的行数变化，写入 `validation.md`
- [x] 13.3 运行 `pnpm outdated` 与 `cargo update --dry-run`，确认除 `validation.md` 中已记录原因的依赖外，所有直接依赖都已是最新稳定版
- [x] 13.4 运行 `openspec validate simplify-codebase --strict`，确认通过
