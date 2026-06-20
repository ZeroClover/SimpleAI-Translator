## ADDED Requirements

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
