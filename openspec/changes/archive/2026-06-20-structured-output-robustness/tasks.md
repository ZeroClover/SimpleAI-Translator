## 1. 结构化输出解析容错

- [x] 1.1 在 `openai-chat.ts` 的 `emitStructuredContent`（约 `:110-121`）用 try/catch 包裹 `formatStructuredOutput`；捕获后调用 `req.onError(可读消息)` 与 `req.onFinished('error')`，并置 `finished = true` 防止重复结束回调。
- [x] 1.2 在 `anthropic.ts` 的 `emitStructuredContent`（约 `:153-164`）做同样的容错处理。
- [x] 1.3 在 `openai-responses.ts` 的 `emitStructuredContent`（约 `:110-121`）做同样的容错处理。
- [x] 1.4 确认 `formatStructuredOutput`（`interfaces.ts:60-128`）保持失败即抛语义（无需改其实现），由调用方统一容错；不引入自动重试/修复，不引入额外内容/格式校验。

## 2. Anthropic 截断原因透传

- [x] 2.1 在 `anthropic.ts` 的 `onMessage` 增加 `message_delta` 分支，捕获 `delta.stop_reason`（或等价位置）；当为 `max_tokens` 时记录截断标志。
- [x] 2.2 `message_stop` 结束时按截断标志选择 `req.onFinished('max_tokens')` 或维持 `req.onFinished('stop')`；缺失 `stop_reason` 时维持 `'stop'`。
- [x] 2.3 确认 `Translator.tsx` 对 `'length' || 'max_tokens'` 的“Chars Limited”提示路径在 Anthropic 截断时被触发（仅核对，不改 UI 逻辑）。

## 3. 测试与验证

- [x] 3.1 在 `protocols.spec.ts` 补：结构化模式下模拟畸形 JSON 与缺失必填字段（如 sentence 模式缺 `translatedText`），断言触发 `onError` + `onFinished('error')`，且不抛未捕获异常。
- [x] 3.2 补：Anthropic 模拟 `message_delta` 带 `stop_reason: 'max_tokens'` 后 `message_stop`，断言 `onFinished('max_tokens')`；并补一例正常 `message_stop` 仍为 `'stop'`。
- [x] 3.3 运行 `openspec validate structured-output-robustness --strict`、`pnpm exec vitest run`、`pnpm exec tsc --noEmit` 与变更文件的 `pnpm lint`。
