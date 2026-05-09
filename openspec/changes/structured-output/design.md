## Context

Language models often struggle to consistently return structured data (like JSON) when prompted using only natural language. Currently, the application relies on prompt engineering to get JSON out of OpenAI and Anthropic, which is prone to parsing errors and hallucinatory wrapper text (e.g., "Here is the JSON you requested: ..."). Modern APIs like OpenAI's Chat Completions support "Structured Outputs" (JSON Schema) or `response_format: { type: "json_object" }`. Anthropic also supports similar strict formatting. This change introduces native API-level structured output to improve the reliability of translations.

## Goals / Non-Goals

**Goals:**
- Provide a robust way to fetch JSON results from OpenAI and Anthropic.
- Allow users to opt-in or opt-out via a new setting "Use Structured Output".
- Provide clear examples and schema definitions within the translation prompts.
- Ensure type-safe schema validation where possible.

**Non-Goals:**
- Implement structured output support for every single provider immediately (focused on OpenAI and Anthropic).
- Remove the existing non-structured prompt support entirely, as users may prefer or require it for legacy models or local setups.

## Decisions

- **Decision: Explicit "Use Structured Output" and "Strict JSON Schema" toggles.**
  - *Rationale:* Some API models (especially non-OpenAI ones that mimic the OpenAI API) might not fully support `strict: true` JSON schemas in the manner OpenAI does. Allowing users to disable the Strict Schema acts as a safe fallback to `json_object` mode.
- **Decision: Three distinct prompt schemas matching the existing translation modes.**
  - *Rationale:* Word translation yields phonetics, multiple parts of speech, etc.; short phrase to Chinese mode yields multiple candidate translations with usage contexts; sentence translation yields the final translated text. Using mode-specific schemas produces higher quality results than a generalized one while preserving existing behavior.
- **Decision: Engine-Level JSON Parsing & Markdown Formatting (Buffering Trade-off).**
  - *Rationale:* The UI (`Translator.tsx`) expects raw Markdown or text to render progressively. Streaming raw JSON chunks to the UI breaks the display. The Engine protocols will likely need to buffer the JSON stream in its entirety to parse it safely at the end, and MUST ONLY dispatch the reconstructed, human-readable Markdown to the UI. This explicitly trades off the "typewriter" streaming UX for structural reliability when `useStructuredOutput` is enabled.

## Risks / Trade-offs

- **Risk:** Third-party "OpenAI-compatible" APIs might crash or reject requests when `response_format` is provided.
  - *Mitigation:* The "Use Structured Output" setting defaults to a safe state or can easily be disabled. A warning tooltip will notify users of this risk.
- **Risk:** Anthropic's API might require a different approach to structured output compared to OpenAI (e.g., tool usage vs `response_format`).
  - *Mitigation:* The API request builder abstraction in `translation-core` will handle the provider-specific payload construction logic.
