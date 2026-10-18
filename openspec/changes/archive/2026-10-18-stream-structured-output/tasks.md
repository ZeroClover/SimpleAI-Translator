# Tasks

实施状态见各项勾选；未勾选项的原因记录在 `validation.md` 的“实施验证”。

## 1. 结构化预览与终态校验

- [x] 1.1 在现有 Engine 共享边界分离对象格式化、临时预览解析与完整原文校验，复用已安装的解析依赖；单测验证句子开放字符串、单词字段、短词组选项在完整响应前可显示，完整字段的最终排版保持一致，缺失语种/音标时按规格省略空括号/分隔符。
- [x] 1.2 对三种模式保留原文缓冲并实现 strict 无关的 JSON/根对象/核心内容校验；单测验证非法 JSON、null/数组根节点、核心字段类型错误或缺失会报错，同时非核心字段不可用、可选集合类型不符、非对象数组成员均安全跳过，单词缺失字段允许、额外字段忽略、短词组超过三项截取，全部不可用内容的合法空结果不留旧预览。
- [x] 1.3 验证任意属性顺序、跨块引号/反斜杠/Unicode 转义/代理对（包括宽容解析成功但仅收到高位代理项）、嵌套数组、thinking 标签及未完成前缀；断言预览不泄露 JSON、不展示半个代理对、不重复追加、宽容解析不会使截断原文通过终态校验。

## 2. 传输完整性与响应分流

- [x] 2.1 扩展 `fetchSSE` 与 Tauri 响应元信息，并在扩展后台发送端、`BackgroundFetchResponseMessage` 与前端重建 Response 时透传/恢复 Content-Type；调整 userscript 的媒体类型和完整 body 读取。测试必须经过真实后台消息桥及 GM 两种响应模式，覆盖 SSE、首次直接 JSON 仅一次 POST、JSON 媒体类型/charset、缺失媒体类型、畸形 envelope 与跨块错误体，保持普通文本默认路径。
- [x] 2.2 修复浏览器和 Rust 流式 UTF-8 解码的块边界处理，增加中文/emoji 跨字节拆分与非法编码测试；验证 JS 解析测试和对应 Rust 测试通过。
- [x] 2.3 串行等待事件消费者并在 EOF 排空队列；测试慢回调、同包末段与终止事件、异步异常、取消注册/消费期间及迟到事件，验证无未捕获 rejection、无多次完成、监听器释放。

## 3. 三协议接入与一次 fallback

- [x] 3.1 三个 Engine 接入共享结构化预览和终态校验，保留原请求字段与 thinking/refusal 语义；用三协议 × 三模式的参数化单测验证生成中快照和最终结果，覆盖 OpenAI strict 开/关及 Anthropic 合并 `output_config`。
- [x] 3.2 实现保守的流式能力拒绝判定与单次 `stream: false` 重试；测试 HTTP 400/422/501 的明确证据、首个内容前协议错误（Chat 无 choices 的 error envelope 优先于空 choices 忽略，Responses/Anthropic 能力错误优先于终态错误路径），以及模糊 stream 错误、schema 不支持、401/403/429/通用 5xx/网络错误不重试。
- [x] 3.3 通过现有通用 fetch 解码 Chat、Responses、Anthropic 完整响应，复用相同终态检查；测试初次直接 JSON 只发一次请求、显式 fallback 两次请求、refusal/thinking 分离、Responses 非成功状态、畸形 envelope 和 fallback 失败不发第三次请求。
- [x] 3.4 验证 fallback 请求除 stream 外完全保持 endpoint/headers/model/prompt/nonce/schema/strict/effort/token/privacy 字段，仍使用桌面代理与扩展权限；测试取消前后、收到任意模型内容后禁止 fallback、中间错误不闪现以及最终完成仅一次。
- [x] 3.5 验证终态顺序：拒答优先、无终止事件的 EOF、无输出、无效 JSON 截断、有效 JSON 带截断原因；对每种协议断言最终消息在 finish 前提交且非成功结果不会成为成功。

## 4. UI 与持久化验收

- [x] 4.1 将全量预览快照纳入现有 100ms 刷新调度，并在终态立即 flush；组件测试覆盖替换而非追加、合法最终空快照清空先前预览且不缓存/保存、末段尚未刷新时成功完成、旧请求计时器与回调隔离。
- [x] 4.2 更新相关 e2e 场景，验证生成中可读译文、单次 fallback、最终校验失败提示、停止后保留部分文本；断言只有已验证且成功的结果进入缓存与历史，并验证普通文本翻译不回归。

## 5. 集成与真实协议覆盖

- [x] 5.1 执行 `pnpm test`、`pnpm test:e2e`、`pnpm lint`、`pnpm exec tsc --noEmit` 及相关 Rust 检查，完成 Chrome/Firefox/Tauri 的结构化流式与非流式通路验证，记录实际平台范围与未验证项。
- [x] 5.2 使用用户授权的测试网关与 1Password 密钥引用进行多供应商/大小模型测试，覆盖 Chat Completions、Responses、Anthropic Messages；验证 stream=true/false 的真实 envelope、strict/JSON object 路径、三种输出模式及最终 JSON，记录失败原因而不静默换模型，密钥不落盘、不进日志。
- [x] 5.3 将真实网关不能稳定制造的拒绝流式、取消竞争、畸形 JSON 和错误体分片保留为确定性模拟测试，并明确区分上游协议探测结果与已实现应用的端到端验收；以 `openspec validate stream-structured-output --strict` 验证规格和任务一致。
