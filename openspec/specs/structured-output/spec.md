# structured-output Specification

## Purpose

Defines optional structured (JSON) output for translations: when it is enabled per provider + model, the JSON schemas for each translation mode, how each protocol carries the schema, where the schema appears in the prompt, and how the engine turns the JSON reply into display text or an error.

## Requirements

### Requirement: Structured Output API Payload Construction

The system SHALL construct API requests conforming to provider-specific Structured Output formats based on the active provider + model's resolved `useStructuredOutput` and `useStrictSchema` controls.

Structured Output SHALL be enabled only when the ProviderModelOutputControls record for the active `providerId + model` has `useStructuredOutput === true`. If the active provider + model has no saved record or `useStructuredOutput` is not `true`, Structured Output SHALL be disabled. When it is enabled, `useStrictSchema` SHALL resolve to true unless the record sets it to `false`.

#### Scenario: OpenAI Chat API Format

- **WHEN** structured output is enabled for the active provider + model and the protocol is `openai-chat`
- **THEN** if that provider + model's `useStrictSchema` resolves to true, the payload SHALL use `response_format: { type: "json_schema", json_schema: { name: <schemaName>, strict: true, schema: <schema> } }`
- **AND** if that provider + model's `useStrictSchema` is false, it SHALL use `response_format: { type: "json_object" }` with no schema in the payload

#### Scenario: OpenAI Responses API Format

- **WHEN** structured output is enabled for the active provider + model and the protocol is `openai-responses`
- **THEN** the payload SHALL use the `text.format` field instead of `response_format`
- **AND** if that provider + model's `useStrictSchema` resolves to true, it SHALL use `text: { format: { type: "json_schema", name: <schemaName>, strict: true, schema: <schema> } }`
- **AND** if that provider + model's `useStrictSchema` is false, it SHALL use `text: { format: { type: "json_object" } }`

#### Scenario: Anthropic API Format

- **WHEN** structured output is enabled for the active provider + model and the protocol is `anthropic`
- **THEN** the payload SHALL include `output_config.format: { type: "json_schema", schema: <schema> }` without any beta header
- **AND** it SHALL ignore the `useStrictSchema` toggle, because Anthropic always enforces the schema
- **AND** it SHALL remove `minItems` and `maxItems` from the schema before sending, because Anthropic structured outputs reject array-size constraints; the formatter enforces item counts instead (short-phrase output keeps at most 3 options)

#### Scenario: Anthropic Structured Output with Thinking

- **WHEN** structured output is enabled for the active Anthropic provider + model and the thinking configuration also sends `output_config.effort` (adaptive mode, or thinking off on an always-thinking model)
- **THEN** the payload SHALL contain a single `output_config` object that includes both the `format` field and the `effort` field
- **AND** neither feature SHALL overwrite the other feature's `output_config` field

#### Scenario: Missing Provider + Model Controls Disable Structured Output

- **WHEN** the active provider + model has no ProviderModelOutputControls record
- **THEN** no Structured Output request fields SHALL be added for OpenAI Chat, OpenAI Responses, or Anthropic
- **AND** the model SHALL receive the normal natural-language translation prompt

### Requirement: Structured Prompt Definitions without Schema-Level CoT

The system SHALL provide distinct JSON schemas for Word Translation, Sentence Translation, and Short Phrase (to Chinese) modes. Reasoning depth is controlled only through native thinking parameters, so the schemas MUST NOT include `reasoning` or `explanation` fields. Every object in every schema SHALL set `additionalProperties: false` and list all of its properties in `required`; semantically optional values SHALL use a nullable type (`["string", "null"]`) instead of being left out of `required`.

#### Scenario: Mode Selection Priority

