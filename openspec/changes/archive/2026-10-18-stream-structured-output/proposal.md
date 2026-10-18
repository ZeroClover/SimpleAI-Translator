# Proposal

## Why

三个协议已发送 `stream: true`，但结构化输出只在响应结束后解析并一次性显示，用户仍需等待完整结果。需要逐步显示可读译文，同时兼容明确不支持流式的端点，并保证不完整或无效的 JSON 不会成为成功结果。

## What Changes

- 为 `openai-chat`、`openai-responses`、`anthropic` 的结构化输出提供渐进式纯文本预览，覆盖句子、单词和中文短词组；完整字段的最终结果保持既有排版，缺失单词语种/音标时省略空括号或分隔符。
- 默认尝试流式。仅在上游明确拒绝流式且尚未输出模型内容时，保留原请求语义，以 `stream: false` 自动重试一次；上游直接返回普通 JSON 响应时消费同一响应，不重复请求。
- 流结束后从完整原始缓冲区严格解析 JSON，并检查渲染所需内容；`useStrictSchema` 不关闭本地检查。预览解析的宽容性不得成为最终校验的宽容性。
- 统一完成、拒答、截断、取消、fallback 的回调顺序；预览和失败结果不得写入成功缓存或翻译历史。
- 更新传输层对 SSE / 普通 JSON、异步回调和跨字节边界的处理，保证桌面与扩展行为一致。

本次交付为变更动议及可实施的设计、规格和任务清单；不包含运行时代码实现。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `structured-output`: 渐进格式化、结束时校验，以及仅针对流式能力不足的非流式 fallback。
- `translation-core`: 协议传输例外、JSON 预览与 UI 替换、终结顺序及成功结果提交。

## Impact

- Engine：`src/common/engines/interfaces.ts`、三个 `protocols/*.ts`；继续使用现有协议，不添加供应商引擎。
- 传输：`src/common/utils.ts` 的 `fetchSSE`、`src-tauri/src/fetch.rs`、扩展后台消息桥（`src/browser-extension/background/index.ts` / `src/common/background/fetch.ts`）、`src/common/polyfills/userscript.ts` 及相关生成绑定（若类型变化需要）。各适配器透传响应媒体类型并完整消费响应；非流式请求继续使用现有通用 fetch 路径及用户代理配置。
- UI：`src/common/components/Translator.tsx` 的完整文本替换、刷新节流和成功完成处理。
- 测试：协议、结构化格式化、真实传输解析与 UI/e2e 场景；Chrome、Firefox、Tauri 共用业务行为。
- 优先复用现有 `best-effort-json-parser` 和 `eventsource-parser`；不新增设置、能力缓存、持久化字段、供应商名单或 schema 校验依赖。
