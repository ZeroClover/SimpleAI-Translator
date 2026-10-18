/* eslint-disable @typescript-eslint/no-explicit-any */
import { createParser } from 'eventsource-parser'
import {
    IBrowser,
    ISettings,
    ModelSelection,
    ProviderModelOutputControls,
    ProviderConfig,
    ReasoningEffort,
} from './types'
import { getUniversalFetch } from './universal-fetch'

export const defaultNativeLanguage = 'zh-Hans'
export const defaultTranslationTargetLanguage = 'en'
export const defaulti18n = 'en'

type RawSettings = Partial<ISettings> & Record<string, unknown>

const settingKeys = {
    automaticCheckForUpdates: 1,
    providers: 1,
    defaultProviderId: 1,
    defaultModel: 1,
    providerModelOutputControls: 1,
    enableBackgroundBlur: 1,
    nativeLanguage: 1,
    translationTargetLanguage: 1,
    themeType: 1,
    i18n: 1,
    tts: 1,
    restorePreviousPosition: 1,
    runAtStartup: 1,
    pinned: 1,
    languageDetectionEngine: 1,
    proxy: 1,
    fontSize: 1,
    renderMarkdown: 1,
} satisfies Partial<Record<keyof ISettings, number>>

function getStringSetting(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined
}

function getComparableLanguageCode(language: string): string {
    if (language.startsWith('en-')) {
        return 'en'
    }
    if (language === 'ko-banmal') {
        return 'ko'
    }
    return language
}

export function areSameLanguageForTargetSelection(sourceLanguage: string, configuredLanguage: string): boolean {
    return getComparableLanguageCode(sourceLanguage) === getComparableLanguageCode(configuredLanguage)
}

export function getDefaultTranslationTargetLanguage(nativeLanguage: string): string {
    return areSameLanguageForTargetSelection(nativeLanguage, defaultTranslationTargetLanguage)
        ? defaultNativeLanguage
        : defaultTranslationTargetLanguage
}

export function resolveAutomaticTargetLanguage(
    sourceLanguage: string,
    nativeLanguage: string,
    translationTargetLanguage: string
): string {
    return areSameLanguageForTargetSelection(sourceLanguage, nativeLanguage)
        ? translationTargetLanguage
        : nativeLanguage
}

export function resolveTargetLanguageForSource(
    sourceLanguage: string,
    currentTargetLanguage: string | undefined,
    manualTargetLanguageSource: string | null,
    nativeLanguage: string,
    translationTargetLanguage: string
): { targetLanguage: string; manualTargetLanguageSource: string | null } {
    const shouldKeepManualTarget =
        !!currentTargetLanguage &&
        !!manualTargetLanguageSource &&
        areSameLanguageForTargetSelection(sourceLanguage, manualTargetLanguageSource)

    if (shouldKeepManualTarget) {
        return {
            targetLanguage: currentTargetLanguage,
            manualTargetLanguageSource,
        }
    }

    return {
        targetLanguage: resolveAutomaticTargetLanguage(sourceLanguage, nativeLanguage, translationTargetLanguage),
        manualTargetLanguageSource: null,
    }
}

function normalizeProviderList(providers: unknown): ProviderConfig[] {
    if (!Array.isArray(providers)) {
        return []
    }
    return providers.map((provider) => {
        const item = provider as ProviderConfig
        const modelOptions = Array.isArray(item.modelOptions)
            ? item.modelOptions.filter((model): model is string => typeof model === 'string' && model.trim() !== '')
            : []
        const model = typeof item.model === 'string' ? item.model : (modelOptions[0] ?? '')
        return {
            id: item.id,
            name: item.name,
            protocol: item.protocol,
            apiKey: item.apiKey,
            ...(item.endpoint ? { endpoint: item.endpoint } : {}),
            model,
            modelOptions,
            ...(item.extraHeaders ? { extraHeaders: item.extraHeaders } : {}),
        }
    })
}

const reasoningEfforts = new Set<ReasoningEffort>(['low', 'medium', 'high'])

