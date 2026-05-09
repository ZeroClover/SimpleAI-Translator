## Why

Recent advancements in AI models, specifically from OpenAI and Anthropic, have introduced native "thinking" or "reasoning" capabilities. These capabilities significantly enhance the models' ability to perform complex logic and translation tasks by engaging in internal chain-of-thought processes before generating final output. We need to implement API-native controls to toggle and adjust the intensity of these thinking behaviors, giving users the flexibility to balance reasoning depth, response speed, and cost. Furthermore, we need to ensure our UI remains clean by stripping out thinking content, whether it's native or in older XML `<thinking>` tag formats.

## What Changes

-   Add UI settings to configure a shared "Thinking Enabled" switch plus provider-specific effort controls for supported models (OpenAI and Anthropic).
-   Update OpenAI API requests to pass the API-specific reasoning controls when supported by the chosen model: Chat Completions uses the top-level `reasoning_effort` field, while Responses uses `reasoning: { effort: ... }`.
-   Update Anthropic API requests to enable "Adaptive Thinking" (`type: "adaptive"`) and map the intensity to the `output_config.effort` parameter for newer models, falling back to `type: "enabled"` with `budget_tokens` for legacy models. Also dynamically increase `max_tokens` when thinking is enabled to avoid truncation, and pass `thinking.display: "omitted"` so the server skips streaming thinking tokens (lower first-text-token latency; client-side filtering remains as a fallback for proxies).
-   Update the response parsing logic to strip out any model thinking output, keeping the final output clean. Specifically, handle native thinking response blocks where a provider exposes them, legacy `<thinking>...</thinking>` XML tags, and non-standard OpenAI-compatible reasoning fields without requesting OpenAI reasoning summaries or encrypted reasoning items.

## Capabilities

### New Capabilities

None

### Modified Capabilities

-   `llm-provider-config`: Add settings for "Thinking Enabled", OpenAI reasoning effort (None, Minimal, Low, Medium, High, XHigh), and Anthropic thinking effort (Low, Medium, High, XHigh, Max).
-   `translation-core`: Configure native API thinking parameters for Anthropic (`type: "adaptive"` + `output_config.effort` on newer models, `type: "enabled"` + `budget_tokens` on legacy models, plus `display: "omitted"`), configure API parameters for OpenAI reasoning (`reasoning_effort` for Chat Completions, `reasoning.effort` for Responses), and implement post-processing to strip thinking blocks/XML tags from final output.

## Impact

-   **Settings UI**: `llm-provider-config` settings forms will need new fields.
-   **LLM API Clients**: `translation-core` protocol engine request builders need to include OpenAI reasoning parameters (`reasoning_effort` for Chat Completions, `reasoning.effort` for Responses) and native thinking parameters for Anthropic (`thinking` + `output_config.effort`).
-   **Response Parsing**: The protocol engines need native thinking-event filtering plus a shared engine-level streaming state machine to hide/strip `<thinking>` tags from the user-facing output.
