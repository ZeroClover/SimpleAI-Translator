# Spec Delta

## ADDED Requirements

### Requirement: 可选 Markdown 译文阅读视图

结果区 SHALL 仅在 Markdown 渲染偏好开启时解析译文中的 Markdown；默认关闭时 SHALL 沿用纯文本显示并保留可见的 Markdown 标记。开启后 SHALL 支持基础 CommonMark 的标题、段落、强调、有序/无序列表、引用、行内代码、围栏/缩进代码块和分隔线；段落内单换行 SHALL 保持可见，代码块 SHALL 保留空白。GFM 表格、删除线、任务列表、公式、图表与代码高亮不属于本次支持范围。

显示切换 SHALL 仅改变结果的视觉呈现，SHALL NOT 改写译文、提示词或请求参数，SHALL NOT 发起、重试或取消翻译，SHALL NOT 清空结果、改变缓存 key 或创建/更新历史。输入区、错误消息、历史列表预览 SHALL 保持原有显示；缓存命中或历史恢复到结果区的文本 SHALL 按当前偏好显示。

#### Scenario: 默认保留原文标记

-   **WHEN** Markdown 渲染未开启且译文包含 `# 标题`、`**重点**`、列表与代码围栏
-   **THEN** 结果区 SHALL 将这些标记作为纯文本显示
-   **AND** SHALL NOT 创建对应的 Markdown 标题、强调、列表或代码块结构

#### Scenario: 即时开启与关闭

-   **WHEN** 用户对已有译文开启 Markdown 渲染，然后关闭
-   **THEN** 结果区 SHALL 先呈现支持的 Markdown 结构，再恢复原始文本视图
-   **AND** 两次切换 SHALL NOT 发起翻译、修改译文或写入翻译历史

#### Scenario: 普通文字与单换行

-   **WHEN** 已开启 Markdown 渲染，译文是含单换行的普通多行文字
-   **THEN** 文字 SHALL 保持可读，单换行 SHALL 仍产生可见换行

#### Scenario: 结构化输出独立于显示偏好

-   **WHEN** 引擎将有效结构化输出转换为可读译文后交给结果区
-   **THEN** 结果区 SHALL 按当前 Markdown 偏好显示该译文
-   **AND** SHALL NOT 将协议 JSON 当作 Markdown 输入，也不因 Markdown 偏好改变结构化输出开关或格式化结果

#### Scenario: 恢复或复用结果

-   **WHEN** 用户从历史恢复一条译文，或一次正常提交命中缓存
-   **THEN** 结果区 SHALL 按当前 Markdown 偏好显示存储的原始译文
-   **AND** Markdown 显示 SHALL NOT 额外发起请求或改变历史/缓存的内容格式

#### Scenario: 历史模型不同于默认模型

-   **WHEN** 持久化默认模型为 A，用户恢复模型 B 的历史记录后切换 Markdown
-   **THEN** 当前模型 SHALL 仍为 B，原始译文 SHALL 保持不变
-   **AND** 请求数和历史记录数 SHALL 不增加，SHALL NOT 因保存显示偏好重新应用默认模型 A

### Requirement: 结果工具栏 Markdown 切换

Markdown 控件 SHALL 位于主界面译文底部工具栏最左侧，与右侧重试、朗读、桌面插入和复制操作之间保留弹性空白；设置页 SHALL NOT 重复提供该控件。控件 SHALL 为可按下的图标按钮，SHALL 提供持续的选中背景或边框及图标状态、`aria-pressed`、可访问名称、可见键盘焦点，以及说明当前状态和点击后操作的本地化 tooltip，SHALL NOT 仅用颜色区分状态。

按钮 SHALL 在非空译文出现时显示，包括流式加载和保留部分结果的停止/错误状态；无译文时 SHALL 随结果工具栏隐藏。按钮 SHALL 至少具有 28×28 CSS px 点击区，在紧凑窗口下仍可操作且不挤出复制按钮；工具栏换行 SHALL 保持 Markdown 在前、结果操作在后的逻辑顺序。

#### Scenario: 主界面可直接切换

-   **WHEN** 用户查看非空译文
-   **THEN** 用户 SHALL 能从结果工具栏最左侧切换 Markdown，不必打开设置
-   **AND** 关闭态与开启态 SHALL 分别报告 `aria-pressed=false` 与 `aria-pressed=true`

#### Scenario: 键盘切换

-   **WHEN** 用户通过 Tab 聚焦 Markdown 按钮并按 Enter 或 Space
-   **THEN** 系统 SHALL 切换渲染状态并保留按钮焦点
-   **AND** SHALL NOT 提交输入或发起翻译

#### Scenario: 窄窗口与主题

-   **WHEN** 用户在最小受支持窗口宽度下使用亮色或暗色主题
-   **THEN** 按钮状态和焦点 SHALL 可辨认，Markdown 与复制按钮 SHALL 均可达
-   **AND** 工具栏 SHALL NOT 产生水平溢出

### Requirement: Markdown 显示安全与布局

译文中的原始 HTML SHALL 作为文字显示，SHALL NOT 解释为可执行 DOM；Markdown 链接 SHALL 只显示非交互标签文字，图片 SHALL 只显示 alt 文字（无 alt 时不显示）。显示过程 SHALL NOT 创建可导航链接、实际图片、嵌入式内容或执行脚本，SHALL NOT 因译文中的地址发起网络/本地资源访问或 native shell 调用。

