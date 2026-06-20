## Context

两处缺陷都在 engine 层、互相独立，可在一个 change 内一并修复，无数据结构或回调契约变更。

- `formatStructuredOutput`（`interfaces.ts:60`）在 `emitStructuredContent` 内被 `await req.onMessage({ content: formatStructuredOutput(...), ... })` 调用（`openai-chat.ts:116-120`、`anthropic.ts:159-163`、`openai-responses.ts:116-120`），整段在 `try` 块外的 SSE 回调内，`JSON.parse` 与字段缺失 `throw` 没有被捕获到 `onError`。
- Anthropic 的 `stop_reason` 在 `message_delta` 事件中到达（参考既有 refusal 测试 `protocols.spec.ts:581` 一类构造）；当前 `onMessage` 无 `message_delta` 分支处理 `max_tokens`，`message_stop` 直接 `onFinished('stop')`（`anthropic.ts:241-246`）。

## Goals / Non-Goals

**Goals:**

- 结构化输出解析/校验失败 → `onError` + `onFinished('error')`，UI 退出“翻译中”。
- Anthropic `max_tokens` 截断 → `onFinished('max_tokens')`，与 OpenAI Chat 的 `finish_reason` 行为对齐，触发 `Translator.tsx` 的“字数受限”提示。

**Non-Goals:**

- 不做自动重试 / JSON 修复 / 续写（短文本无必要，且与无状态短流式模型相悖）。
- 不新增研究 §10 提到的内容/格式电池式校验（反前言、代码围栏、占位符完整性等）——strict-schema 短文本路径上冗余且可能误伤合法短输出。
- 不改动结构化输出 schema、模式选择或 thinking 参数。
- 不改 OpenAI Chat / Responses 的现有 finish/error 行为（已正确）。

## Decisions

### 在调用方捕获，而非吞掉在 formatStructuredOutput 内部

`formatStructuredOutput` 保持“失败即抛”的语义（信息最完整），由三处 `emitStructuredContent` 用 try/catch 捕获并转 `onError(message)` + `onFinished('error')`，并置 `finished = true` 防止后续重复回调。

考虑过的替代：让 `formatStructuredOutput` 返回 `{ ok, text | error }`。改动面更大且需改其单测；当前抛出语义清晰，调用点集中（仅三处），在调用点容错更小巧。

### Anthropic 截断原因透传

在 `onMessage` 增加：当事件为 `message_delta` 且 `delta.stop_reason`（或 `resp.stop_reason`）为 `max_tokens` 时，记录截断标志；`message_stop` 结束时据此 `onFinished('max_tokens')`，否则维持 `onFinished('stop')`。`Translator.tsx`（对 `'length' || 'max_tokens'` 提示“Chars Limited”）即可生效。

注意：现有 `translation-core` spec 的“Anthropic 完成事件”场景规定 `message_stop` SHALL `onFinish('stop')`，因此本 change 需配套修订该需求，把“正常完成→stop”与“截断→max_tokens”区分开。

## Risks / Trade-offs

- [Risk] 误把可恢复的中间态当作错误上报 → Mitigation：仅在缓冲结束后的格式化失败时上报；截断仅在明确 `stop_reason === 'max_tokens'` 时透传。
- [Risk] 某些 Anthropic 兼容代理不返回 `message_delta.stop_reason` → Mitigation：缺失时维持原 `'stop'` 行为，纯增量、无回归。

## Migration Plan

1. 三协议 `emitStructuredContent` 包 try/catch → `onError` + `onFinished('error')`。
2. Anthropic 增加 `message_delta` 的 `stop_reason` 捕获与 `max_tokens` 透传，`message_stop` 据此选择结束原因。
3. 补 vitest：畸形 JSON、缺失必填字段、Anthropic `max_tokens` 截断。
4. 运行 `openspec validate structured-output-robustness --strict`、`pnpm exec vitest run`、`pnpm exec tsc --noEmit` 与变更文件 lint。

回滚直接：移除 try/catch 与截断分支即可。

## Open Questions

- None.