- **WHEN** structured output is enabled
- **THEN** schema selection SHALL follow the same translation-path rules as the natural-language prompt
- **AND** word mode SHALL win when `isAWord(sourceLangCode, text.trim())` is true
- **AND** short phrase to Chinese mode SHALL apply only when the text is shorter than 5 characters, the target is a Chinese language (`zh-Hans`, `zh-Hant`, `lzh`, `yue`, `jdbhw`, `xdbhw`), and word mode does not apply
- **AND** sentence mode SHALL be used for all other inputs

#### Scenario: Word Translation Schema

- **WHEN** translating a single word with structured output enabled
- **THEN** the request SHALL carry the `word_translation` schema with exactly these required fields: `original_form`, `language`, `phonetics`, `senses` (array of `{ pos, meaning }`), `examples` (array of `{ sentence, translation }`), `etymology`, and `correction_hint`
- **AND** `phonetics`, `etymology`, and `correction_hint` SHALL be nullable
- **AND** it MUST NOT include a `reasoning` or `explanation` field

#### Scenario: Short Phrase to Chinese Schema

- **WHEN** translating a text shorter than 5 characters to a Chinese target with structured output enabled
- **THEN** the request SHALL carry the `short_phrase_to_chinese_translation` schema whose only field `options` is an array with `maxItems: 3` (removed on the Anthropic wire, see Anthropic API Format), each item containing `translation`, `context_explanation`, `phonetics` (nullable), `part_of_speech` (nullable), and `examples` (array of `{ sentence, translation }`)
- **AND** it MUST NOT include a `reasoning` or `explanation` field

#### Scenario: Sentence Translation Schema

- **WHEN** translating a sentence with structured output enabled
- **THEN** the request SHALL carry the `sentence_translation` schema defining only the `translatedText` string field
- **AND** it MUST NOT include a `reasoning`, `explanation`, or `literalMeaning` field

### Requirement: Schema Placement in the Prompt

The JSON schema SHALL travel in exactly one place per request. When the API enforces the schema, restating it in the system instruction only costs tokens, so the system SHALL keep the schema out of the prompt in that case.

- When `useStrictSchema` is true on an OpenAI protocol (`json_schema`) or the protocol is Anthropic (`output_config.format`, which always enforces the schema), the system instruction SHALL contain only a one-line structured-output paragraph that starts with `Structured output:` and names the mode-specific rule (sentence mode: put the translation in `translatedText`; other modes: use null for unavailable nullable fields). It SHALL NOT contain the serialized schema.
- When `useStrictSchema` is false on an OpenAI protocol (`json_object`), no schema is sent on the wire, so the system instruction SHALL contain a `Structured output schema:` paragraph with the serialized schema followed by an instruction to return only a JSON object matching it and the mode-specific rule.

The structured-output paragraph SHALL replace the plain-output clause and SHALL appear before the untrusted-data boundary clause (see translation-core). A user whose compatible endpoint ignores `json_schema` can turn off Strict JSON Schema to fall back to the prompt-embedded schema.

#### Scenario: Strict schema stays out of the prompt

- **WHEN** structured output is enabled with `useStrictSchema: true`
- **THEN** the system instruction SHALL contain a paragraph starting with `Structured output:`
- **AND** SHALL NOT contain the serialized schema (for example the `"additionalProperties"` key)

#### Scenario: Anthropic keeps the schema out of the prompt

- **WHEN** structured output is enabled on the `anthropic` protocol with `useStrictSchema: false`
- **THEN** the system instruction SHALL contain the one-line `Structured output:` paragraph
- **AND** SHALL NOT contain the serialized schema

#### Scenario: JSON object mode embeds the schema

- **WHEN** structured output is enabled with `useStrictSchema: false` on an OpenAI protocol
- **THEN** the system instruction SHALL contain `Structured output schema:` followed by the serialized schema

### Requirement: Structured Output Formatting

When structured output is enabled, the system SHALL progressively display readable translation text derived from the model's text after thinking-tag filtering. It SHALL retain the complete filtered source independently of partial parsing, and SHALL validate that source at completion before emitting the final formatted result. It SHALL never display the JSON envelope or raw JSON fragments as translation text.

