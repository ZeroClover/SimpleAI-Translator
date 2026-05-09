## ADDED Requirements

### Requirement: 单一翻译模式

系统 SHALL 仅提供一种文本处理模式 —— 翻译(`translate`)。系统 MUST NOT 暴露 `polishing` / `summarize` / `analyze` / `explain-code` / `big-bang` / `writing` 等任何替代模式或自定义动作(Action),无论作为 UI 入口、API 参数还是内部分支。

#### Scenario: 翻译查询不接受模式参数

- **WHEN** 任意调用方调用 `translate(query)`
- **THEN** `query` 类型 NOT contain `mode` 字段、NOT contain `articlePrompt` 字段、NOT contain `writing` 字段
- **AND** 编译期 TypeScript 类型检查 SHALL 拒绝带有这些字段的调用

#### Scenario: 旧模式入口已移除

- **WHEN** 用户打开主界面
- **THEN** 界面 SHALL NOT 显示"润色/总结/分析/解释代码/写作/Action 管理"中的任何按钮、菜单、设置项或快捷键
- **AND** 全局快捷键中 SHALL NOT 注册 OCR、写作、写作换行 等热键

### Requirement: 翻译输入与输出

系统 SHALL 接受一段源文本与一组语言参数(源语言、目标语言),通过当前选定的 LLM Provider 配置发起请求,并以流式方式逐增量回写翻译结果。

#### Scenario: 普通文本翻译

- **WHEN** 用户在主输入框输入一段非空文本并触发翻译(回车或点击翻译按钮)
- **THEN** 系统 SHALL 调用 `translate({ text, detectFrom, detectTo, signal, onMessage, onError, onFinish })`
- **AND** 流式 chunk 抵达时 SHALL 通过 `onMessage` 实时回写到结果区
- **AND** 流结束时 SHALL 调用 `onFinish('stop')`

#### Scenario: 用户中断翻译

- **WHEN** 翻译进行中用户点击"停止"按钮或关闭窗口
- **THEN** 系统 SHALL 调用关联 `AbortController.abort()`
- **AND** 当前 LLM 请求 SHALL 被取消
- **AND** `onFinish` SHALL 以 `'aborted'` 或同义原因被调用

#### Scenario: 源语言检测失败时使用 auto

- **WHEN** `detectFrom` 为空或检测失败
- **THEN** 系统 SHALL 把源语言以"自动检测"方式传给 LLM(prompt 中说明)
- **AND** 翻译 SHALL 仍能完成,不抛异常

### Requirement: 单词模式富信息

系统 SHALL 当输入文本被识别为目标语言或源语言中的单一单词/字时,以"单词模式"调用翻译 prompt,使输出包含发音、释义、词性、例句等富信息。

#### Scenario: 输入是英文单词

- **WHEN** 用户输入 `hello`,源语言识别为英语
- **THEN** `isAWord('en', 'hello')` SHALL 返回 true
- **AND** 系统 SHALL 在 prompt 中切换到"单词翻译"模板
- **AND** 输出 SHALL 包含发音/释义/例句章节

#### Scenario: 输入是多词短语

- **WHEN** 用户输入 `how are you`
- **THEN** `isAWord` SHALL 返回 false
- **AND** 系统 SHALL 走普通句子翻译路径

### Requirement: 翻译结果操作

系统 SHALL 在翻译完成后允许用户对结果执行:复制、朗读、查看历史、清空。系统 MUST NOT 提供"加入生词本"、"创建 Action"、"再润色一遍"等已被移除功能的入口。

#### Scenario: 复制翻译结果

- **WHEN** 用户点击复制按钮
- **THEN** 系统 SHALL 把当前翻译结果文本写入剪贴板
- **AND** SHALL 通过 toast 给出反馈

#### Scenario: 朗读源文本与翻译结果

- **WHEN** 用户点击源文本/翻译结果旁的朗读按钮
- **THEN** 系统 SHALL 调用 TTS 子系统朗读对应文本(详见 text-to-speech spec)

#### Scenario: 历史记录入口仍可用

- **WHEN** 用户点击历史按钮
- **THEN** 系统 SHALL 显示按时间倒序排列的翻译历史
- **AND** 每条历史 SHALL 显示源文本、译文、源/目标语言、使用的 provider 名称与模型

### Requirement: 翻译历史记录

系统 SHALL 在每次翻译成功后记录一条 history 条目,字段限于 `id / createdAt / fromLang / toLang / sourceText / translatedText / providerId / model`,并 MUST NOT 包含 actionName、vocabulary、ocr、writing 等已删除概念的字段。

#### Scenario: 翻译完成写入历史

- **WHEN** `translate` 调用成功结束(`onFinish('stop')`)
- **THEN** 系统 SHALL 持久化一条 HistoryItem 到 IndexedDB
- **AND** HistoryItem.providerId SHALL 等于本次使用的 ProviderConfig.id
- **AND** HistoryItem.model SHALL 等于本次使用的模型名

#### Scenario: 翻译被中断不写入历史

- **WHEN** 翻译被用户中断或抛出错误
- **THEN** 系统 SHALL NOT 创建 HistoryItem

### Requirement: 翻译失败处理

系统 SHALL 捕获 LLM 调用过程中的网络错误、4xx/5xx 状态码、流解析错误,并通过 `onError` 上报可读错误消息;NOT 静默吞掉错误,NOT 自动切换到其它 Provider。

#### Scenario: 鉴权失败

- **WHEN** Provider 返回 401
- **THEN** 系统 SHALL 通过 `onStatusCode(401)` 上报
- **AND** 通过 `onError` 提供"鉴权失败,请检查 API Key"等可读错误消息

