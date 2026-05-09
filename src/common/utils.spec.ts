import { describe, expect, it } from 'vitest'
import { normalizeSettings, sanitizeSettingsForStorage } from './utils'

describe('settings schema normalization', () => {
    it('initializes a fresh install with empty providers', () => {
        const settings = normalizeSettings({})

        expect(settings.providers).toEqual([])
        expect(settings.defaultProviderId).toBeNull()
        expect(settings.languageDetectionEngine).toBe('local')
        expect(settings.tts?.provider).toBe('edge')
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

    it('does not invent provider thinking fields for old configs', () => {
        const provider = {
            id: 'provider-1',
            name: 'Primary',
            protocol: 'openai-chat' as const,
            apiKey: 'sk-test',
            model: 'gpt-4o-mini',
        }
        const settings = normalizeSettings({
            providers: [provider],
            defaultProviderId: provider.id,
        })

        expect(settings.providers[0]).toEqual({ ...provider, modelOptions: [] })
        expect(settings.providers[0].thinkingEnabled).not.toBe(true)
    })

    it('preserves valid provider thinking effort values without inventing missing defaults', () => {
        const provider = {
            id: 'provider-1',
            name: 'Primary',
            protocol: 'anthropic' as const,
            apiKey: 'sk-ant',
            model: 'claude-sonnet-4-6',
            thinkingEnabled: true,
            anthropicThinkingEffort: 'max' as const,
        }
        const settings = normalizeSettings({
            providers: [provider],
            defaultProviderId: provider.id,
        })

        expect(settings.providers[0]).toEqual({
            ...provider,
            modelOptions: [],
        })
        expect(settings.providers[0]).not.toHaveProperty('openaiReasoningEffort')
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