Each changed, non-empty preview SHALL replace the preceding preview rather than append a duplicate. A preview SHALL NOT signify successful completion. Sentence mode SHALL display the decoded available prefix of `translatedText` before its closing quote arrives. Word and short phrase modes SHALL progressively display available fields and array items without waiting for the whole JSON document. Missing or unusable fields SHALL be omitted in previews, without empty headings, brackets or numbered placeholders. JSON property order SHALL NOT affect the final layout. Incomplete escapes SHALL NOT leak JSON escape fragments into the display; when a partial value cannot yet be decoded, the system SHALL retain the previous preview until more input arrives.

Final formatting SHALL preserve the existing layout for populated fields, with the following explicit handling of missing word language/phonetics:

- Sentence mode SHALL emit the trimmed `translatedText`.
- Short phrase mode SHALL emit at most 3 numbered options, each as `<n>. <translation> · /<phonetics>/`, then `[<part_of_speech>] <context_explanation>`, then `例句：` followed by numbered examples; empty parts are left out and options are separated by a blank line.
- Word mode SHALL emit, one per line and skipping empty values: `original_form`; `[<language>] · /<phonetics>/`; each sense as `[<pos>] <meaning>`; `例句：` with numbered `<sentence>(<translation>)` examples; `词源：` with the etymology; `拼写提示：<correction_hint>`.
- The word language/phonetics line SHALL be `[<language>] · /<phonetics>/` when both exist, `[<language>]` for language only, `/<phonetics>/` for phonetics only, and omitted when both are absent or empty. Any validated final empty result SHALL replace an earlier preview with empty text and SHALL NOT be cached or saved to history; the non-empty-preview rule SHALL NOT suppress that final replacement.

#### Scenario: Word JSON renders as text

- **WHEN** word JSON arrives with original form first and senses, examples and etymology later
- **THEN** readable available word content SHALL appear before the complete response arrives
- **AND** the final text SHALL include the supplied `例句：` and `词源：` sections without raw JSON or duplicate content

#### Scenario: Sentence string streams before its closing quote

- **WHEN** sentence mode receives `{"translatedText":"你` followed by `好"}` in separate chunks
- **THEN** the first chunk SHALL make `你` available as a preview before completion
- **AND** the next preview and the validated final result SHALL contain `你好`, replacing the previous text

#### Scenario: Sentence JSON renders as the translation only

- **WHEN** sentence mode finishes with `{"translatedText":"你好"}`
- **THEN** the validated final snapshot SHALL contain only `你好` with `isFullText: true`
- **AND** it SHALL replace any earlier previews before the single completion callback

#### Scenario: Short phrase options arrive incrementally

- **WHEN** a first option is available while subsequent options and examples are still arriving
- **THEN** the system SHALL show that option before the complete response
- **AND** subsequent previews SHALL update the numbered layout with no more than three options

#### Scenario: Escapes and arbitrary chunk boundaries

- **WHEN** a quoted string, escaped quotation mark, backslash, Unicode escape or surrogate pair is split between chunks
- **THEN** the system SHALL show only decodable text and retain the previous preview when decoding is incomplete
- **AND** a trailing unpaired high surrogate in a preview string SHALL be withheld until its low surrogate arrives, even if partial parsing succeeds
- **AND** the validated final text SHALL equal formatting of the same unsplit JSON document

#### Scenario: Fields arrive out of display order

- **WHEN** etymology or examples arrive before original form or senses
- **THEN** previews SHALL be replaced as fields arrive, and the final result SHALL use the defined word layout

#### Scenario: Missing word language has no empty placeholder

- **WHEN** a word response contains only `original_form: 'run'`, or only `phonetics: 'rʌn'`
- **THEN** its final display SHALL be `run` or `/rʌn/` respectively, without empty brackets or a leading separator

#### Scenario: Final empty word result replaces a preview

