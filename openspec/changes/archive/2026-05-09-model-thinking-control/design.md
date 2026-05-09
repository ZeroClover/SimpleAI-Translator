## Context

OpenAI (with reasoning models such as o-series/GPT-5-class models) and Anthropic (with Claude thinking modes) expose explicit reasoning/thinking controls. Currently, our system passes messages directly and renders whatever the model outputs. This causes two problems:

1. Users cannot control the cost/speed tradeoff via API parameters like OpenAI Chat Completions `reasoning_effort`, OpenAI Responses `reasoning.effort`, or Anthropic's token budget/adaptive thinking.
2. Older models or explicit prompt instructions might output `<thinking>` XML tags. Anthropic can expose native thinking deltas unless omitted, and some OpenAI-compatible providers expose non-standard reasoning fields. These should not pollute translated text in the UI.

## Goals / Non-Goals

**Goals:**

-   Provide one shared enable switch (`thinkingEnabled`) and provider-specific effort fields (`openaiReasoningEffort`, `anthropicThinkingEffort`).
-   Map those fields to API-specific parameters for OpenAI Chat Completions (`reasoning_effort`), OpenAI Responses (`reasoning.effort`), and Anthropic (Adaptive Thinking via `thinking.type` + `output_config.effort`, or Manual Thinking via `budget_tokens` on legacy models).
-   Implement a robust streaming filter that hides any thinking text (`<thinking>...</thinking>` tags, Anthropic's `thinking_delta`, and non-standard OpenAI-compatible reasoning fields such as `reasoning_content`) from the final rendered output.

**Non-Goals:**

-   Do not implement a feature to _show_ the thinking process in the UI (e.g., an expandable "Thought Process" block). The current goal is strictly to hide/strip it to maintain a clean translation result.
-   Do not build an OpenAI model capability matrix in this change. OpenAI effort support varies by model and will be validated by the upstream API.
-   Do not collapse OpenAI and Anthropic effort values into a shared enum. Provider-specific effort fields are intentional because each API exposes different levels and model-specific support.

## Decisions

### 1. Provider Configuration Shape

**Decision:** Replace the shared `thinkingIntensity` field with provider-specific fields and use `thinkingEnabled` as the only enable switch.

```ts
thinkingEnabled?: boolean
openaiReasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
anthropicThinkingEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
```

**Rationale:**

-   A shared enum hides real API differences. OpenAI supports `none` and `minimal`; Anthropic does not. Anthropic supports `max`; OpenAI does not expose `max`.
-   `thinkingEnabled` resolves ambiguity. If it is not `true`, no native thinking/reasoning parameter is sent, regardless of stored effort values.
-   Missing fields from old configs default to "disabled" for migration safety. UI defaults are `openaiReasoningEffort: 'medium'` and `anthropicThinkingEffort: 'high'`, but those defaults are only sent when `thinkingEnabled === true`.

### 2. Passing Thinking Parameters

**OpenAI**

-   If `thinkingEnabled !== true`, omit OpenAI reasoning parameters.
-   If `thinkingEnabled === true`, send the configured `openaiReasoningEffort`:
    -   Chat Completions: top-level `reasoning_effort`.
    -   Responses: `reasoning: { effort: ... }`.
-   Responses is the preferred OpenAI path for reasoning models because it exposes semantic streaming events and the current reasoning API surface.
-   We intentionally do not infer OpenAI model capabilities in this change. Some effort values are model-specific; unsupported combinations should return upstream API errors that the user can resolve by changing provider settings.

**Anthropic**

-   If `thinkingEnabled !== true`, omit `thinking` and `output_config.effort`.
-   If `thinkingEnabled === true`, dynamically pass either Adaptive or Manual thinking parameters based on the model. Model classification is by id prefix:
    -   **Adaptive-only / Adaptive-recommended models** (`claude-opus-4-7*`, `claude-opus-4-6*`, `claude-sonnet-4-6*`, `claude-mythos-preview*`): Pass `thinking: { type: "adaptive", display: "omitted" }` and `output_config: { effort: Y }`. Adaptive is the only mode accepted by Opus 4.7 and the recommended mode on Opus 4.6 / Sonnet 4.6 / Mythos.
    -   **Manual-only legacy models** (e.g., `claude-3-7-sonnet*`, `claude-haiku-4-5*`, Sonnet/Opus 4.5 and earlier that do not accept `type: "adaptive"`): Pass `thinking: { type: "enabled", budget_tokens: X, display: "omitted" }`.
-   Anthropic effort mapping:

    | `anthropicThinkingEffort` | Adaptive `output_config.effort`                                         | Manual `budget_tokens`                                                                    |
    | ------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
    | `low`                     | `low`                                                                   | `1024`                                                                                    |
    | `medium`                  | `medium`                                                                | `4096`                                                                                    |
    | `high`                    | `high`                                                                  | `16384`                                                                                   |
    | `xhigh`                   | `xhigh` on `claude-opus-4-7*`; clamp to `high` on other adaptive models | `32768`                                                                                   |
    | `max`                     | `max` on Anthropic adaptive models that support it                      | largest safe budget below `max_tokens`, target `64000` when the model output limit allows |

-   `display: "omitted"` is set on every thinking-enabled Anthropic request. This is the documented path for applications that do not surface thinking content to users: the server skips streaming thinking text, reducing first-text-token latency while preserving billing behavior. Client-side filtering of `thinking_delta` is retained as a defensive fallback for self-hosted proxies that might not honor `display`.
-   When thinking is enabled, increase `max_tokens` enough to cover thinking plus final text. In manual mode, `max_tokens` must be strictly greater than `budget_tokens`, and `budget_tokens` must be at least `1024`. For manual `max`, raise `max_tokens` above the chosen budget, using a larger target such as `128000` when the selected model supports it.

### 3. Stripping Thinking Output

**Decision:** Native protocol filtering lives in each protocol parser, while legacy XML `<thinking>` filtering lives in a shared engine-level helper.

-   Do not place `<thinking>` filtering in `universal-fetch.ts`; that utility should remain transport-only and should not know translation-domain semantics.
-   Add a shared engine helper such as `src/common/engines/thinking-filter.ts`, and instantiate it inside each engine that forwards text deltas.
-   For OpenAI Chat Completions, only pass `choices[0].delta.content`. Ignore non-standard OpenAI-compatible fields such as `choices[0].delta.reasoning_content`; the official Chat Completions stream does not expose raw reasoning text through this field.
-   For OpenAI Responses, only pass `response.output_text.delta`. Do not request `reasoning.summary` or `include: ["reasoning.encrypted_content"]`; raw reasoning tokens are not part of the user-visible output stream.
-   For Anthropic, ignore native thinking events: `thinking_delta`, `signature_delta`, and thinking content block boundaries. Only pass text deltas.

The shared XML filter must be streaming-safe:

-   It must detect `<thinking>` and `</thinking>` even when tags are split across chunks.
-   It must handle repeated thinking blocks in one stream.
-   If the stream ends while inside a thinking block, the buffered thinking content is discarded.
-   Tag matching is case-insensitive and allows whitespace between `<` or `</`, `thinking`, and `>`, such as `<Thinking>` or `< thinking >`.
-   Nested `<thinking>` blocks are treated as part of the current thinking block until the outer block closes.

## Risks / Trade-offs

-   **Risk:** Passing OpenAI reasoning controls to models that don't support them can cause API errors (HTTP 400).
    -   **Mitigation:** This is intentional for OpenAI in this change. We avoid maintaining a stale model capability matrix. The Provider UI should state that availability depends on the selected model and endpoint, and should recommend `openai-responses` for OpenAI reasoning models.
-   **Risk:** Anthropic has more client-side routing logic than OpenAI.
    -   **Mitigation:** This asymmetry is intentional. Anthropic requires different API shapes for adaptive versus manual thinking, while OpenAI uses one effort field shape per protocol and can rely on upstream validation.
-   **Risk:** Streaming XML filtering can delay output around partial tags.
    -   **Mitigation:** Keep a small rolling buffer only large enough to disambiguate tag prefixes, and flush confirmed non-tag text promptly.
