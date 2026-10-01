## 1. Data Model and Migration

- [x] 1.1 Add `ProviderModelOutputControls` to `src/common/types.ts`, add `ISettings.providerModelOutputControls?: ProviderModelOutputControls[]`, and remove Thinking / Structured Output fields from the runtime `ModelSelection` shape.
- [x] 1.2 Add `providerModelOutputControls` to the settings storage contract, including `settingKeys`, `storageSettingKeys`, and `sanitizeSettingsForStorage`, so records persist through `setSettings()` and reload through `getSettings()`.
- [x] 1.3 Add normalization for Provider + Model output-control records: validate provider id/model, validate effort values, collapse duplicate `providerId + model` records with last valid record winning, and drop records for missing providers or blank models.
- [x] 1.4 Update settings normalization so legacy `useStructuredOutput`, `useStrictSchema`, and old `defaultModel` Thinking fields do not create enabled ProviderModelOutputControls during first migration and are not written back as normalized runtime settings.
- [x] 1.5 Add `resolveProviderModelOutputControls(settings, providerId, model)` to `src/common/utils.ts`, export a normalized return type containing Thinking controls plus `useStructuredOutput` and `useStrictSchema`, and return conservative defaults when no saved record exists.
- [x] 1.6 Make the save path persist visible defaults when a user first enables controls: OpenAI effort `medium`, Anthropic effort `high`, and Strict JSON Schema `true`.

## 2. Settings UI

- [x] 2.1 Update `LLMProvidersSettings` props and its parent `handleLLMProvidersChange` flow so Provider + Model output controls are read and written through the controlled Settings state, alongside but separate from `ProviderConfig` and `ModelSelection`.
- [x] 2.2 Keep "Enable Thinking" and the protocol-specific Thinking Effort control bound to the selected provider + model record, and ensure switching models loads the target model's saved values without copying the previous model's values.
- [x] 2.3 Ensure deleting a provider removes or normalizes away ProviderModelOutputControls for that provider, while retaining records for custom model names on providers that still exist.
- [x] 2.4 Move "Use Structured Output" and "Strict JSON Schema" into the selected provider + model settings surface and remove the global toggles and global change handlers from the General settings section.
- [x] 2.5 Update `mergeFormValues`, form initial values, and `form.setFieldsValue(...)` usage so removed global `useStructuredOutput` and `useStrictSchema` fields are not reintroduced or written back as dirty form data.
- [x] 2.6 Preserve existing warning/help copy for Strict JSON Schema where possible; if any new user-visible strings are introduced, update every locale file under `src/common/i18n/locales/`.

## 3. Translation Runtime

- [x] 3.1 Reorder `translate()` so it resolves the actual provider id and model before building `structuredOutput` or Thinking request data, then resolve Provider + Model output controls from that exact combination.
- [x] 3.2 Build Structured Output requests only from the resolved Provider + Model controls, with missing records producing the normal natural-language request path.
- [x] 3.3 Pass resolved Thinking controls into `getEngine(...)` so OpenAI Chat, OpenAI Responses, and Anthropic keep their existing protocol-specific request mappings.
- [x] 3.4 Update `Translator.tsx` cache-key construction and related `useCallback` dependency lists to use resolved Provider + Model `thinkingEnabled`, protocol-specific effort, `useStructuredOutput`, and `useStrictSchema` values instead of global settings fields.

## 4. Tests and Verification

- [x] 4.1 Update settings normalization tests for missing records, legacy migration defaults, valid saved records, duplicate records, and invalid efforts.
- [x] 4.2 Update settings/UI-adjacent tests or component-level coverage for model switching so output controls do not leak from one provider + model to another.
- [x] 4.3 Update translation and protocol tests to cover missing ProviderModelOutputControls, enabled Thinking per provider + model, enabled Structured Output per provider + model, explicit query `providerId/model` that differs from `defaultModel`, and cache-key isolation for both Thinking and Structured Output controls.
- [x] 4.4 Run `openspec validate provider-model-output-controls --strict`, `pnpm exec vitest run`, `pnpm exec tsc --noEmit`, and targeted lint for changed files.