- **WHEN** a valid complete word object formats to empty text after an earlier non-empty preview
- **THEN** the final replacement SHALL clear that preview before finishing, with no cache or history entry

### Requirement: Structured Output Validation Failure Handling

For streamed and non-streamed structured responses, the system SHALL strictly parse the complete filtered source as JSON at completion and SHALL require a non-null, non-array object. The system SHALL apply these checks regardless of `useStrictSchema` or server-side schema enforcement; partial parsing SHALL never repair or replace the source used for final validation.

Sentence mode SHALL require a non-empty string `translatedText`; short phrase mode SHALL require a non-empty `options` array. Word mode SHALL allow missing fields and render them as empty. Non-core fields SHALL retain tolerant rendering: non-string or empty text values SHALL be treated as absent, optional collections that are not arrays SHALL be omitted, and non-object array members (including null) SHALL be safely skipped. Such unusable non-core values SHALL NOT cause final validation failure or be coerced into translation text. Short phrase options with no usable content can therefore yield empty final text; the final empty replacement rule SHALL apply. Local validation SHALL cover JSON integrity, the root object and the existing required content, without enforcing field-by-field schema types, nullable constraints, or full `required` / `additionalProperties` rules. Extra properties SHALL be ignored, and short phrase formatting SHALL continue to keep at most three options rather than fail on excess items.

A parse, root-object or required-content failure, or an unexpected formatting exception, SHALL call `onError` with a readable error and `onFinished('error')` once, never leak an uncaught asynchronous rejection or leave translation loading. The system SHALL NOT automatically retry or repair invalid JSON. Previously displayed previews SHALL remain visible with the failure state but SHALL NOT be cached or saved to translation history. Refusals SHALL take precedence over JSON validation. Cancellation SHALL finish as `aborted` without validating an unfinished buffer. Token-limited responses SHALL still be validated: invalid or incomplete JSON SHALL finish as `error`; valid JSON SHALL retain the protocol's `length` / `max_tokens` reason and SHALL NOT count as success.

#### Scenario: Malformed structured JSON routes to onError

- **WHEN** the full response is not valid JSON, including a truncated buffer that a tolerant preview parser could complete
- **THEN** the system SHALL report the strict parser's error through `onError` and finish once with `error`
- **AND** SHALL NOT promote the preview into a final successful result

#### Scenario: Missing required translation field routes to onError

- **WHEN** sentence JSON has no non-empty string `translatedText`
- **THEN** the system SHALL call `onError('Structured output is missing translatedText.')` and finish with `error`

#### Scenario: Missing short phrase options routes to onError

- **WHEN** short phrase JSON has no non-empty `options` array
- **THEN** the system SHALL call `onError('Structured output is missing translation options.')` and finish with `error`

#### Scenario: Invalid object or nested field types

- **WHEN** the full JSON is `null`, a scalar or an array, or a core required field has the wrong type such as `translatedText: 123` or `options: {}`
- **THEN** the system SHALL report a readable validation error and finish once with `error`, without throwing from rendering

#### Scenario: Unusable non-core fields are omitted safely

- **WHEN** a word object contains a valid `original_form` but `language: null`, `phonetics: []` or `senses: [null]`, or a short phrase option contains `translation: 123` alongside valid context text
- **THEN** unusable values SHALL be skipped while the available valid content renders
- **AND** these non-core field types SHALL NOT cause JSON validation failure

#### Scenario: All short phrase members are unusable

- **WHEN** a valid object contains a non-empty `options` array whose members have no renderable content
- **THEN** the final empty result SHALL clear any preview and SHALL NOT be cached or saved to history

#### Scenario: Strict mode still checks the received result

- **WHEN** strict schema is enabled but the endpoint returns malformed JSON or a missing required translation value
- **THEN** the same local checks SHALL reject it, with no fallback, repair, or automatic retry

#### Scenario: Word fields remain optional locally

