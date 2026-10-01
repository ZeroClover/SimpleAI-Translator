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

When structured output is enabled, the engine SHALL buffer the model's text (after thinking-tag filtering) without emitting it, and on stream end SHALL convert the JSON into display text with `formatStructuredOutput`, emitting it once as `onMessage({ content, isFullText: true })`.

- Sentence mode SHALL emit the trimmed `translatedText`.
- Short phrase mode SHALL emit at most 3 numbered options, each as `<n>. <translation> · /<phonetics>/`, then `[<part_of_speech>] <context_explanation>`, then `例句：` followed by numbered examples; empty parts are left out and options are separated by a blank line.
- Word mode SHALL emit, one per line and skipping empty values: `original_form`; `[<language>] · /<phonetics>/`; each sense as `[<pos>] <meaning>`; `例句：` with numbered `<sentence>(<translation>)` examples; `词源：` with the etymology; `拼写提示：<correction_hint>`.

#### Scenario: Word JSON renders as text

- **WHEN** word mode returns valid JSON with senses, examples, and etymology
- **THEN** the engine SHALL emit formatted text containing the `例句：` and `词源：` sections
- **AND** SHALL NOT emit raw JSON

#### Scenario: Sentence JSON renders as the translation only

- **WHEN** sentence mode returns `{"translatedText":"你好"}`
- **THEN** the engine SHALL call `onMessage` once with `content: "你好"` and `isFullText: true`

### Requirement: Structured Output Validation Failure Handling

The system SHALL treat a JSON parse failure or a missing-required-content failure as a recoverable error surfaced through the engine error path, and SHALL NOT let it become an uncaught promise rejection inside the streaming `onMessage` handler. Missing required content means: sentence mode without a non-empty `translatedText`, or short phrase mode without a non-empty `options` array. Word mode SHALL only require valid JSON; absent word fields are rendered as empty. The system SHALL NOT automatically retry or repair the JSON.

#### Scenario: Malformed structured JSON routes to onError

- **WHEN** structured output is enabled and the buffered model output is not valid JSON (including JSON cut off by a `max_tokens` truncation)
- **THEN** the engine SHALL call `onError` with the parser's error message
- **AND** SHALL call `onFinished('error')`
- **AND** SHALL NOT throw an uncaught exception or leave the UI stuck in a translating state

#### Scenario: Missing required translation field routes to onError

- **WHEN** structured output is enabled in sentence mode and the parsed JSON has no non-empty `translatedText`
- **THEN** the engine SHALL call `onError('Structured output is missing translatedText.')`
- **AND** SHALL call `onFinished('error')`

#### Scenario: Missing short phrase options routes to onError

- **WHEN** structured output is enabled in short phrase mode and the parsed JSON has no non-empty `options` array
- **THEN** the engine SHALL call `onError('Structured output is missing translation options.')`
- **AND** SHALL call `onFinished('error')`

#### Scenario: No automatic repair or retry

- **WHEN** a structured output validation failure occurs
- **THEN** the system SHALL surface the error to the user through `onError`
- **AND** SHALL NOT retry the request or attempt to repair the JSON automatically