function normalizeDefaultModel(
    rawDefaultModel: unknown,
    providers: ProviderConfig[],
    defaultProviderId: string | null
): ModelSelection | null {
    const defaultModel = rawDefaultModel as Partial<ModelSelection> | undefined
    if (
        defaultModel &&
        typeof defaultModel.providerId === 'string' &&
        typeof defaultModel.model === 'string' &&
        providers.some((provider) => provider.id === defaultModel.providerId) &&
        defaultModel.model.trim()
    ) {
        return {
            providerId: defaultModel.providerId,
            model: defaultModel.model,
        }
    }
    // Fall back only to the provider in use: without a model there, the UI asks the user to
    // pick one instead of silently switching to another provider.
    const fallbackProvider = providers.find((provider) => provider.id === defaultProviderId)
    if (!fallbackProvider || !fallbackProvider.model.trim()) {
        return null
    }
    return {
        providerId: fallbackProvider.id,
        model: fallbackProvider.model,
    }
}

function normalizeProviderModelOutputControls(
    controls: unknown,
    providers: ProviderConfig[]
): ProviderModelOutputControls[] {
    if (!Array.isArray(controls)) {
        return []
    }
    const providerIds = new Set(providers.map((provider) => provider.id))
    const records = new Map<string, ProviderModelOutputControls>()
    for (const control of controls) {
        const item = control as Partial<ProviderModelOutputControls>
        if (
            !item ||
            typeof item.providerId !== 'string' ||
            !providerIds.has(item.providerId) ||
            typeof item.model !== 'string' ||
            !item.model.trim()
        ) {
            continue
        }
        const reasoningEffort = reasoningEfforts.has(String(item.reasoningEffort) as ReasoningEffort)
            ? item.reasoningEffort
            : undefined
        const normalized: ProviderModelOutputControls = {
            providerId: item.providerId,
            model: item.model,
            ...(typeof item.thinkingEnabled === 'boolean' ? { thinkingEnabled: item.thinkingEnabled } : {}),
            ...(reasoningEffort ? { reasoningEffort } : {}),
            ...(typeof item.useStructuredOutput === 'boolean' ? { useStructuredOutput: item.useStructuredOutput } : {}),
            ...(typeof item.useStrictSchema === 'boolean' ? { useStrictSchema: item.useStrictSchema } : {}),
        }
        records.set(`${normalized.providerId}\n${normalized.model}`, normalized)
    }
    return Array.from(records.values())
}

export interface ResolvedProviderModelOutputControls {
    thinkingEnabled: boolean
    reasoningEffort?: ReasoningEffort
    useStructuredOutput: boolean
    useStrictSchema: boolean
}

export function resolveProviderModelOutputControls(
    settings: Pick<ISettings, 'providerModelOutputControls'>,
    providerId: string | null | undefined,
    model: string | null | undefined
): ResolvedProviderModelOutputControls {
    const record = settings.providerModelOutputControls?.find(
        (item) => item.providerId === providerId && item.model === model
    )
    const useStructuredOutput = record?.useStructuredOutput === true
    return {
        thinkingEnabled: record?.thinkingEnabled === true,
        reasoningEffort: record?.reasoningEffort,
        useStructuredOutput,
        useStrictSchema: useStructuredOutput ? record.useStrictSchema !== false : true,
    }
}

// Only OpenAI-compatible Providers offer the speech endpoint used by OpenAI TTS.
export function canProvideTTS(provider: ProviderConfig): boolean {
    return provider.protocol === 'openai-chat' || provider.protocol === 'openai-responses'
}

function hasDanglingOpenAITTSProvider(tts: ISettings['tts'] | undefined, providers: ProviderConfig[]): boolean {
    if (tts?.provider !== 'openai' || typeof tts.openai?.providerId !== 'string') {
        return false
    }
    const provider = providers.find((item) => item.id === tts.openai?.providerId)
    return !provider || !canProvideTTS(provider)
}

function normalizeTTSSettings(tts: unknown, providers: ProviderConfig[]): ISettings['tts'] {
    if (!tts || typeof tts !== 'object') {
        return { provider: 'edge' }
    }

    const settings = tts as ISettings['tts'] & { provider?: unknown }
    const provider =
        settings.provider === 'edge' || settings.provider === 'system' || settings.provider === 'openai'
            ? settings.provider
            : 'edge'

    const normalized = {
        ...settings,
        provider,
    }

    if (hasDanglingOpenAITTSProvider(normalized, providers)) {
        return {
            ...normalized,
            provider: 'edge',
        }
    }

    return normalized
}

