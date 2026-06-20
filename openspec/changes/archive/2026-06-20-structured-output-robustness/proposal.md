## Why

研究分析在对照代码库时发现两个真实的健壮性缺陷（非来自研究本身，而是审阅现状所得）：

1. **结构化输出解析失败会变成未捕获的 Promise rejection。** `formatStructuredOutput`（`interfaces.ts:60-128`）直接 `JSON.parse(rawContent)`（`interfaces.ts:61`）且在缺失必填字段时 `throw`（如 `:66/:74`）。三协议都在 `async onMessage`/`emitStructuredContent` 内调用它且**无 try/catch**（`openai-chat.ts:110-121`、`anthropic.ts:153-164`、`openai-responses.ts:110-121`）。一旦模型返回畸形或截断的 JSON，异常不会经 `onError` 上报，而是变成未捕获 rejection，UI 静默卡在“翻译中”。

2. **Anthropic 因 `max_tokens` 截断被当作正常结束。** `anthropic.ts:209` 已读取 `stop_reason` 但仅用于判断 `refusal`；`message_stop` 硬编码 `onFinished('stop')`（`anthropic.ts:241-246`）。当 Claude 因 `max_tokens` 截断时，截断原因被丢弃，上层 `Translator.tsx`（对 `'length' || 'max_tokens'` 弹“Chars Limited”）无法提示用户。OpenAI Chat 已正确转发 `finish_reason`。

## What Changes

- 在三协议的结构化输出格式化调用处用 try/catch 包裹 `formatStructuredOutput`，把解析/校验失败转为 `onError(...)` + `onFinished('error')`，给用户可见反馈。**不**做自动重试或 JSON 修复（短文本无此必要，且自动重试有成本）。
- 在 Anthropic 适配器捕获 `message_delta` 的 `stop_reason`；当为 `max_tokens` 时，`message_stop` 以 `onFinished('max_tokens')` 结束而非 `'stop'`，使 `Translator.tsx` 能提示“字数受限”。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `structured-output`: 结构化输出的解析/校验失败 SHALL 通过引擎错误路径上报，SHALL NOT 成为未捕获异常。
- `translation-core`: Anthropic 协议 SHALL 透传 `max_tokens` 截断原因，使截断结束不再被报告为普通 `'stop'`。

## Impact

- `src/common/engines/interfaces.ts`：`formatStructuredOutput` 的调用方需容错；该函数自身可保持抛出语义（由调用方捕获），或改为返回可判定的失败信号。
- `src/common/engines/protocols/openai-chat.ts`、`anthropic.ts`、`openai-responses.ts`：`emitStructuredContent` 包 try/catch → `onError` + `onFinished('error')`。
- `src/common/engines/protocols/anthropic.ts`：新增 `message_delta` 的 `stop_reason` 捕获与 `max_tokens` 透传；`message_stop` 按是否截断选择 `onFinished('stop' | 'max_tokens')`。
- `src/common/engines/protocols/protocols.spec.ts`：补充畸形/截断 JSON 触发 `onError` 与 Anthropic `max_tokens` 经 `message_delta` 触发截断结束的测试。
