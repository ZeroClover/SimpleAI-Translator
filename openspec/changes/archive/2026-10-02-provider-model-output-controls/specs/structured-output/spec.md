## MODIFIED Requirements

### Requirement: Structured Output API Payload Construction

The system SHALL construct API requests conforming to provider-specific Structured Output formats based on the active provider + model's resolved `useStructuredOutput` and `useStrictSchema` controls.

Structured Output SHALL be enabled only when the ProviderModelOutputControls record for the active `providerId + model` has `useStructuredOutput === true`. If the active provider + model has no saved record, `useStructuredOutput` is missing, or the app is normalizing settings from an older version for the first time, Structured Output SHALL be disabled.

#### Scenario: OpenAI API Format

- **WHEN** structured output is enabled for the active provider + model and the provider is OpenAI Chat
- **THEN** if that provider + model's `useStrictSchema` is true or missing, the payload SHALL use `response_format: { type: "json_schema", json_schema: { strict: true } }`
- **AND** the strict schema MUST set `additionalProperties: false` on every object
- **AND** every schema property MUST be listed in its containing object's `required` array
- **AND** if that provider + model's `useStrictSchema` is false, it SHALL fallback to `response_format: { type: "json_object" }`

#### Scenario: OpenAI Responses API Format

- **WHEN** structured output is enabled for the active provider + model and the provider is OpenAI Responses API
- **THEN** the API payload SHALL use the `text.format` field instead of `response_format`
- **AND** if that provider + model's `useStrictSchema` is true or missing, it SHALL use `text: { format: { type: "json_schema", strict: true, schema: ... } }`
- **AND** if that provider + model's `useStrictSchema` is false, it SHALL fallback to `text: { format: { type: "json_object" } }`
- **AND** the strict schema MUST set `additionalProperties: false` on every object
- **AND** every schema property MUST be listed in its containing object's `required` array

#### Scenario: Anthropic API Format (GA output_config)

- **WHEN** structured output is enabled for the active provider + model and the provider is Anthropic
- **THEN** the API payload SHALL use the GA JSON Schema mode via `output_config.format` (without needing beta headers)
- **AND** it SHALL ignore the `useStrictSchema` toggle (always enforcing its native schema constraints)
- **AND** the schema MUST set `additionalProperties: false` on every object
- **AND** every schema property MUST be listed in its containing object's `required` array

#### Scenario: Anthropic Structured Output with Thinking

- **WHEN** structured output and Thinking are both enabled for the active Anthropic provider + model
- **THEN** the API payload SHALL contain a single `output_config` object that includes both the Structured Output `format` field and the Thinking `effort` field when the selected Anthropic thinking mode requires `output_config.effort`
- **AND** enabling one feature SHALL NOT overwrite the other feature's `output_config` fields

#### Scenario: Missing Provider + Model Controls Disable Structured Output

- **WHEN** the active provider + model has no ProviderModelOutputControls record
- **THEN** no Structured Output request fields SHALL be added for OpenAI Chat, OpenAI Responses, or Anthropic
- **AND** the model SHALL receive the normal natural-language translation prompt
