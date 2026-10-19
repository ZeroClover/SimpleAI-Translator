## ADDED Requirements

### Requirement: 翻译失败与取消处理

浏览器扩展请求若在首次响应前失去后台连接 SHALL 拒绝请求 Promise；主动取消 SHALL 使用 `AbortError`，其它断开 SHALL 提供可读错误。连接建立失败亦 SHALL 结束请求，不得永久等待。

桌面端流式请求 SHALL 与浏览器扩展使用同一套响应读取语义，并 SHALL 遵循设置中的代理配置。开始前已取消的请求 SHALL 以 `AbortError` 结束且不发起网络请求；在等待响应头或读取正文的任一阶段被取消时，请求 SHALL 立即以 `AbortError` 结束并取消底层 HTTP 请求，之后 SHALL NOT 再上报任何增量。

系统 SHALL 捕获 LLM 调用过程中的网络错误、非 200 状态码、流内错误事件与流解析错误,通过 `onError` 上报可读错误消息并以 `onFinish('error')` 结束;系统 SHALL NOT 静默吞掉错误,除 structured-output 的“Structured Output Streaming Transport Fallback”允许的唯一一次非流式重试外 SHALL NOT 自动重试,SHALL NOT 自动切换到其它 Provider。允许 fallback 的中间能力错误 SHALL NOT 调用 `onError` 或 `onFinish`，但 SHALL 继续报告 `onStatusCode`；fallback 失败时 SHALL 报告最终尝试的错误。三个协议 SHALL 使用同一取值顺序:依次取上游响应体或错误事件中的 `response.error.message`、`error.message`、`message`、`detail`,都取不到时为 `Unknown error`。

界面层 SHALL 按结束原因展示状态:`stop` / `end_turn` / `eos` 视为成功;`length` / `max_tokens` 以"字数超限"toast 提示并保留已输出的译文;`content_filter` 显示 i18n key "The model provider blocked this request with its content filter." 对应的内容过滤提示;界面提示文案 SHALL 全部通过 i18n key 输出;其它原因显示为失败。以失败结束且此前已通过 `onError` 上报错误消息时,界面 SHALL 继续显示该错误消息,SHALL NOT 用 `finish_reason` 之类的通用文本覆盖它;仅在没有收到 `onError` 时才显示包含结束原因的通用失败文本。

#### Scenario: 鉴权失败

-   **WHEN** Provider 返回 401
-   **THEN** 系统 SHALL 通过 `onStatusCode(401)` 上报状态码
-   **AND** SHALL 通过 `onError` 上报上游返回的错误消息(如响应体 `error.message`)
-   **AND** SHALL 调用 `onFinish('error')`

#### Scenario: 三个协议共用错误消息取值顺序

-   **WHEN** OpenAI Chat、OpenAI Responses 或 Anthropic 端点返回 HTTP 400,响应体只有 `{ "detail": "Bad model" }`
-   **THEN** 系统 SHALL 通过 `onError` 上报 `Bad model`
-   **WHEN** 响应体同时含 `response.error.message` 与 `error.message`
-   **THEN** 系统 SHALL 上报 `response.error.message`

#### Scenario: 界面显示可读错误消息

-   **WHEN** 引擎调用 `onError('The model refused to answer (cyber).')`,随后调用 `onFinish('error')`
-   **THEN** 界面 SHALL 显示 `The model refused to answer (cyber).`
-   **AND** SHALL NOT 将其替换为 `Error failed, finish_reason: error` 之类的通用文本

#### Scenario: 网络中断

-   **WHEN** 流式请求中途网络断开
-   **THEN** 系统 SHALL 通过 `onError` 上报错误并调用 `onFinish('error')`
-   **AND** SHALL NOT 自动重试或切换到其它 provider

#### Scenario: 开始前取消桌面请求

- **WHEN** 桌面端流式请求发起前关联的中止信号已触发
- **THEN** 请求 SHALL 以 `AbortError` 结束
- **AND** SHALL NOT 发起对应网络请求

#### Scenario: 等待响应头期间取消桌面请求

- **WHEN** 桌面端请求已发出，但上游尚未返回响应头（连接、握手中，或网关在首个 token 之前不发送响应头），此时用户点击"停止"或请求超时
- **THEN** 请求 SHALL 立即以 `AbortError` 结束，SHALL NOT 等到响应头到达
- **AND** 底层连接 SHALL 立即关闭

