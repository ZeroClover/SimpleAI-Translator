# Tasks

行为验收以两个增量规格为准。

## 1. 显示偏好与请求隔离

-   [x] 1.1 在 `ISettings`、已知设置 key、归一化和保存路径中增加 `renderMarkdown`；修正用户脚本存储适配器，使其只跳过 undefined、保存其余值并等待全部写入。补充设置和用户脚本存储测试，验证缺失/非布尔 true 默认关闭、true/false 读写往返、null/0/空字符串写入及保存完成后重开保持关闭。
-   [x] 1.2 将 `Translator.tsx` 翻译回调对整个 settings 的依赖收窄到请求实际使用的 Provider/Model 与输出控制，并限制 settings 同步 selectedModel 的 effect 只响应真正影响默认模型选择的值变化；在现有受控流 e2e mock 暴露 AbortSignal 状态，验证显示偏好不增加请求、不 abort、不重置当前模型，同时提交、模型切换和重试仍按现有语义执行。
-   [x] 1.3 在设置页 onSubmit 与失焦保存路径保留当前存储中的 renderMarkdown，测试旧表单快照保存其它字段时不覆盖偏好；核对实现与 `settings-surface` 增量规格一致，确认没有重复开关或 ProviderModelOutputControls 字段，通过相关测试与类型检查。

## 2. Markdown 展示与工具栏

-   [x] 2.1 复用现有 `react-markdown` 增加专用结果展示分支，关闭时沿用逐行纯文本；补充渲染测试，验证支持的 CommonMark 结构、纯文本关闭态、段落单换行、代码空白、原始 HTML 转义、链接标签和图片 alt 文本，且无主动资源加载或导航元素。
-   [x] 2.2 添加限定于 Markdown 结果的主题/字号/语言方向与溢出样式，将加载指示置于 Markdown 数据之外；用长代码、长单词、嵌套列表、引用及 RTL 文本验证亮暗主题和局部滚动，确认不影响其它界面样式。
-   [x] 2.3 在结果底部工具栏最左侧接入 Markdown 图标按钮及现有设置持久化，完成选中态、`aria-pressed`、名称、tooltip、键盘与焦点行为，并同步六种 locale；e2e 验证空结果隐藏、非空/加载/部分错误结果可切换、28×28 点击区和窄窗口复制可达，locale key 对齐测试通过。
-   [x] 2.4 保持原始 `translatedText` 的复制/朗读/插入/互换/缓存/历史数据流；以包含标题、强调、换行、空白与围栏的固定译文在开关两态验证实际剪贴板 `text/plain` 与原文完全相同，确认未新增 HTML 或 DOM 文本复制路径。
-   [x] 2.5 扩展受控流 e2e，验证未闭合强调/围栏跨增量到达、流中反复切换、完整文本替换、结束时尾部刷新、停止/失败后切换与复制；断言无额外请求、无丢字/重复、无光标混入原文、失败部分结果不进入成功缓存或历史。
-   [x] 2.6 扩展现有 e2e 配置 mock 以保存并回读实际设置写入，验证重新打开后保持选择、设置页保存其它字段不重置、缓存命中/历史恢复采用当前偏好，以及结构化输出开关与 Markdown 开关的四种组合；明确覆盖“默认 A → 恢复 B 的历史 → 切换 Markdown”，断言仍选中 B、原文不变、请求和历史记录不增加。核对实现与 `translation-core` 增量规格一致并保留现有结果操作场景。

## 3. 集成验收

-   [x] 3.1 运行 `pnpm test`、`pnpm test:e2e`、`pnpm lint` 与 `pnpm exec tsc --noEmit`，记录结果；结合新增 UI 用例确认流式切换不会触发翻译生命周期。
-   [x] 3.2 构建并在 Chrome、Firefox、Tauri 和用户脚本共享翻译界面核对开关、复制、开启后重开以及关闭后重开持久化、窄窗口/亮暗主题；使用 mock 译文避免依赖真实模型生成 Markdown，记录平台覆盖与不可执行项。
-   [x] 3.3 检查最终 diff 无新增渲染依赖、Prompt/协议/JSON schema 变更或无关改动，运行 `openspec validate add-markdown-result-rendering --strict`，确认规格、设计、任务与实现一致后再完成归档。

## 验证记录

-   `pnpm test`：20 个文件、451 项通过（含 `MarkdownResult.spec.tsx`、设置归一化与用户脚本存储新增用例）。
-   `pnpm test:e2e`：34 项通过。新增用例覆盖流式切换（请求数、AbortSignal 未中止、完整替换与尾部刷新）、开关两态剪贴板 `text/plain` 原文、停止/失败后切换与复制、持久化与设置页提交/失焦保存、缓存命中/历史恢复（默认 A → 恢复 B）、重试与模型切换、540px 最小窗口与暗色主题、RTL 方向、结构化输出 × Markdown 四种组合。
-   `pnpm lint`、`pnpm exec tsc --noEmit`：通过。
-   构建：`pnpm build-browser-extension`（Chromium、Firefox）、`pnpm build-userscript`、`pnpm build-tauri-renderer` 均成功。
-   平台覆盖：Chrome 使用构建产物加载扩展弹窗，以 mock 的 OpenAI 端点核对切换、复制、开启后重开与关闭后重开保持；Tauri 渲染端通过 mock IPC 的 e2e 核对（含配置文件写入后重载）；用户脚本通过存储适配器单测核对 `false` 写入与重开保持关闭。
-   不可执行项：Firefox 扩展与用户脚本管理器无法在 Playwright 中加载，仅核对构建产物；未启动原生 Tauri 应用窗口。