Markdown 排版 SHALL 继承结果区的主题、字号和语言方向；长代码块 SHALL 可在自身区域内横向滚动，长文本 SHALL 不撑宽应用窗口。

#### Scenario: 不执行主动内容

-   **WHEN** 译文含 HTML 标签、脚本、带事件处理器的图片、Markdown 图片，或指向 `https:`、`javascript:`、`data:`、`file:` 地址的链接
-   **THEN** HTML SHALL 作为文字显示，Markdown 链接和图片 SHALL 按标签/alt 文字显示
-   **AND** 展示与点击这些文字 SHALL NOT 执行脚本、导航、加载资源或调用 native shell
-   **AND** 复制原文 SHALL 仍保留这些原始标记

#### Scenario: 长代码与排版继承

-   **WHEN** 已开启 Markdown，译文含长代码行、嵌套列表和引用，用户切换主题或字号
-   **THEN** 内容 SHALL 使用结果区的主题和字号，列表与引用 SHALL 有可辨认的结构
-   **AND** 代码 SHALL 可局部滚动且窗口 SHALL 不被撑宽

### Requirement: 流式 Markdown 展示不改变请求生命周期

Markdown 阅读视图 SHALL 随现有文本刷新节奏更新，并在收到完整文本替换或请求结束时显示最新文本。未闭合语法 SHALL 按当前可解析内容显示，SHALL NOT 阻塞后续更新、补写原文或导致未捕获异常。加载指示 SHALL 与译文数据分离。

#### Scenario: 跨增量代码围栏与强调

-   **WHEN** 围栏代码块或强调语法跨多个文本增量到达
-   **THEN** 结果区 SHALL 随每次合并刷新显示当前内容，并在语法补全后更新排版
-   **AND** 原始译文 SHALL 仅由收到的文本组成，不加入自动补齐符号或加载光标字符

#### Scenario: 流式期间反复切换

-   **WHEN** 当前翻译已显示部分文本，用户在输出期间反复开启和关闭 Markdown
-   **THEN** 同一请求 SHALL 继续输出，已接收内容和后续内容 SHALL 不丢失、不重复
-   **AND** 请求数 SHALL 不增加，当前请求 SHALL 不被取消，结束后的原文 SHALL 与未切换时相同

#### Scenario: 停止或失败后保留原文

-   **WHEN** 请求停止或失败且结果区保留部分译文
-   **THEN** 用户 SHALL 仍可切换显示与复制当前原文
-   **AND** 显示切换 SHALL NOT 将部分译文写入成功缓存或历史

## MODIFIED Requirements

### Requirement: 翻译结果操作

系统 SHALL 在结果区提供:Markdown 显示切换、重试、朗读译文、复制译文;桌面端另提供"插入到之前的输入框"。源文本区 SHALL 提供朗读、复制与清空输入(同时清空译文)。界面 SHALL 提供历史记录入口。系统 MUST NOT 提供"加入生词本"、"创建 Action"、"再润色一遍"等入口。

复制译文 SHALL 始终将当前原始译文字符串以 `text/plain` 写入剪贴板，保留全部 Markdown 标记、空白、换行与代码围栏，SHALL NOT 从渲染后的 DOM 提取文本、复制 HTML 或额外裁剪原文。“原始译文”指现有翻译管线交给界面的文本（结构化输出时为格式化后的可读文本），不是协议 JSON 或未经处理的模型响应。朗读、桌面插入、语言互换、缓存与历史 SHALL 继续消费该字符串，不消费 Markdown 渲染结果。

#### Scenario: 复制翻译结果

-   **WHEN** 用户点击译文旁的复制按钮，无论 Markdown 渲染开启或关闭
-   **THEN** 系统 SHALL 把当前原始译文以 `text/plain` 写入剪贴板，内容与原字符串完全相同
-   **AND** SHALL 通过 toast 给出反馈

#### Scenario: 流式期间复制

-   **WHEN** 翻译仍在输出，用户点击复制按钮
-   **THEN** 系统 SHALL 复制当前已刷新到界面的原始译文字符串，包括尚未闭合的 Markdown 标记
-   **AND** SHALL NOT 复制加载指示或渲染后的文本

#### Scenario: 朗读源文本与翻译结果

-   **WHEN** 用户点击源文本/翻译结果旁的朗读按钮
-   **THEN** 系统 SHALL 调用 TTS 子系统以对应语言朗读对应文本(详见 text-to-speech spec)

#### Scenario: 重试绕过缓存

-   **WHEN** 翻译结束后用户点击"重试"
-   **THEN** 系统 SHALL 以上一次提交的文本、语言与模型重新调用 `translate`
-   **AND** SHALL NOT 命中此前的翻译缓存

#### Scenario: 历史记录入口

-   **WHEN** 用户点击历史按钮
-   **THEN** 系统 SHALL 显示按 `createdAt` 倒序排列的翻译历史,支持搜索
-   **AND** 每条历史 SHALL 显示时间、模型名、源文本与译文,并提供恢复、复制译文与删除操作
-   **AND** 历史面板 SHALL 提供清空全部历史的操作(需用户确认)

#### Scenario: 从历史恢复

-   **WHEN** 用户在历史面板中恢复一条记录
-   **THEN** 系统 SHALL 回填源文本、译文、源/目标语言
-   **AND** 若该记录的 providerId 仍存在,SHALL 选中该 Provider 与记录中的模型
-   **AND** SHALL NOT 发起新的翻译请求
