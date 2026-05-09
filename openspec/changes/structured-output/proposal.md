## Why

Currently, language models can sometimes return unstructured or slightly malformed text responses that fail to parse cleanly or reliably. Adopting Structured Output capabilities (JSON Schema or dedicated API parameters) for OpenAI and Anthropic providers will constrain responses to the exact format we need when the selected model/API supports it and the response is not refused or truncated, improving translation reliability and reducing parsing errors.

## What Changes

- Add a new "Use Structured Output" toggle in the settings, along with a "Strict JSON Schema" sub-toggle for broad API compatibility.
- Add a tooltip/warning next to the settings indicating that not all models and providers support strict schema enforcement.
- Update API request builders to pass structured output parameters for OpenAI (Chat Completions and Response formats) and Anthropic (GA `output_config`).
- Refactor the system and user prompts to provide strict JSON schemas and examples, optimized separately for word translation, short phrase to Chinese, and sentence translation modes.
- Implement JSON stream protection in the Engine layer to ensure the UI only receives formatted Markdown, preventing raw JSON code from leaking onto the user's screen.

## Capabilities

### New Capabilities

- `structured-output`: Managing API payloads and specialized prompts to request and validate JSON-formatted translation output for OpenAI and Anthropic APIs.

### Modified Capabilities

- `settings-surface`: Introducing the "Use Structured Output" setting toggle and associated warning UI.
- `translation-core`: Modifying the prompt construction and API request payload logic to support structured output parameters when enabled.

## Impact

- Translation API engines (`src/common/engines/`) will need updates to their request construction logic.
- Settings UI (`src/common/components/` or similar) will have a new preference added.
- Existing prompt generation logic in `src/common/translate.ts` will need refactoring to provide structured schema definitions and JSON examples.
- Engine request interfaces (`src/common/engines/interfaces.ts`) will need to carry structured-output mode/schema/rendering context from translation core to provider protocol implementations.
