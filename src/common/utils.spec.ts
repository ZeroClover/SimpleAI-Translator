import { describe, expect, it } from 'vitest'
import {
    normalizeSettings,
    resolveProviderModelOutputControls,
    resolveAutomaticTargetLanguage,
    resolveTargetLanguageForSource,
    sanitizeSettingsForStorage,
} from './utils'

describe('settings schema normalization', () => {
    it('initializes a fresh install with empty providers', () => {
        const settings = normalizeSettings({})

        expect(settings.providers).toEqual([])
        expect(settings.defaultProviderId).toBeNull()
        expect(settings.nativeLanguage).toBe('zh-Hans')
        expect(settings.translationTargetLanguage).toBe('en')
        expect(settings.languageDetectionEngine).toBe('local')
        expect(settings.tts?.provider).toBe('edge')
    })

    it('migrates the old default target language to native language', () => {
        const settings = normalizeSettings({
            defaultTargetLanguage: 'ja',
        })

        expect(settings.nativeLanguage).toBe('ja')
        expect(settings.translationTargetLanguage).toBe('en')
        expect(settings).not.toHaveProperty('defaultTargetLanguage')
    })

    it('uses Chinese as the default translation target for English native language', () => {
        const settings = normalizeSettings({
            nativeLanguage: 'en',
        })

        expect(settings.nativeLanguage).toBe('en')
        expect(settings.translationTargetLanguage).toBe('zh-Hans')
    })

    it('resolves the automatic target from native and translation target languages', () => {
        expect(resolveAutomaticTargetLanguage('ja', 'zh-Hans', 'en')).toBe('zh-Hans')
        expect(resolveAutomaticTargetLanguage('zh-Hans', 'zh-Hans', 'en')).toBe('en')
        expect(resolveAutomaticTargetLanguage('en', 'en-US', 'zh-Hans')).toBe('zh-Hans')
    })

    it('keeps a manually selected target only while the source language is unchanged', () => {
        expect(resolveTargetLanguageForSource('zh-Hans', 'ja', 'zh-Hans', 'zh-Hans', 'en')).toEqual({
            targetLanguage: 'ja',
            manualTargetLanguageSource: 'zh-Hans',
        })
        expect(resolveTargetLanguageForSource('en', 'ja', 'zh-Hans', 'zh-Hans', 'en')).toEqual({
            targetLanguage: 'zh-Hans',
            manualTargetLanguageSource: null,
        })
    })

    it('does not migrate legacy OpenAI fields', () => {
        const settings = normalizeSettings({
            provider: 'OpenAI',
            apiKeys: 'sk-legacy',
            apiModel: 'gpt-4o',
        })

        expect(settings.providers).toEqual([])
        expect(settings.defaultProviderId).toBeNull()
        expect(settings).not.toHaveProperty('provider')
        expect(settings).not.toHaveProperty('apiKeys')
        expect(settings).not.toHaveProperty('apiModel')
    })

    it('does not migrate legacy Azure fields', () => {
        const settings = normalizeSettings({
            provider: 'Azure',
            azureAPIKeys: 'azure-key',
            azureAPIURL: 'https://example.openai.azure.com',
            azureAPIModel: 'gpt-4o',
        })

        expect(settings.providers).toEqual([])
        expect(settings.defaultProviderId).toBeNull()
        expect(settings).not.toHaveProperty('azureAPIKeys')
        expect(settings).not.toHaveProperty('azureAPIURL')
        expect(settings).not.toHaveProperty('azureAPIModel')
    })

    it('does not fall back unknown legacy providers to ProviderConfig', () => {
        const settings = normalizeSettings({
            provider: 'SomeLegacyProvider',
            apiKeys: 'sk-legacy',
            apiModel: 'some-model',
        } as Record<string, unknown>)

        expect(settings.providers).toEqual([])
        expect(settings.defaultProviderId).toBeNull()
    })

    it('keeps an existing new schema unchanged', () => {
        const provider = {
            id: 'provider-1',
            name: 'Primary',
            protocol: 'openai-chat' as const,
            apiKey: 'sk-test',
            endpoint: 'https://api.example.com/v1',
            model: 'gpt-4o-mini',
        }
        const settings = normalizeSettings({
            providers: [provider],
            defaultProviderId: provider.id,
            provider: 'OpenAI',
            apiKeys: 'sk-legacy',
        })

        expect(settings.providers).toEqual([{ ...provider, modelOptions: [] }])
        expect(settings.defaultProviderId).toBe(provider.id)
        expect(settings.defaultModel).toEqual({
            providerId: provider.id,
            model: provider.model,
        })
    })

    it('does not keep thinking fields on providers', () => {
        const provider = {
            id: 'provider-1',
            name: 'Primary',
            protocol: 'openai-chat' as const,
            apiKey: 'sk-test',
            model: 'gpt-4o-mini',
            thinkingEnabled: true,
            openaiReasoningEffort: 'high' as const,
        }
        const settings = normalizeSettings({
            providers: [provider],
            defaultProviderId: provider.id,
        })

        expect(settings.providers[0]).toEqual({
            id: provider.id,
            name: provider.name,
            protocol: provider.protocol,
            apiKey: provider.apiKey,
            model: provider.model,
            modelOptions: [],
        })
        expect(settings.providers[0]).not.toHaveProperty('thinkingEnabled')
        expect(settings.providers[0]).not.toHaveProperty('openaiReasoningEffort')
    })

    it('drops legacy model thinking fields on defaultModel', () => {
        const provider = {
            id: 'provider-1',
            name: 'Primary',
            protocol: 'anthropic' as const,
            apiKey: 'sk-ant',
            model: 'claude-sonnet-4-6',
        }
        const settings = normalizeSettings({
            providers: [provider],
            defaultProviderId: provider.id,
            defaultModel: {
                providerId: provider.id,
                model: provider.model,
                thinkingEnabled: true,
                anthropicThinkingEffort: 'max',
            },
        } as Record<string, unknown>)

        expect(settings.defaultModel).toEqual({
            providerId: provider.id,
            model: provider.model,
        })
        expect(settings.providerModelOutputControls).toEqual([])
    })

    it('normalizes provider and model scoped output controls', () => {
        const provider = {
            id: 'provider-1',
            name: 'Primary',
            protocol: 'openai-responses' as const,
            apiKey: 'sk-test',
            model: 'gpt-4o-mini',
        }
        const settings = normalizeSettings({
            providers: [provider],
            providerModelOutputControls: [
                {
                    providerId: provider.id,
                    model: provider.model,
                    thinkingEnabled: true,
                    openaiReasoningEffort: 'low',
                    useStructuredOutput: true,
                    useStrictSchema: false,
                },
                {
                    providerId: 'missing',
                    model: provider.model,
                    thinkingEnabled: true,
                },
                {
                    providerId: provider.id,
                    model: '',
                    thinkingEnabled: true,
                },
                {
                    providerId: provider.id,
                    model: provider.model,
                    thinkingEnabled: false,
                    openaiReasoningEffort: 'invalid',
                    useStructuredOutput: true,
                },
                {
                    providerId: provider.id,
                    model: 'custom-model',
                    anthropicThinkingEffort: 'max',
                },
            ],
        } as Record<string, unknown>)

        expect(settings.providerModelOutputControls).toEqual([
            {
                providerId: provider.id,
                model: provider.model,
                thinkingEnabled: false,
                useStructuredOutput: true,
            },
            {
                providerId: provider.id,
                model: 'custom-model',
                anthropicThinkingEffort: 'max',
            },
        ])
    })

    it('resolves missing and saved provider model output controls', () => {
        const provider = {
            id: 'provider-1',
            name: 'Primary',
            protocol: 'anthropic' as const,
            apiKey: 'sk-ant',
            model: 'claude-sonnet-4-6',
        }
        const settings = normalizeSettings({
            providers: [provider],
            providerModelOutputControls: [
                {
                    providerId: provider.id,
                    model: provider.model,
                    thinkingEnabled: true,
                    anthropicThinkingEffort: 'xhigh',
                    useStructuredOutput: true,
                },
            ],
        })

        expect(resolveProviderModelOutputControls(settings, provider.id, 'missing-model')).toEqual({
            thinkingEnabled: false,
            openaiReasoningEffort: undefined,
            anthropicThinkingEffort: undefined,
            useStructuredOutput: false,
            useStrictSchema: true,
        })
        expect(resolveProviderModelOutputControls(settings, provider.id, provider.model)).toEqual({
            thinkingEnabled: true,
            openaiReasoningEffort: undefined,
            anthropicThinkingEffort: 'xhigh',
            useStructuredOutput: true,
            useStrictSchema: true,
        })
    })

    it('resolves model output controls without leaking between models', () => {
        const provider = {
            id: 'provider-1',
            name: 'Primary',
            protocol: 'openai-chat' as const,
            apiKey: 'sk-test',
            model: 'gpt-4o-mini',
        }
        const settings = normalizeSettings({
            providers: [provider],
            providerModelOutputControls: [
                {
                    providerId: provider.id,
                    model: 'model-a',
                    thinkingEnabled: true,
                    openaiReasoningEffort: 'high',
                    useStructuredOutput: true,
                },
                {
                    providerId: provider.id,
                    model: 'model-b',
                    thinkingEnabled: false,
                    openaiReasoningEffort: 'low',
                    useStructuredOutput: false,
                },
            ],
        })

        expect(resolveProviderModelOutputControls(settings, provider.id, 'model-a')).toMatchObject({
            thinkingEnabled: true,
            openaiReasoningEffort: 'high',
            useStructuredOutput: true,
        })
        expect(resolveProviderModelOutputControls(settings, provider.id, 'model-b')).toMatchObject({
            thinkingEnabled: false,
            openaiReasoningEffort: 'low',
            useStructuredOutput: false,
        })
    })

    it('sanitizes writes to the new settings schema', () => {
        const provider = {
            id: 'provider-1',
            name: 'Primary',
            protocol: 'anthropic' as const,
            apiKey: 'sk-ant',
            model: 'claude-sonnet-4-5',
        }
        const sanitized = sanitizeSettingsForStorage({
            providers: [provider],
            defaultProviderId: provider.id,
            providerModelOutputControls: [
                {
                    providerId: provider.id,
                    model: provider.model,
                    useStructuredOutput: true,
                    useStrictSchema: true,
                },
            ],
            provider: 'Azure',
            apiKeys: 'sk-legacy',
            azureAPIKeys: 'azure-key',
            defaultTranslateMode: 'legacy-mode',
        })

        expect(sanitized).toEqual({
            providers: [{ ...provider, modelOptions: [] }],
            defaultProviderId: provider.id,
            defaultModel: {
                providerId: provider.id,
                model: provider.model,
            },
            providerModelOutputControls: [
                {
                    providerId: provider.id,
                    model: provider.model,
                    useStructuredOutput: true,
                    useStrictSchema: true,
                },
            ],
        })
    })

    it('sanitizes legacy default target language writes to the new language settings', () => {
        const sanitized = sanitizeSettingsForStorage({
            defaultTargetLanguage: 'en',
        })

        expect(sanitized).toEqual({
            providers: [],
            defaultProviderId: null,
            defaultModel: null,
            nativeLanguage: 'en',
            translationTargetLanguage: 'zh-Hans',
        })
    })

    it('normalizes legacy TTS provider enum values', () => {
        const settings = normalizeSettings({
            tts: {
                provider: 'WebSpeech',
            },
        } as Record<string, unknown>)

        expect(settings.tts?.provider).toBe('edge')
    })

    it('falls OpenAI TTS back to edge when the referenced provider is missing', () => {
        const sanitized = sanitizeSettingsForStorage({
            providers: [],
            defaultProviderId: null,
            tts: {
                provider: 'openai',
                openai: {
                    providerId: 'missing-provider',
                    model: 'gpt-4o-mini-tts',
                    voice: 'alloy',
                },
            },
        })

        expect(sanitized.tts?.provider).toBe('edge')
        expect(sanitized.tts?.openai?.providerId).toBe('missing-provider')
    })

    it('falls OpenAI TTS back to edge when the referenced provider is Anthropic', () => {
        const provider = {
            id: 'provider-1',
            name: 'Anthropic',
            protocol: 'anthropic' as const,
            apiKey: 'sk-ant',
            model: 'claude-sonnet-4-5',
        }

        const settings = normalizeSettings({
            providers: [provider],
            defaultProviderId: provider.id,
            tts: {
                provider: 'openai',
                openai: {
                    providerId: provider.id,
                    model: 'gpt-4o-mini-tts',
                    voice: 'alloy',
                },
            },
        })

        expect(settings.tts?.provider).toBe('edge')
    })
})