#### Scenario: 流式进行中取消桌面请求

- **WHEN** 桌面端已开始接收流式增量，用户点击"停止"
- **THEN** 底层 HTTP 请求 SHALL 被取消
- **AND** 之后 SHALL NOT 再有增量写入结果区

#### Scenario: 服务端暂停发送时取消桌面请求

- **WHEN** 桌面端流式请求已收到部分正文，上游暂时没有发送新数据（例如推理模型仍在思考），此时用户点击"停止"
- **THEN** 底层 HTTP 连接 SHALL 立即关闭，SHALL NOT 等到上游发送下一块数据

#### Scenario: 桌面流式请求使用代理

- **WHEN** 用户在设置中启用代理，随后在桌面端发起流式翻译
- **THEN** 该请求 SHALL 经所配置的代理发出

### Requirement: 结构化响应传输一致性

结构化翻译的 SSE、普通 JSON envelope 和错误体 SHALL 在 Chrome、Firefox 与 Tauri 传输适配中保持一致语义。响应媒体类型 SHALL 在后台/前端桥接后仍可用于格式识别。跨传输块拆分的 UTF-8 字符 SHALL 正确重组，事件 SHALL 按接收顺序消费，异步消费者失败 SHALL 通过受控错误路径结束。非成功响应的错误体 SHALL 完整收集后再用于 fallback 判定；媒体类型及状态码 SHALL 来自实际响应，不根据空输出或 JSON 解析失败推断不支持流式。

#### Scenario: 扩展后台桥接后仍识别 JSON

- **WHEN** Chrome 或 Firefox 的后台收到 JSON 媒体类型的完整结构化响应并转发给前端
- **THEN** 前端 SHALL 在同一次请求中识别并消费该响应，SHALL NOT 因媒体类型丢失而误判为空 SSE 或发起第二次 POST

#### Scenario: 桌面端完整读取普通 JSON

- **WHEN** 桌面端传输返回普通 JSON，且正文跨多个流块
- **THEN** 系统 SHALL 按实际媒体类型读取完整正文并正常校验，SHALL NOT 仅解析首个块

#### Scenario: 非 ASCII 文本跨字节边界

- **WHEN** 中文或 emoji 的 UTF-8 字节横跨两个网络块
- **THEN** 最终 JSON 及译文 SHALL 与未拆分响应一致，SHALL NOT 引入替换字符或解析错误

#### Scenario: 错误体跨多个块

- **WHEN** HTTP 400 的流式能力错误 JSON 被拆为多个网络块
- **THEN** 系统 SHALL 合并完整错误体后判定是否允许 fallback，SHALL NOT 对每个块分别报错或重试

#### Scenario: 异步消费者拒绝

- **WHEN** 接收事件的异步消费者抛出异常
- **THEN** 请求 SHALL 受控失败并结束一次，SHALL NOT 产生未捕获 Promise rejection 或随后报告成功

#### Scenario: JSON 响应缺少合法协议 envelope

- **WHEN** 上游返回 HTTP 200 的普通 JSON，但不包含所选协议的有效响应 envelope
- **THEN** 系统 SHALL 报告响应错误且不缓存结果，SHALL NOT 发起能力 fallback

#### Scenario: 内容前协议能力错误优先分派

- **WHEN** 首个模型内容前收到明确不支持流式的 Chat `error` envelope（无 choices）、Responses `error` / `response.failed`，或 Anthropic `error`
- **THEN** 满足结构化流式 fallback 全部条件时 SHALL 只进行一次非流式重试，SHALL NOT 忽略该错误或先调用终结回调
- **AND** 不满足条件时 SHALL 按原协议错误路径结束，普通非错误空 choices 仍被忽略

## REMOVED Requirements

### Requirement: 翻译失败处理
**Reason**: 其中桌面流式请求的条款绑定在原生 `fetch_stream` 事件监听器的实现上，而该实现已删除；各协议的错误消息取值顺序也已统一。
**Migration**: 由"翻译失败与取消处理"取代。该需求保留全部失败处理语义，并把桌面端取消语义改为与实现无关的描述。

### Requirement: 结构化响应传输完整性
**Reason**: userscript 构建目标已移除，其中的 userscript 传输场景不再适用。
**Migration**: 由"结构化响应传输一致性"取代。该需求覆盖 Chrome、Firefox 与 Tauri，其余语义不变。
