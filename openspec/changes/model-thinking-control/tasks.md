## 1. Provider Configuration & UI Updates

-   [x] 1.1 Update `ProviderConfig` interface in `src/common/types.ts` to include `thinkingEnabled?: boolean`, `openaiReasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'`, and `anthropicThinkingEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'`.
-   [x] 1.2 Update settings normalization so missing thinking fields from old configs default to disabled behavior: `thinkingEnabled !== true` means no reasoning/thinking parameters are sent. Preserve saved effort values when present, and use UI defaults `openaiReasoningEffort: 'medium'` / `anthropicThinkingEffort: 'high'` only when the user enables thinking without selecting an effort.
-   [x] 1.3 Update the Provider configuration form UI (`src/common/components/ProviderForm.tsx`) to include a "Thinking Enabled" switch and provider-specific effort dropdowns: OpenAI providers show OpenAI Reasoning Effort; Anthropic providers show Anthropic Thinking Effort.
-   [x] 1.4 Add helper text to the Provider form explaining that effort support depends on the selected model and compatible endpoint, and that OpenAI reasoning models should prefer the `openai-responses` protocol.
-   [x] 1.5 Ensure saving a provider persists `thinkingEnabled` plus the provider-specific effort field without overwriting the other provider's saved effort unnecessarily.

## 2. Streaming Response Filter

-   [x] 2.1 Implement a shared engine-level streaming filter (for example `src/common/engines/thinking-filter.ts`) for legacy XML `<thinking>...</thinking>` text.
-   [x] 2.2 The XML filter must handle tags split across chunks, repeated thinking blocks, nested thinking blocks, unclosed thinking blocks at stream end, case-insensitive tag names, and optional whitespace inside tag delimiters such as `< thinking >`.
-   [x] 2.3 Integrate the XML filter in protocol engines before calling `req.onMessage`; do not put the filter in `universal-fetch.ts`.
-   [x] 2.4 Add focused tests for cross-chunk tags, unclosed tags, multiple blocks, case/whitespace variants, nested blocks, and normal text with no thinking tags.

## 3. OpenAI API Client Updates

-   [ ] 3.1 Update the `openai-chat` engine to read `thinkingEnabled` and `openaiReasoningEffort` from the provider config.
-   [ ] 3.2 In `openai-chat`, send top-level `reasoning_effort` only when `thinkingEnabled === true`; map `none|minimal|low|medium|high|xhigh` directly to the OpenAI effort value, using `medium` when enabled and unset. Omit `reasoning_effort` when `thinkingEnabled` is off or unset.
-   [ ] 3.3 Ensure the Chat Completions SSE parser only forwards `choices[0].delta.content`; ignore non-standard OpenAI-compatible fields such as `choices[0].delta.reasoning_content` without describing them as official OpenAI stream fields.
-   [ ] 3.4 Update the `openai-responses` engine to read `thinkingEnabled` and `openaiReasoningEffort` from the provider config.
-   [ ] 3.5 In `openai-responses`, send `reasoning: { effort: ... }` only when `thinkingEnabled === true`; never send top-level `reasoning_effort` to Responses. Omit `reasoning` when `thinkingEnabled` is off or unset.
-   [ ] 3.6 Ensure the Responses request does not set `reasoning.summary` or `include: ["reasoning.encrypted_content"]`, and ensure the parser only forwards `response.output_text.delta` while ignoring any reasoning summary/encrypted reasoning events returned by upstream-compatible services.

## 4. Anthropic API Client Updates

-   [ ] 4.1 Update the `anthropic` engine to read `thinkingEnabled` and `anthropicThinkingEffort` from the provider config.
-   [ ] 4.2 Send no Anthropic thinking parameters when `thinkingEnabled !== true`, even if `anthropicThinkingEffort` is saved.
-   [ ] 4.3 Implement model classification by id prefix and dispatch the correct thinking shape:
    -   Adaptive-only / Adaptive-recommended (`claude-opus-4-7*`, `claude-opus-4-6*`, `claude-sonnet-4-6*`, `claude-mythos-preview*`): inject `thinking: { type: "adaptive", display: "omitted" }` + `output_config: { effort: Y }`.
    -   Manual-only legacy (`claude-3-7-*`, `claude-haiku-4-5*`, Sonnet/Opus 4.5 and earlier): inject `thinking: { type: "enabled", budget_tokens: X, display: "omitted" }`.
-   [ ] 4.4 Implement the Anthropic effort mapping per design.md table: `low → effort:"low" / budget_tokens:1024`; `medium → "medium" / 4096`; `high → "high" / 16384`; `xhigh → "xhigh"` only on `claude-opus-4-7*` else clamp to `"high"`, `budget_tokens:32768` in manual mode; `max → "max"` in adaptive mode and the largest safe manual `budget_tokens` below `max_tokens` (target 64000 when the model output limit allows).
-   [ ] 4.5 If thinking is enabled, dynamically raise `max_tokens` (target 64000, capped per model output limit; use a larger target such as 128000 for manual `max` when supported). In manual mode also enforce `max_tokens > budget_tokens` and `budget_tokens ≥ 1024`.
-   [ ] 4.6 Update the Anthropic SSE parser to explicitly ignore `delta.type === 'thinking_delta'` and `delta.type === 'signature_delta'` chunks, plus `content_block_start`/`content_block_stop` events whose `content_block.type === 'thinking'`, so that no native reasoning tokens leak into the UI even when the upstream proxy does not honor `display: "omitted"`.
