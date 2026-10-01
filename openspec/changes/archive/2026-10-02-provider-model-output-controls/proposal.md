## Why

Thinking and Structured Output support varies by provider and model, but the current settings do not consistently persist those choices for each provider + model combination. This causes a model switch or first migration from older app versions to inherit controls that may be wrong for the selected model.

## What Changes

- Store "Enable Thinking", "Thinking Effort", "Use Structured Output", and "Strict JSON Schema" as provider + model scoped configuration.
- Resolve those controls from the active provider id and model name at translation time instead of from global settings or only the default model selection.
- Default any missing provider + model output-control record to no Thinking and no Structured Output.
- Treat first migration from old app versions the same as missing data: no Thinking and no Structured Output unless the user explicitly configures the selected provider + model.
- Keep effort defaults as UI defaults only when the user enables Thinking for a provider + model: OpenAI `medium`, Anthropic `high`.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `llm-provider-config`: Provider/model-scoped output-control data must be persisted separately from provider connection credentials.
- `settings-surface`: Settings UI must edit output controls for the selected provider + model combination.
- `structured-output`: Structured Output and Strict JSON Schema behavior must be controlled by the active provider + model combination.
- `translation-core`: Translation requests and cache keys must resolve Thinking and Structured Output controls from the active provider + model combination.

## Impact

- `src/common/types.ts` and settings normalization must add a provider + model scoped output-control store and remove reliance on global Structured Output fields for runtime behavior.
- `src/common/components/Settings.tsx` must move the four controls into the provider/model management flow or another model-specific editing surface.
- `src/common/components/Translator.tsx` and `src/common/translate.ts` must pass resolved provider + model controls into translation requests.
- `src/common/engines/protocols/*` structured-output and thinking request construction tests need coverage for missing, saved, and migrated controls.
- Existing settings data must migrate conservatively without enabling Thinking or Structured Output for models that have no saved provider + model record.
