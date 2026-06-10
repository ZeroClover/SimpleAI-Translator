## Context

The app already separates provider credentials (`ProviderConfig`) from the current selected model (`ModelSelection`). Thinking controls are currently attached to `ModelSelection`, so they only follow the saved default model. Structured Output controls are global `ISettings` fields, so they apply to every provider and model.

The requested behavior is stricter: "Enable Thinking", "Thinking Effort", "Use Structured Output", and "Strict JSON Schema" are settings for a specific provider + model combination. A model with no saved record, including a user migrating from an older app version, must resolve to no Thinking and no Structured Output.

## Goals / Non-Goals

**Goals:**

- Persist output controls per `(providerId, model)` combination.
- Resolve Thinking and Structured Output from the active provider + model at translation time.
- Keep missing or legacy data conservative: no Thinking and no Structured Output.
- Preserve existing protocol behavior once controls are resolved: OpenAI Chat uses `reasoning_effort`, OpenAI Responses uses `reasoning`, Anthropic uses native thinking parameters, and Structured Output keeps the current provider-specific payload formats.

**Non-Goals:**

- No new provider protocols or vendor-specific engines.
- No migration that turns old global Structured Output or old default-model Thinking values into enabled provider + model records.
- No change to translation prompts, schema definitions, model filtering, or provider refresh behavior beyond passing the resolved controls.

## Decisions

### Store Controls as Provider + Model Records

Add a dedicated settings field such as:

```ts
interface ProviderModelOutputControls {
    providerId: string
    model: string
    thinkingEnabled?: boolean
    openaiReasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    anthropicThinkingEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
    useStructuredOutput?: boolean
    useStrictSchema?: boolean
}
```

`ISettings` stores `providerModelOutputControls?: ProviderModelOutputControls[]`. The array form avoids ambiguous string keys when custom model names contain separators, keeps records easy to normalize, and matches the app's current preference for explicit persisted objects.

Alternative considered: nesting by provider id and model name in an object map. That makes lookup fast, but it needs escaping rules for arbitrary model ids and is harder to inspect or migrate manually.

The new field must be added to the settings storage contract (`settingKeys`, `storageSettingKeys`, and `sanitizeSettingsForStorage`) so records survive saves and app restarts.

### Keep Provider Credentials Clean

`ProviderConfig` remains limited to connection, authentication, the default model string, and discovered model options. `ModelSelection` should identify the selected provider/model only; output controls are looked up from the dedicated provider + model store.

Alternative considered: continuing to store Thinking on `ModelSelection` and adding Structured Output there. That still only handles the default model record and loses settings for other provider/model combinations.

### Resolve Controls Through a Shared Helper

Add `resolveProviderModelOutputControls(settings, providerId, model)` in `src/common/utils.ts` and export it for Settings, Translator, and translate runtime code. The return shape should be a normalized object containing:

```ts
interface ResolvedProviderModelOutputControls {
    thinkingEnabled: boolean
    openaiReasoningEffort?: OpenAIReasoningEffort
    anthropicThinkingEffort?: AnthropicThinkingEffort
    useStructuredOutput: boolean
    useStrictSchema: boolean
}
```

The helper accepts `settings`, `providerId`, and `model` and returns normalized controls:

- `thinkingEnabled` resolves to `true` only when the saved provider + model record explicitly stores `true`.
- `useStructuredOutput` resolves to `true` only when the saved provider + model record explicitly stores `true`.
- `useStrictSchema` resolves to `true` when Structured Output is enabled and the record does not explicitly store `false`.
- OpenAI and Anthropic effort fields are preserved only if they are valid; UI defaults are used when the user enables Thinking without choosing an effort.

Translation, cache-key construction, and settings UI should call the same resolution logic instead of each applying its own fallback rules.

`translate()` must resolve the actual provider id and model before building Structured Output or Thinking request data. The selection priority remains: explicit query `providerId/model`, then `settings.defaultModel`, then `settings.defaultProviderId` with the provider's saved model.

`ModelSelection` remains an identifier shape for both persisted default selection and transient translator UI state. It should not carry output controls; the resolver supplies those controls from the dedicated provider + model records.

Model names are matched exactly and case-sensitively. Records for models that are not currently present in `modelOptions` are retained when the provider still exists, because users can manually enter custom model names. Records are garbage-collected when the provider no longer exists or the model name is blank.

### Persist Visible Defaults on First Enable

When the user enables Thinking or Structured Output for a provider + model, the save path should persist the value shown in the UI:

- OpenAI Thinking defaults to `openaiReasoningEffort: 'medium'`.
- Anthropic Thinking defaults to `anthropicThinkingEffort: 'high'`.
- Structured Output defaults to `useStrictSchema: true`.

This keeps stored records explicit after the first user action. The resolver still treats missing fields conservatively for migration and malformed data.

### Ignore Legacy Enabled Values During First Migration

Normalization should not convert old `settings.useStructuredOutput`, `settings.useStrictSchema`, or `defaultModel.thinkingEnabled` values into provider + model records. The first normalized settings after this change must remove or ignore those legacy fields for runtime behavior. This implements the requested migration default: missing provider + model records mean no Thinking and no Structured Output.

Alternative considered: preserving old enabled values for the old default model. That is user-friendly for continuity, but it contradicts the explicit migration rule and could send unsupported request parameters to a newly selected or renamed model.

### Keep Settings Persistence Centralized

`LLMProvidersSettings` should remain a controlled settings section. Extend its `onChange` flow to pass `providerModelOutputControls` back to the parent `InnerSettings` state and persistence path instead of letting the child component write settings directly. `mergeFormValues`, form initial values, and removed global Structured Output handlers must stop reintroducing `useStructuredOutput` or `useStrictSchema`.

### Put Editing Beside Model Selection

The settings UI should render the four controls in the LLM Provider/model area for the currently selected provider + model. Changing the model should load that exact combination's saved controls; it must not copy the previous model's controls into the new model automatically.

## Risks / Trade-offs

- [Risk] Existing users who enabled global Structured Output or default-model Thinking lose those enabled states after migration. -> Mitigation: this is intentional per the migration requirement; the UI still lets users re-enable controls per provider + model.
- [Risk] Duplicate records for the same provider + model could produce unclear results. -> Mitigation: normalization should collapse duplicates deterministically, with the last valid record winning.
- [Risk] Cache keys may reuse old results if they do not include resolved provider + model controls. -> Mitigation: build cache keys from resolved `thinkingEnabled`, protocol-specific effort, `useStructuredOutput`, `useStrictSchema`, and the structured-output mode.

## Migration Plan

1. Add the new provider + model output-control type and settings field.
2. Add the new field to the settings storage whitelist and sanitized write path.
3. Normalize existing settings so missing or legacy output controls produce an empty provider + model control list.
4. Update settings UI to read and write controls for the selected provider + model.
5. Update translation and cache-key construction to use resolved controls after the actual provider/model selection is known.
6. Remove legacy global/output-control fields from normalized runtime settings.

Rollback is straightforward: if the change is reverted, legacy global Structured Output and `ModelSelection` Thinking fields can be restored from the previous release behavior, but provider + model records created by this change would be ignored by the older app.

## Open Questions

- None.
