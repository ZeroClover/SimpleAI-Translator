# Design

## Context

见 `proposal.md` 的动机。三个 Engine 都请求 SSE，但各自维护 `structuredContent`，只在 `finish` 中调用 `formatStructuredOutput`。该函数当前只做 `JSON.parse`、句子的非空 `translatedText` 和短词组的非空 `options` 检查，不是 JSON Schema 验证器；单词字段缺失时仍可渲染。

`Translator.tsx` 已支持 `isFullText` 替换，只有成功结束才缓存和保存历史。`fetchSSE` 当前没有普通响应分流，`eventsource-parser` 不等待异步回调，桌面错误体可能被拆成多个 chunk；浏览器每个 chunk 新建 TextDecoder，Rust 每块调用 `from_utf8_lossy`，均不能保证跨块 UTF-8 正确。这些问题会影响 JSON 校验、fallback 判定与最终文本提交，需要在本次路径上解决。

官方文档确认结构化输出可以流式传输；严格约束也不覆盖所有拒答和截断结果：[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs#streaming)、[Anthropic Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs#invalid-outputs)。这是继续使用流式并保留终态检查的依据，不建立供应商能力名单。

## Goals / Non-Goals

**Goals:** 将同一逻辑翻译组织成“流式尝试 → 必要时一次非流式尝试 → 一次终结”，让三种输出模式在生成过程中展示可读文本，且成功结果只能来自完整原文的最终校验。

**Non-Goals:** 不改 schema 和 prompt，不切换模型或供应商，不自动降为非结构化模式，不自动修复 JSON；不新增设置、能力探测请求、能力缓存或全量 schema 校验器。这里的传输 fallback 是用户要求的新行为，不保留废弃引擎或旧配置兼容层。

## Decisions

### 1. 预览和最终校验使用不同路径

在现有 `engines/interfaces.ts` 收拢三个协议重复的结构化累积/格式化逻辑，保持协议目录现有边界。每次请求持有过滤后的完整原始文本、最近一次预览和终态；调用方只接收纯文本快照。

- 继续先经过 `ThinkingFilter`，不改变其已有语义；每次收到正文后保留原始过滤结果。
- 复用已安装的 `best-effort-json-parser`，仅从累积文本构建临时预览对象。已查阅其 README、类型与 `src/parse.ts`：支持开放对象/数组/字符串，但未完成的反斜杠或 Unicode 转义可能抛错；此时保持上一预览并等待后续字符。不用正则提取 JSON，不自行补齐字符串或使用 `eval`。
- 宽容解析成功也可能产生尚未配对的高位代理项，例如输入停在 `\uD83D` 时。预览字段在格式化前暂不展示尾部未配对的高位代理项，等待低位代理项到达后再显示完整字符；不修改原文或最终 JSON 校验规则。不能仅依赖解析器是否抛错判断字符完整性。
- 拆分“对象到文本”的格式化与“完整 JSON 解析”，共享既有排版。预览只读取实际出现且类型可用的字段，缺失内容跳过；开放字符串可展示已解码前缀，嵌套数组逐项展示，不出现空 `[]`、空编号或原始 JSON。句子在 `translatedText` 尚未闭合时即可显示内容；单词和短词组不等待整个对象结束。字段顺序任意，后到字段导致排版变化时用整段快照替换。
- 宽容解析结果永远不回写原始缓冲区。解析失败的预览不是请求失败；最终以原始缓冲区执行严格 `JSON.parse`，绝不拿“修补过的预览对象”验收。
- 只发送有变化的非空预览 `onMessage({ content, role: 'assistant', isFullText: true })`；合法最终结果必须在终结前提交，即使与最后预览相同。

共享格式化顺便消除缺失单词字段时现有的空 `[]` 占位：语种和音标均有值时为 `[language] · /phonetics/`，只有语种为 `[language]`，只有音标为 `/phonetics/`，均无值则整行省略。其余完整字段排版不变。单词对象允许缺失字段，短词组选项也可能没有可渲染内容，因此合法最终文本可能为空；最终空快照必须清空先前预览，不写缓存/历史，不能被 UI 的 `if (!message.content)` 提前忽略。非空限制只适用于临时预览。

替代方案：只缓冲 SSE 无法改善首字等待；直接展示 JSON 违背现有 UI 契约；引入全套供应商 SDK/新解析器对当前三个固定模式没有必要。现有宽容解析器无法判定完整性，所以严格终态解析必不可少。

### 2. strict 是服务端生成约束，不是本地校验开关

流式和非流式、strict 开关两种状态均执行相同终态检查：

1. 先处理拒答/上游错误；这些结果不尝试当正常 JSON 输出。
2. 对过滤后的完整文本执行 `JSON.parse`，只接受非 null、非数组的对象。
3. 保留既有内容要求：句子必须有非空字符串 `translatedText`；短词组必须有非空 `options`。单词模式不新加完整字段必填要求，缺失字段仍跳过。
4. 格式化保留既有 `readString` 的宽容性：非核心文本字段不是非空字符串就视为缺失，不强转为译文，不升级为整条请求失败；可选集合不是数组也视为缺失。遍历数组时安全跳过非对象成员（含 null），对象成员中不可用的字段也跳过，不对每个字段重做 schema 类型/nullable 校验。这些类型判断只用于安全投影，不是验证失败条件；短词组的顶层非空 `options` 要求仍保留，但其成员均不可用时允许空最终文本，按空快照规则处理。额外属性忽略，不执行全量 `required`/`additionalProperties` 等 schema 约束；短词组仍最多显示三项，兼容 Anthropic 在发送时移除数组数量限制的既有规则。

该检查明确是 JSON 完整性、根对象与既有核心内容校验，不声称再次执行服务端 JSON Schema。保留它的原因是数据来自可自定义的远端、过滤器会处理正文、流可能截断，而且非空译文等业务要求并非 schema 的字符串类型本身能保证。逐字段收紧或全量本地 schema 校验会改变既有宽容行为，当前流式需求不需要；unexpected 格式化异常仍统一转成受控错误，不产生未捕获 rejection。

校验失败通过一次 `onError` 和一次 `onFinished('error')` 结束，不自动重试或修复。已显示的预览保留并显示失败状态，不进入缓存或历史。用户取消不执行终态解析，直接 `aborted`。截断时仍校验：不完整 JSON 为 `error`；若 JSON 完整合法，提交最终格式化文本但保留 `length` / `max_tokens` 结束原因，不算成功。

### 3. fallback 只解决明确的流式能力拒绝

所有结构化请求先 `stream: true`。每次逻辑请求最多两次 POST，没有跨请求能力记忆。

触发条件必须同时满足：尚未取消、没有重试过、没有收到任何模型正文/拒答/推理内容，并且完整的上游错误证据明确表示“不支持 stream=true”或“不支持结构化输出与流式组合”。允许 HTTP 400/422/501 的明确能力拒绝，或在任何模型内容前收到的协议错误事件表达同样事实。HTTP 状态或包含单词 `stream` 本身均不充分。

协议错误必须先于常规事件分派判断：Chat 的 `error` envelope 不属于可忽略的空 choices chunk；Responses 的 `error` / `response.failed` 和 Anthropic 的 `error` 先判断上述唯一 fallback 例外，只有不满足时才走终态错误路径。这一规则优先于协议规范中的通用“忽略空 choices / 错误事件结束”规则。

判定优先使用结构化错误参数/代码（例如 `param: 'stream'` 加 `unsupported_value`），其次仅接受明确否定流式能力的错误消息，例如 “Streaming is not supported with response_format json_schema”。使用这些作为测试例子，不将某家供应商固定错误字符串作为唯一支持条件。`Invalid stream payload`、不支持 `response_format` 本身、未知 schema、401/403、404、429、5xx 通用故障、超时、连接错误、解析错误、拒答、截断、正文开始后的任何错误均不触发。

先完整结束并清理第一次传输，再以同一 endpoint、模型、headers、prompt/nonce、schema、strict、thinking/effort、token 限额、Responses `store: false` 与取消信号重新请求，仅把 `stream` 改成 false。中间能力错误可经 `onStatusCode` 报告状态码，但不调用 UI 的 `onError`/`onFinished`；fallback 的成功/失败才终结逻辑请求。第二次失败直接报错，不做第三次请求，不降低其它约束；供应商对非流式的 token 限制照常报错。

替代方案：缓存“不支持流式”会引入 endpoint/模型/配置失效问题；所有 400 都重试会掩盖配置错误；在已收到正文后重试会增加费用并混合两次生成，因此不采用。

### 4. 传输层区分 SSE 与完整响应，协议层提取内容

扩展 `fetchSSE` 的响应元信息与可选完整 JSON 响应回调，传输层只负责状态、媒体类型、完整错误体、字节解码和有序交付，不理解结构化译文。三个 Engine 在结构化请求中启用该分流；非结构化调用保持既有默认行为。

- `text/event-stream` 按 SSE 解析；成功的 `application/json` 或 `application/*+json` 按完整协议 envelope 解析，在同一次响应上完成，不再 POST。缺失或其它媒体类型不猜测为“不支持流式”，保留 SSE 处理；无法解析或没有有效内容按错误结束。
- 桌面现有 status 事件增加 Content-Type 元信息；非 200 体完整收齐后再解码判定。浏览器侧复用单个流式 TextDecoder 并在结束时 flush；Rust 保留跨 chunk 的未完整 UTF-8 字节，避免 `from_utf8_lossy` 单块破坏字符。非法编码报可读传输错误。
- Chrome/Firefox 当前的后台桥没有传 headers，必须在 `src/browser-extension/background/index.ts` 的响应元信息、`BackgroundFetchResponseMessage` 和 `src/common/background/fetch.ts` 重建 Response 时透传并恢复 Content-Type。验证必须经过后台消息桥，不能仅 mock 一个自带 headers 的 Response。Userscript 的 Response 适配也需从 `responseHeaders` 恢复媒体类型，并完整读取 JSON/error body（现有 `getStreamText` 只读一次），仅修改本次传输契约需要的部分；两种 GM 响应模式均需覆盖。
- `eventsource-parser` 的同步 feed 只排队事件；串行 await 异步消费者，并在连接结束后等待队列排空。回调异常和取消进入同一个终结路径；完成后忽略迟到事件。Tauri 监听器注册、清理和 abort 约束保留。
- 显式非流式 fallback 用 `getUniversalFetch()` 获取完整响应，保留桌面代理/扩展权限/AbortSignal，不旁路已有传输配置。

完整响应提取：Chat 使用 `choices[0].message.content` / `message.refusal` / `finish_reason`；Responses 遍历 `output` 的 message 内容，只拼接 `type: 'output_text'` 的 `text`，先检查 refusal、`status`、`error` 与 `incomplete_details`（不依赖 SDK 派生的 `output_text` 属性）；Anthropic 只拼接 `content` 中 text blocks，检查 `stop_reason`/`stop_details`，忽略 thinking/signature。每种 envelope 都复用该协议流式路径的拒答、截断和错误语义；缺失或畸形 envelope 为错误，不能把 HTTP 200 当成功。

### 5. 单一终结与 UI 提交顺序

逻辑请求只拥有一个 terminal guard，attempt 内部分开记录能力错误与生成状态。终态优先级为：取消 → 拒答/上游或传输错误 → 完整 JSON 校验 → 协议结束原因。正常 EOF 无终止事件仍按既有兜底规则处理，但必须先等待事件队列和过滤器尾部，再校验。没有输出或仅残片不会因 EOF 被提升为成功。

保留 `isFullText` 作为替换语义，不新加“预览”状态字段：请求进行中都是临时结果，成功完成才提交。UI 的完整快照和文本增量共用现有最多每 100ms 刷新的调度；回调中立即更新请求局部 `resultText`，结束时同步 flush，再写缓存/历史。这样避免每个全量快照绕过节流，也不会把最后一个未刷新的字符遗漏。失败/停止保留部分译文及对应状态；旧请求计时器与迟到回调不得修改新请求。

## Risks / Trade-offs

- [宽容解析器可能对尚未完整的输入作出暂时解释] → 预览只取可用类型；原文独立保留并最终严格解析，预览不持久化。未完成转义等待后续数据。
- [重复解析累积文本有开销] → 仅保留一个原文缓冲和一个预览快照，合并 UI 刷新；验收长文本下的响应性。无需自写通用增量 JSON 解析器。
- [兼容端点的错误描述不统一] → 保守判定、只对明确证据重试；模糊错误暴露给用户，避免隐藏配置问题。
- [非流式 fallback 延迟更高或被上游拒绝] → 只尝试一次并保留服务端错误，不修改 token/strict 等用户语义。
- [终结回调与 SSE 异步消费竞争] → 用真实传输解析测试覆盖同包末段、慢消费者、EOF、取消与迟到事件，不能仅依赖 mock `fetchSSE` 的协议测试。

## Migration Plan

无设置、数据或数据库迁移。按任务顺序先完成共享解析/传输和协议接入，再接 UI 并执行验收；归档变更时合并两份 delta specs。撤回实现即可恢复原先结束后一次性显示行为；不留下双实现开关或旧配置路径。
