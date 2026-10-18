# Proposal

## Why

翻译结果目前按纯文本逐行显示，模型返回的标题、列表、强调与代码块无法形成可读的排版。用户需要按需切换 Markdown 阅读视图，同时保留原始译文，方便复制到其它工具继续使用。

## What Changes

-   增加默认关闭的 Markdown 渲染偏好，只有显式开启后才解析译文中的 Markdown；关闭时保留现有纯文本显示。
-   在主界面译文底部工具栏最左侧增加 Markdown 图标切换按钮，使用按下背景、图标颜色、状态提示与 `aria-pressed` 表达状态；右侧保留重试、朗读、插入和复制。设置页不重复提供开关。
-   偏好随现有设置持久化，切换即时作用于当前译文和后续译文，不发起翻译请求，也不修改模型提示词、缓存或历史内容。
-   Markdown 视图只消费原始 `translatedText` 字符串；复制按钮始终复制同一字符串为 `text/plain`，保留 Markdown 标记、空白与换行。结构化输出的“原始文本”指现有引擎格式化后交给界面的译文，不是协议 JSON。
-   复用现有 `react-markdown` 支持基础 CommonMark；流式未闭合语法按当前可解析内容显示、不补写原文，并以安全的文本展示方式处理 HTML、图片和链接，避免展示过程执行内容或加载远程资源。

本次交付包含增量规格及其运行时实现与测试。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

-   `translation-core`: 可选 Markdown 阅读视图、结果工具栏切换、流式展示及原始文本复制约束。
-   `settings-surface`: 新增默认关闭的持久化显示偏好，并明确入口位于结果工具栏。

## Impact

-   `src/common/components/Translator.tsx`：显示分支、切换按钮和局部样式；可抽取一个专用结果 Markdown 组件，复用已有 `react-markdown`，不新增依赖。
-   `src/common/types.ts`、`src/common/utils.ts` 与现有 `useSettings`：增加 `renderMarkdown` 偏好及默认值，纳入现有读取、保存和表单合并路径。
-   `src/common/polyfills/userscript.ts`：修正现有存储适配器忽略 `false` 的写入行为，使用户脚本也能记住关闭状态；不新建存储机制。
-   `CopyButton`、历史、缓存、朗读与桌面插入继续使用现有译文字符串；请求协议、Prompt、结构化输出格式与原生后端无需变化。
-   同步六种 locale 的按钮文案；补充设置、展示、复制及流式切换测试，验证 Chrome、Firefox、Tauri 和用户脚本共用界面。
-   与正在编写的 `stream-structured-output` 动议独立：本变更只处理 UI 已收到的文本，不规定引擎何时解析或发出结构化结果。
