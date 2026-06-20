# structured-output Specification

## Purpose
TBD - created by archiving change structured-output. Update Purpose after archive.
## Requirements
### Requirement: Structured Output API Payload Construction
The system SHALL construct API requests conforming to provider-specific Structured Output formats based on the `useStrictSchema` configuration.

#### Scenario: OpenAI API Format
- **WHEN** structured output is enabled and the provider is OpenAI Chat
- **THEN** if `useStrictSchema` is true, the payload SHALL use `response_format: { type: "json_schema", json_schema: { strict: true } }`
- **AND** the strict schema MUST set `additionalProperties: false` on every object
- **AND** every schema property MUST be listed in its containing object's `required` array
- **AND** if `useStrictSchema` is false, it SHALL fallback to `response_format: { type: "json_object" }`

#### Scenario: OpenAI Responses API Format
- **WHEN** structured output is enabled and the provider is OpenAI Responses API
- **THEN** the API payload SHALL use the `text.format` field instead of `response_format`
- **AND** if `useStrictSchema` is true, it SHALL use `text: { format: { type: "json_schema", strict: true, schema: ... } }`
- **AND** if `useStrictSchema` is false, it SHALL fallback to `text: { format: { type: "json_object" } }`
- **AND** the strict schema MUST set `additionalProperties: false` on every object
- **AND** every schema property MUST be listed in its containing object's `required` array

#### Scenario: Anthropic API Format (GA output_config)
- **WHEN** structured output is enabled and the provider is Anthropic
- **THEN** the API payload SHALL use the GA JSON Schema mode via `output_config.format` (without needing beta headers)
- **AND** it SHALL ignore the `useStrictSchema` toggle (always enforcing its native schema constraints)
- **AND** the schema MUST set `additionalProperties: false` on every object
- **AND** every schema property MUST be listed in its containing object's `required` array

### Requirement: Structured Prompt Definitions without Schema-Level CoT
The system SHALL provide distinct strict JSON schemas for Word Translation, Sentence Translation, and Short Phrase (to Chinese) modes. To avoid Chain-of-Thought (CoT) redundancy with modern reasoning models (e.g., OpenAI o-series, Claude 3.7+), the schemas MUST NOT include explicit `reasoning` fields. Furthermore, for all strict schemas, **all properties MUST be listed under the `required` array** to comply with API constraints.

#### Scenario: Mode Selection Priority
- **WHEN** structured output is enabled
- **THEN** schema selection SHALL preserve the current translation-mode behavior from `src/common/translate.ts`
- **AND** single-word mode SHALL win when `isAWord(sourceLangCode, text.trim())` is true
- **AND** short phrase to Chinese mode SHALL apply only when the text is shorter than 5 characters, targets Chinese, and does not qualify as single-word mode
- **AND** sentence mode SHALL be used as the fallback for other translation inputs

#### Scenario: Word Translation Schema
- **WHEN** translating a single word with structured output enabled
- **THEN** the prompt SHALL include a strict JSON schema defining ALL the following fields: `original_form`, `language`, `phonetics`, `senses` (array of part-of-speech and meaning), `examples` (array of sentence and translation), `etymology`, and `correction_hint`
- **AND** fields that are semantically optional, such as `correction_hint`, SHALL remain present in `required` and use nullable values when absent
- **AND** it MUST NOT include a `reasoning` or `explanation` field

#### Scenario: Short Phrase to Chinese Schema
- **WHEN** translating a text < 5 characters to Chinese with structured output enabled
- **THEN** the prompt SHALL include a strict JSON schema defining an array of up to 3 translation options, each containing: `translation`, `context_explanation`, `phonetics`, `part_of_speech`, and `examples`
- **AND** it MUST NOT include a `reasoning` or `explanation` field

#### Scenario: Sentence Translation Schema
- **WHEN** translating a sentence with structured output enabled
- **THEN** the prompt SHALL include a strict JSON schema defining ONLY the `translatedText` field (preserving existing behavior without feature creep)
- **AND** it MUST NOT include a `reasoning`, `explanation`, or `literalMeaning` field

### Requirement: Structured Output Validation Failure Handling

When structured output is enabled, the engine parses and formats the model's buffered JSON via `formatStructuredOutput`. The system SHALL treat a parse failure or a missing-required-field failure as a recoverable error surfaced through the engine error path, and SHALL NOT let it become an uncaught promise rejection inside the streaming `onMessage` handler. The system SHALL NOT automatically retry or repair the JSON.

#### Scenario: Malformed structured JSON routes to onError

- **WHEN** structured output is enabled and the buffered model output is not valid JSON
- **THEN** the engine SHALL call `onError` with a readable message
- **AND** SHALL call `onFinished('error')`
- **AND** SHALL NOT throw an uncaught exception or leave the UI stuck in a translating state

#### Scenario: Missing required translation field routes to onError

- **WHEN** structured output is enabled and the parsed JSON is missing the required field for the active mode (e.g. `translatedText` for sentence mode)
- **THEN** the engine SHALL call `onError` with a readable message
- **AND** SHALL call `onFinished('error')`

#### Scenario: No automatic repair or retry

- **WHEN** a structured output validation failure occurs
- **THEN** the system SHALL surface the error to the user through `onError`
- **AND** SHALL NOT silently retry the request or attempt to repair the JSON automatically

