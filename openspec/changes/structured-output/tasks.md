## 1. Type and State Updates

- [x] 1.1 Update `ISettings` interface in `src/common/types.ts` to include `useStructuredOutput?: boolean` and `useStrictSchema?: boolean`
- [x] 1.2 Update default settings object in `src/common/utils.ts` to include `useStructuredOutput: false` and `useStrictSchema: true`
- [x] 1.3 Extend the engine request types in `src/common/engines/interfaces.ts` so translation core can pass structured-output mode, schema, and result formatting context to protocol engines.

## 2. Settings UI Implementation

- [x] 2.1 Add "Use Structured Output" toggle switch in `Settings.tsx`
- [x] 2.2 Add "Strict JSON Schema" sub-toggle (only active when Structured Output is enabled)
- [x] 2.3 Add a warning tooltip to the Strict Schema toggle indicating third-party model compatibility risks
- [x] 2.4 Ensure setting values are properly bound to the global state and persist

## 3. Schema and Prompt Definitions

- [x] 3.1 Define Word Translation JSON Schema encompassing ALL required fields: `original_form`, `language`, `phonetics`, `senses` (pos/meaning), `examples` (sentence/translation), `etymology`, and `correction_hint`. All fields MUST be in `required`; optional semantics MUST use nullable fields. Every object MUST set `additionalProperties: false`. Do NOT include a `reasoning` field.
- [x] 3.2 Define Short Phrase to Chinese JSON Schema (array of up to 3 options with `translation`, `context_explanation`, `phonetics`, `part_of_speech`, `examples`). All fields MUST be in `required`; optional semantics MUST use nullable fields. Every object MUST set `additionalProperties: false`. Do NOT include a `reasoning` field.
- [x] 3.3 Define Sentence Translation JSON Schema (ONLY `translatedText`). All fields MUST be in `required`. Every object MUST set `additionalProperties: false`. Do NOT include `reasoning` or `literalMeaning` fields.
- [x] 3.4 Preserve current mode selection priority: single-word mode wins when `isAWord(...)` is true; short phrase to Chinese applies only for non-word text shorter than 5 characters targeting Chinese; sentence mode is the fallback.
- [x] 3.5 Update prompt generation in `src/common/translate.ts` to append the appropriate schema when `useStructuredOutput` is true.

## 4. API Request Builder Updates

- [x] 4.1 Update OpenAI Chat Engine: inject `response_format` (`json_schema` if strict, else `json_object`).
- [x] 4.2 Update OpenAI Responses Engine: inject `text.format` instead of `response_format` (`json_schema` with `strict: true` if strict, else `json_object`).
- [x] 4.3 Update Anthropic Engine: use GA `output_config.format` (no beta headers needed), ignoring `useStrictSchema` (always strict).
- [x] 4.4 Update OpenAI error handling to detect `message.refusal` (with `finish_reason: "stop"`).
- [x] 4.5 Update Anthropic error handling to detect `stop_reason: "refusal"`.

## 5. Engine JSON Parsing & UI Protection (CRITICAL)

- [x] 5.1 Implement JSON parsing logic in Engine protocols. Buffer the JSON response fully before parsing and format it into a Markdown string to prevent JSON tearing in the UI (Note: this implies stream: true is active for TTFB but visually renders non-streaming).
- [x] 5.2 Update Engine `onMessage` dispatching to ONLY yield the formatted Markdown/Text, completely protecting the UI from receiving raw JSON strings.
- [x] 5.3 Include `useStructuredOutput`, `useStrictSchema`, and selected structured-output mode in the translation cache key so toggling structured output cannot reuse stale non-structured results.

## 6. Verification

- [x] 6.1 Test JSON UI Protection: Verify no raw JSON braces `{}` appear in the translation UI during or after generation.
- [x] 6.2 Test OpenAI Chat and Responses formats with both Strict Schema ON and OFF.
- [x] 6.3 Test Anthropic engine with `output_config.format`.
- [x] 6.4 Test error handling for OpenAI (`message.refusal`) and Anthropic (`stop_reason`).
- [x] 6.5 Test Word Translation mode to ensure all required fields (phonetics, senses, examples, etc.) are correctly populated and rendered.
- [x] 6.6 Test cache isolation by translating the same input with structured output disabled and enabled, verifying each setting uses its own cached result.
- [x] 6.7 Test Short Phrase to Chinese mode to ensure multiple translation options are parsed and rendered without exposing raw JSON.
- [x] 6.8 Run the existing translation regression tests in `src/common/__tests__/translate.test.ts` and ensure they still pass.