export function normalizeSettings(rawSettings: RawSettings): ISettings {
    const providers = normalizeProviderList(rawSettings.providers)
    const defaultProviderId =
        typeof rawSettings.defaultProviderId === 'string' &&
        providers.some((provider) => provider.id === rawSettings.defaultProviderId)
            ? rawSettings.defaultProviderId
            : (providers[0]?.id ?? null)
    const nativeLanguage = getStringSetting(rawSettings.nativeLanguage) ?? defaultNativeLanguage
    const translationTargetLanguage =
        getStringSetting(rawSettings.translationTargetLanguage) ?? getDefaultTranslationTargetLanguage(nativeLanguage)

    return {
        automaticCheckForUpdates:
            rawSettings.automaticCheckForUpdates === undefined || rawSettings.automaticCheckForUpdates === null
                ? true
                : rawSettings.automaticCheckForUpdates,
        providers,
        defaultProviderId,
        defaultModel: normalizeDefaultModel(rawSettings.defaultModel, providers, defaultProviderId),
        providerModelOutputControls: normalizeProviderModelOutputControls(
            rawSettings.providerModelOutputControls,
            providers
        ),
        enableBackgroundBlur: rawSettings.enableBackgroundBlur ?? false,
        nativeLanguage,
        translationTargetLanguage,
        themeType: rawSettings.themeType || 'followTheSystem',
        i18n: rawSettings.i18n || defaulti18n,
        tts: normalizeTTSSettings(rawSettings.tts, providers),
        restorePreviousPosition: rawSettings.restorePreviousPosition,
        runAtStartup: rawSettings.runAtStartup,
        pinned: rawSettings.pinned,
        languageDetectionEngine: rawSettings.languageDetectionEngine || 'local',
        proxy: rawSettings.proxy ?? {
            enabled: false,
            protocol: 'HTTP',
            server: '127.0.0.1',
            port: '1080',
            basicAuth: {
                username: '',
                password: '',
            },
            noProxy: 'localhost,127.0.0.1',
        },
        fontSize: rawSettings.fontSize ?? 15,
        renderMarkdown: rawSettings.renderMarkdown === true,
    } as ISettings
}

// Normalizes `settings` on top of the currently stored settings and returns only the keys the
// caller wrote, so a partial write never replaces fields saved elsewhere. A write that touches
// providers or the selection also writes the normalized selection, which is validated against
// providers; providers themselves are written only when the caller supplies them. When new
// providers leave the stored OpenAI TTS settings without a usable Provider, the stored TTS
// settings fall back to Edge TTS in the same write.
export function sanitizeSettingsForStorage(settings: RawSettings, storedSettings: RawSettings): Partial<ISettings> {
    const normalized = normalizeSettings({ ...storedSettings, ...settings })
    const has = (key: string) => Object.prototype.hasOwnProperty.call(settings, key)
    const writesProviderSelection = has('providers') || has('defaultProviderId') || has('defaultModel')
    const ttsFallsBack =
        has('providers') &&
        !has('tts') &&
        normalizeSettings(storedSettings).tts?.provider === 'openai' &&
        normalized.tts?.provider === 'edge'
    const sanitized: Record<string, unknown> = {}

    for (const key of Object.keys(settingKeys) as Array<keyof typeof settingKeys>) {
        if (
            has(key) ||
            (writesProviderSelection && (key === 'defaultProviderId' || key === 'defaultModel')) ||
            (ttsFallsBack && key === 'tts')
        ) {
            sanitized[key] = normalized[key]
        }
    }

    return sanitized as Partial<ISettings>
}

export async function getSettings(): Promise<ISettings> {
    const browser = await getBrowser()
    const items = await browser.storage.sync.get(Object.keys(settingKeys))

    return normalizeSettings(items)
}

// Persists only the fields in `settings` with one storage write; fields it omits keep their stored
// values. Returns the fields as written.
export async function setSettings(settings: Partial<ISettings>): Promise<Partial<ISettings>> {
    const browser = await getBrowser()
    const storedSettings = await browser.storage.sync.get(Object.keys(settingKeys))
    const sanitized = sanitizeSettingsForStorage(settings, storedSettings)
    await browser.storage.sync.set(sanitized)
    return sanitized
}

export async function getBrowser(): Promise<IBrowser> {
    if (isTauri()) {
        return (await import('./polyfills/tauri')).tauriBrowser
    }
    return (await import('webextension-polyfill')).default
}

export const isTauri = () => {
    if (typeof window === 'undefined') {
        return false
    }
    return window['__TAURI__' as any] !== undefined
}

export const isBrowserExtensionOptions = () => {
    if (typeof window === 'undefined') {
        return false
    }
    return window['__IS_OT_BROWSER_EXTENSION_OPTIONS__' as any] !== undefined
}