#### Scenario: 网络中断

- **WHEN** 流式请求中途网络断开
- **THEN** 系统 SHALL 通过 `onError` 上报错误
- **AND** SHALL NOT 自动重试到其它 provider

### Requirement: 远程 Promotion 系统移除

系统 SHALL 完全移除远程 Promotion / 推广 / 公告 / API Key 提示位系统。系统 MUST NOT 拉取远程 `promotions.json`,MUST NOT 在主界面或设置页显示 promotion banner、未读提示点、disclaimer promotion 弹窗或 promotion 文档链接,MUST NOT 存储 promotion showed / never_display 状态,MUST NOT 上报 promotion view/click 统计事件。

#### Scenario: 不再拉取 promotions JSON

- **WHEN** 应用启动、打开主界面或打开设置页
- **THEN** 系统 SHALL NOT 请求 `nextai-translator-configs/main/promotions.json`
- **AND** SHALL NOT 调用任何 `fetchPromotions` 等价函数

#### Scenario: 设置页无 promotion UI

- **WHEN** 用户打开设置页
- **THEN** 设置页 SHALL NOT 显示 header promotion、OpenAI API Key promotion、promotion 未读提示点或 promotion disclaimer 弹窗

#### Scenario: promotion 存储 key 已移除

- **WHEN** 在代码库中检索 `promotion:`、`optionsPageOpenaiAPIKeyPromotionIDKey`、`optionsPageHeaderPromotionIDKey`、`promotion_view`、`promotion_clicked`
- **THEN** SHALL NOT 存在运行时代码引用

### Requirement: OpenAI Chat Completions 翻译协议

系统 SHALL 在 `provider.protocol === 'openai-chat'` 时调用 OpenAI Chat Completions 兼容协议。请求 SHALL 发往 `{endpoint}/chat/completions`,使用 `Authorization: Bearer <apiKey>` 与 `Content-Type: application/json`,请求体 SHALL 包含 `model`、翻译 prompt 组成的 `messages`、`stream: true`。系统 SHALL 从 SSE `data:` 行解析 JSON chunk,把 `choices[].delta.content` 中的文本增量传给 `onMessage`,忽略没有文本增量的 usage/metadata chunk,并在收到 `data: [DONE]` 或 `finish_reason` 时结束。

#### Scenario: Chat Completions 文本增量

- **WHEN** 上游返回 SSE `data: {"choices":[{"delta":{"content":"你"}}]}`
- **THEN** 系统 SHALL 调用 `onMessage("你")`

#### Scenario: Chat Completions DONE

- **WHEN** 上游返回 `data: [DONE]`
- **THEN** 系统 SHALL 调用 `onFinish('stop')`

#### Scenario: Chat Completions 空 choices chunk

- **WHEN** 上游因 `stream_options.include_usage` 返回 `choices: []` 的 usage chunk
- **THEN** 系统 SHALL 忽略该 chunk 的文本输出
- **AND** SHALL NOT 抛出流解析错误

### Requirement: OpenAI Responses 翻译协议

系统 SHALL 在 `provider.protocol === 'openai-responses'` 时调用 OpenAI Responses API。请求 SHALL 发往 `{endpoint}/responses`,使用 `Authorization: Bearer <apiKey>` 与 `Content-Type: application/json`,请求体 SHALL 包含 `model`、翻译输入/指令、`stream: true`。系统 SHALL 从 SSE event/data 解析 Responses 流事件,把 `response.output_text.delta` 的 `delta` 文本传给 `onMessage`,在 `response.completed` 时结束,在 `response.failed` / `response.incomplete` / `error` 事件时走错误路径。

#### Scenario: Responses 文本增量

- **WHEN** 上游返回 event `response.output_text.delta` 且 data 中 `delta === "好"`
- **THEN** 系统 SHALL 调用 `onMessage("好")`

#### Scenario: Responses 完成事件

- **WHEN** 上游返回 event `response.completed`
- **THEN** 系统 SHALL 调用 `onFinish('stop')`

#### Scenario: Responses 错误事件

- **WHEN** 上游返回 event `error` 或 `response.failed`
- **THEN** 系统 SHALL 调用 `onError` 并恢复 UI 非翻译状态

### Requirement: Anthropic Messages 翻译协议

系统 SHALL 在 `provider.protocol === 'anthropic'` 时调用 Anthropic Messages API。请求 SHALL 发往 `{endpoint}/v1/messages`,使用 `x-api-key: <apiKey>`、`anthropic-version: 2023-06-01` 与 `Content-Type: application/json`,请求体 SHALL 包含 `model`、`max_tokens`、翻译 prompt 组成的 `messages`、`stream: true`。系统 SHALL 从 SSE 解析 `content_block_delta` 事件,仅把 `delta.type === 'text_delta'` 的 `delta.text` 传给 `onMessage`,忽略 `ping`、thinking/tool delta 与未知事件,在 `message_stop` 时结束,在 `error` event 时走错误路径。

#### Scenario: Anthropic 文本增量

- **WHEN** 上游返回 event `content_block_delta` 且 data 中 `delta: { type: 'text_delta', text: '好' }`
- **THEN** 系统 SHALL 调用 `onMessage("好")`

#### Scenario: Anthropic ping 忽略

- **WHEN** 上游返回 event `ping`
- **THEN** 系统 SHALL 不修改翻译结果
- **AND** SHALL NOT 抛出流解析错误

#### Scenario: Anthropic 完成事件

- **WHEN** 上游返回 event `message_stop`
- **THEN** 系统 SHALL 调用 `onFinish('stop')`
