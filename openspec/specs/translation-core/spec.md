# translation-core Specification

## Purpose
TBD - created by archiving change simpleai-translator-rebrand. Update Purpose after archive.
## Requirements
### Requirement: 翻译只能由用户显式触发

翻译流 SHALL 仅在用户**显式**操作下启动:
- 桌面端:在主输入框输入文本后按下回车键、点击翻译按钮、或在历史/重新翻译入口主动触发
- 浏览器扩展弹窗(popup):用户打开 popup 后输入文本并按回车 / 点击翻译按钮
- 浏览器扩展上下文菜单(若实施者保留):用户右键选择"翻译选中文本"

应用 MUST NOT 因以下任一行为自动触发翻译:
- 用户在网页中选中一段文本(无论是否抬起鼠标)
- 用户在网页 input/textarea 中双击或长按选词
- 用户输入文本后停止输入超过任何阈值(即不存在"输入 debounce 后自动翻译"分支)
- 应用启动 / 窗口获焦 / 剪贴板内容变化 / 设置打开后还原

实现层面:`Translator.tsx` SHALL NOT 读取 `settings.autoTranslate` 字段(因其已被删除;当前若无读取则无需改动);浏览器扩展 content script SHALL NOT 读取 `settings.autoTranslate`、`settings.selectInputElementsText` 或 `settings.alwaysShowIcons`(因其已被删除)。

#### Scenario: 网页选词不触发翻译

- **WHEN** 用户在浏览器宿主页面选中一段文本
- **THEN** SimpleAI Translator 浏览器扩展 SHALL NOT 自动发起翻译请求
- **AND** 浏览器扩展 SHALL NOT 显示浮动图标或浮动翻译卡片

#### Scenario: 输入后停顿不触发翻译

- **WHEN** 用户在主翻译输入框输入文本然后停止输入 5 秒以上,且未按回车也未点击翻译按钮
- **THEN** 系统 SHALL NOT 调用 `translate(...)`
- **AND** 翻译结果区 SHALL 保持未翻译状态

#### Scenario: 显式回车触发

- **WHEN** 用户在主输入框输入非空文本并按下回车
- **THEN** 系统 SHALL 调用 `translate({ text, ... })`(行为细节见 `translation-core` 主 spec 的"翻译输入与输出"需求)

#### Scenario: 显式点击翻译按钮触发

- **WHEN** 用户点击翻译按钮
- **THEN** 系统 SHALL 调用 `translate({ text, ... })`

#### Scenario: 应用启动不自动翻译剪贴板

- **WHEN** 用户启动 SimpleAI Translator 桌面端,且系统剪贴板中存在文本
- **THEN** 系统 SHALL NOT 自动把剪贴板文本填入翻译输入并触发翻译
- **AND** 即使主输入框被预填充,翻译 SHALL 仍仅在用户显式按下回车或点击翻译按钮后启动