export const isBrowserExtensionContentScript = () => {
    if (typeof window === 'undefined') {
        return false
    }
    return window['__IS_OT_BROWSER_EXTENSION_CONTENT_SCRIPT__' as any] !== undefined
}

export const isFirefox = () => /firefox/i.test(navigator.userAgent)

interface FetchSSEOptions extends RequestInit {
    onMessage(data: string): Promise<void>
    // Receives the complete error body of a non-200 response, parsed as JSON when possible.

    onError(error: any): void
    onStatusCode?: (statusCode: number) => void
    // When set, a successful response with a JSON media type is read whole and passed here
    // instead of being parsed as SSE.
    onJSONResponse?: (data: unknown) => Promise<void>
    fetcher?: (input: string, options: RequestInit) => Promise<Response>
}

function isJSONMediaType(contentType: string | null | undefined): boolean {
    const mediaType = contentType?.split(';')[0].trim()
    return !!mediaType && /^application\/(?:[^\s/]+\+)?json$/i.test(mediaType)
}

function createUTF8Decoder() {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    return (chunk?: Uint8Array) => {
        try {
            return chunk ? decoder.decode(chunk, { stream: true }) : decoder.decode()
        } catch {
            throw new Error('The response body is not valid UTF-8.')
        }
    }
}

// Consumes one decoded response body. SSE events are delivered one at a time: each push
// resolves only after every event it completed has been handled.
function createResponseConsumer(
    status: number,
    contentType: string | null | undefined,
    { onMessage, onError, onJSONResponse }: Pick<FetchSSEOptions, 'onMessage' | 'onError' | 'onJSONResponse'>
) {
    const mode = status !== 200 ? 'error' : onJSONResponse && isJSONMediaType(contentType) ? 'json' : 'sse'
    const events: string[] = []
    const sseParser = createParser((event) => {
        if (event.type === 'event') {
            events.push(event.data)
        }
    })
    let body = ''
    return {
        async push(text: string) {
            if (mode !== 'sse') {
                body += text
                return
            }
            sseParser.feed(text)
            for (const data of events.splice(0)) {
                await onMessage(data)
            }
        },
        async end() {
            if (mode === 'error') {
                // An empty body leaves the engine's "Unknown error" fallback to report.
                let error: unknown = body.trim() || undefined
                try {
                    error = JSON.parse(body)
                } catch {
                    // Not a JSON error body; report the text.
                }
                onError(error)
                return
            }
            if (mode === 'json' && onJSONResponse) {
                let data: unknown
                try {
                    data = JSON.parse(body)
                } catch {
                    throw new Error('The response is not valid JSON.')
                }
                await onJSONResponse(data)
            }
        },
    }
}

export async function fetchSSE(input: string, options: FetchSSEOptions) {
    const { onMessage, onError, onStatusCode, onJSONResponse, fetcher = getUniversalFetch(), ...fetchOptions } = options
    const { signal } = fetchOptions
    const abortError = () => new DOMException('Aborted', 'AbortError')
    if (signal?.aborted) {
        throw abortError()
    }
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    // Cancelling the reader ends a pending read at once, even if the transport never settles it.
    const cancelReader = () => {
        reader?.cancel().catch(() => {})
    }
    signal?.addEventListener('abort', cancelReader, { once: true })
    try {
        const resp = await fetcher(input, fetchOptions)
        onStatusCode?.(resp.status)
        const consumer = createResponseConsumer(resp.status, resp.headers.get('content-type'), {
            onMessage,
            onError,
            onJSONResponse,
        })
        reader = resp.body?.getReader()
        if (reader) {
            const decode = createUTF8Decoder()

            while (true) {
                if (signal?.aborted) {
                    throw abortError()
                }
                const { done, value } = await reader.read()
                if (done) {
                    break
                }
                await consumer.push(decode(value))
            }
            if (signal?.aborted) {
                throw abortError()
            }
            await consumer.push(decode())
        }
        await consumer.end()
    } catch (error) {
        await reader?.cancel().catch(() => {})
        throw signal?.aborted ? abortError() : error
    } finally {
        signal?.removeEventListener('abort', cancelReader)
        reader?.releaseLock()
    }
}

export function getAssetUrl(asset: string) {
    return new URL(asset, import.meta.url).href
}
export const isMacOS = navigator.userAgent.includes('Mac OS X')
export const isWindows = navigator.userAgent.includes('Windows')
