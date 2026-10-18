# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