- **WHEN** a complete word response is an object with missing word fields and otherwise valid consumed values
- **THEN** local validation SHALL accept it and omit missing fields in formatting
- **AND** SHALL NOT require full server-side schema conformance locally

#### Scenario: No automatic repair or retry

- **WHEN** final JSON validation fails after a preview was shown
- **THEN** the error and partial text SHALL remain visible, loading SHALL end, and no additional request SHALL be sent
- **AND** no successful cache or history entry SHALL be created

#### Scenario: Valid JSON at a token limit remains incomplete work

- **WHEN** a response has valid structured content but a `length` or `max_tokens` completion reason
- **THEN** the system SHALL display its formatted content with that non-success reason and SHALL NOT save it as a successful result

### Requirement: Structured Output Streaming Transport Fallback

The system SHALL first request `stream: true` for structured output on all three protocols. It SHALL perform at most one retry with `stream: false` only when the upstream explicitly rejects streaming or the combination of streaming and the selected structured format, no model text/reasoning/refusal content has arrived, and the request is not cancelled. An explicit rejection SHALL be identified from HTTP 400/422/501 plus a structured error or unambiguous error message, or from an equivalent protocol error event before model content. A status code alone or the mere occurrence of `stream` in a message SHALL NOT suffice.

The retry SHALL preserve the same endpoint, model, headers, source and instruction payloads, schema/strictness, thinking/effort, token limits, privacy fields and cancellation signal; only the stream flag SHALL change. The first attempt SHALL finish and release resources before retrying. Its capability error SHALL NOT be emitted as a terminal UI error; status-code notifications SHALL still be delivered. Failure of the retry SHALL end the request without any further retry. The system SHALL NOT persist a streaming capability flag or disable structured output automatically.

If a successful streaming request instead returns a complete protocol JSON response with JSON media type, the system SHALL consume that response with the same filtering, formatting and final validation, without issuing another request. A successful HTTP status without a valid protocol response SHALL NOT be treated as a successful translation.

#### Scenario: Explicit stream rejection retries once

- **WHEN** a structured request receives HTTP 400 with an unsupported `stream: true` parameter error before any model content
- **THEN** the system SHALL send one otherwise identical request with `stream: false`
- **AND** a valid fallback result SHALL be formatted and validated before one successful finish, with no intermediate UI error

#### Scenario: Stream and schema combination rejected in a protocol error

- **WHEN** a protocol error event explicitly states that streaming with JSON schema is unsupported before any model content
- **THEN** the system SHALL end that attempt and try once without streaming, preserving the JSON schema

#### Scenario: Unrelated failures never trigger fallback

- **WHEN** the result is an auth error, rate limit, generic server/network error, invalid schema, unsupported structured output itself, ambiguous stream error, refusal, truncation or invalid output JSON
- **THEN** the system SHALL surface the failure without retrying non-streamed or weakening the output constraints

#### Scenario: Content has already begun

- **WHEN** an upstream reports unsupported streaming after emitting model text, thinking or refusal content
- **THEN** the system SHALL fail without replaying the request or appending a second generation

#### Scenario: Fallback also fails

- **WHEN** the non-streamed attempt fails, including a non-streamed token-limit rejection
- **THEN** the system SHALL surface that failure once and SHALL NOT make a third request or alter token limits

#### Scenario: Endpoint ignores stream and returns JSON

- **WHEN** the initial response is HTTP 200 with `application/json` or an `application/*+json` media type containing the protocol's complete response envelope
- **THEN** the system SHALL consume it as a single final response and SHALL NOT issue a second POST

#### Scenario: Cancel before or during fallback

- **WHEN** cancellation occurs before fallback starts or while its response is pending
- **THEN** no new attempt SHALL start after cancellation, any pending attempt SHALL be cancelled, and the logical request SHALL finish once as `aborted`
- **AND** unfinished JSON SHALL NOT produce a validation error after cancellation
