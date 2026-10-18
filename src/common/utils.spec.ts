import { describe, expect, it, vi } from 'vitest'
import browser from 'webextension-polyfill'
import {
    normalizeSettings,
    resolveProviderModelOutputControls,
    resolveAutomaticTargetLanguage,
    resolveTargetLanguageForSource,
    sanitizeSettingsForStorage,
    setSettings,
} from './utils'
import { ISettings, ProviderConfig } from './types'

vi.mock('webextension-polyfill', () => ({
    default: { storage: { sync: { get: vi.fn(), set: vi.fn(async () => {}) } } },
}))

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

    it('turns Markdown rendering on only for a stored boolean true', () => {
        expect(normalizeSettings({}).renderMarkdown).toBe(false)
        for (const renderMarkdown of [false, null, 'true', 1, {}]) {
            expect(normalizeSettings({ renderMarkdown } as Record<string, unknown>).renderMarkdown).toBe(false)
        }
        expect(normalizeSettings({ renderMarkdown: true }).renderMarkdown).toBe(true)
    })

    it('writes the Markdown rendering preference in both states', () => {
        expect(sanitizeSettingsForStorage({ renderMarkdown: true }, {}).renderMarkdown).toBe(true)
        expect(sanitizeSettingsForStorage({ renderMarkdown: false }, {}).renderMarkdown).toBe(false)
        expect(sanitizeSettingsForStorage({}, {})).not.toHaveProperty('renderMarkdown')
    })

    it('does not migrate the old default target language', () => {
        const settings = normalizeSettings({
            defaultTargetLanguage: 'ja',
        })

        expect(settings.nativeLanguage).toBe('zh-Hans')
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
            reasoningEffort: 'high' as const,
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
        expect(settings.providers[0]).not.toHaveProperty('reasoningEffort')
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

    it('keeps the provider in use without a model instead of falling back to another provider', () => {
        const withModel = {
            id: 'provider-1',
            name: 'Primary',
            protocol: 'openai-chat' as const,
            apiKey: 'sk-test',
            model: 'gpt-4o-mini',
        }
        const withoutModel = {
            id: 'provider-2',
            name: 'Secondary',
            protocol: 'anthropic' as const,
            apiKey: 'sk-ant',
            model: '',
        }
        const raw = {
            providers: [withModel, withoutModel],
            defaultProviderId: withoutModel.id,
            defaultModel: null,
        }

        expect(normalizeSettings(raw).defaultModel).toBeNull()
        expect(sanitizeSettingsForStorage(raw, {})).toMatchObject({
            defaultProviderId: withoutModel.id,
            defaultModel: null,
        })
    })

    it('falls back to the model of the provider in use when defaultModel is invalid', () => {
        const first = {
            id: 'provider-1',
            name: 'Primary',
            protocol: 'openai-chat' as const,
            apiKey: 'sk-test',
            model: 'gpt-4o-mini',
        }
        const second = { ...first, id: 'provider-2', name: 'Secondary', model: 'gpt-5' }
        const settings = normalizeSettings({
            providers: [first, second],
            defaultProviderId: second.id,
            defaultModel: { providerId: 'deleted-provider', model: 'gpt-4o' },
        })

        expect(settings.defaultModel).toEqual({ providerId: second.id, model: second.model })
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
                    reasoningEffort: 'low',
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
                    reasoningEffort: 'xhigh',
                    useStructuredOutput: true,
                },
                {
                    providerId: provider.id,
                    model: 'custom-model',
                    reasoningEffort: 'high',
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
                reasoningEffort: 'high',
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
                    reasoningEffort: 'high',
                    useStructuredOutput: true,
                },
            ],
        })

        expect(resolveProviderModelOutputControls(settings, provider.id, 'missing-model')).toEqual({
            thinkingEnabled: false,
            reasoningEffort: undefined,
            useStructuredOutput: false,
            useStrictSchema: true,
        })
        expect(resolveProviderModelOutputControls(settings, provider.id, provider.model)).toEqual({
            thinkingEnabled: true,
            reasoningEffort: 'high',
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
                    reasoningEffort: 'high',
                    useStructuredOutput: true,
                },
                {
                    providerId: provider.id,
                    model: 'model-b',
                    thinkingEnabled: false,
                    reasoningEffort: 'low',
                    useStructuredOutput: false,
                },
            ],
        })

        expect(resolveProviderModelOutputControls(settings, provider.id, 'model-a')).toMatchObject({
            thinkingEnabled: true,
            reasoningEffort: 'high',
            useStructuredOutput: true,
        })
        expect(resolveProviderModelOutputControls(settings, provider.id, 'model-b')).toMatchObject({
            thinkingEnabled: false,
            reasoningEffort: 'low',
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
        const sanitized = sanitizeSettingsForStorage(
            {
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
            },
            {}
        )

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

    it('writes only the given fields on top of stored settings', () => {
        const provider = {
            id: 'provider-1',
            name: 'Primary',
            protocol: 'openai-chat' as const,
            apiKey: 'sk-test',
            model: 'gpt-4o-mini',
        }
        const stored = {
            providers: [provider],
            defaultProviderId: provider.id,
            defaultModel: { providerId: provider.id, model: provider.model },
            fontSize: 18,
        }

        expect(sanitizeSettingsForStorage({ renderMarkdown: true }, stored)).toEqual({ renderMarkdown: true })
    })

    it('validates a model switch against the stored providers', () => {
        const first = {
            id: 'provider-1',
            name: 'Primary',
            protocol: 'openai-chat' as const,
            apiKey: 'sk-test',
            model: 'gpt-4o-mini',
            modelOptions: [],
        }
        const second = { ...first, id: 'provider-2', name: 'Secondary', model: 'gpt-5' }
        const stored = { providers: [first, second], defaultProviderId: first.id }

        expect(
            sanitizeSettingsForStorage(
                { defaultProviderId: second.id, defaultModel: { providerId: second.id, model: 'gpt-5.5' } },
                stored
            )
        ).toEqual({
            defaultProviderId: second.id,
            defaultModel: { providerId: second.id, model: 'gpt-5.5' },
        })
        expect(
            sanitizeSettingsForStorage(
                { defaultProviderId: 'deleted', defaultModel: { providerId: 'deleted', model: 'gpt-4o' } },
                stored
            )
        ).toMatchObject({
            defaultProviderId: first.id,
            defaultModel: { providerId: first.id, model: first.model },
        })
    })

    it('ignores a legacy default target language write', () => {
        expect(sanitizeSettingsForStorage({ defaultTargetLanguage: 'en' }, {})).toEqual({})
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
        const sanitized = sanitizeSettingsForStorage(
            {
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
            },
            {}
        )

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

describe('OpenAI TTS fallback when providers change', () => {
    const p1: ProviderConfig = { id: 'p1', name: 'Speech', protocol: 'openai-chat', apiKey: 'k1', model: 'gpt-5' }
    const p2: ProviderConfig = { id: 'p2', name: 'Other', protocol: 'openai-responses', apiKey: 'k2', model: 'gpt-5' }
    const openAITTS = (providerId: string): ISettings['tts'] => ({
        provider: 'openai',
        rate: 12,
        openai: { providerId, model: 'gpt-4o-mini-tts', voice: 'coral' },
    })

    it('falls the stored TTS settings back to Edge TTS when the linked Provider is deleted', () => {
        const stored = { providers: [p1, p2], tts: openAITTS('p1') }

        expect(sanitizeSettingsForStorage({ providers: [p2] }, stored).tts).toEqual({
            ...openAITTS('p1'),
            provider: 'edge',
        })
    })

    it('falls back when the linked Provider switches to the Anthropic protocol', () => {
        const stored = { providers: [p1, p2], tts: openAITTS('p1') }

        expect(
            sanitizeSettingsForStorage({ providers: [{ ...p1, protocol: 'anthropic' }, p2] }, stored).tts?.provider
        ).toBe('edge')
    })

    it('does not write TTS settings when an unlinked Provider is deleted', () => {
        const stored = { providers: [p1, p2], tts: openAITTS('p1') }

        expect(sanitizeSettingsForStorage({ providers: [p1] }, stored)).not.toHaveProperty('tts')
    })

    it.each([
        ['system TTS', { provider: 'system' as const }],
        ['OpenAI TTS on a remaining Provider', openAITTS('p2')],
    ])('keeps TTS settings saved elsewhere as %s', (_name, tts) => {
        const stored = { providers: [p1, p2], tts }

        expect(sanitizeSettingsForStorage({ providers: [p2] }, stored)).not.toHaveProperty('tts')
    })
})

describe('settings writes', () => {
    it('reads once and writes once, without deleting legacy keys', async () => {
        vi.mocked(browser.storage.sync.get).mockResolvedValueOnce({ fontSize: 15, apiKeys: 'sk-legacy' })

        await expect(setSettings({ fontSize: 18 })).resolves.toEqual({ fontSize: 18 })
        expect(browser.storage.sync.get).toHaveBeenCalledOnce()
        expect(browser.storage.sync.set).toHaveBeenCalledOnce()
        expect(browser.storage.sync.set).toHaveBeenCalledWith({ fontSize: 18 })
    })
})
