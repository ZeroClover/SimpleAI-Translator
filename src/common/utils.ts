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
import { v4 as uuidv4 } from 'uuid'
import { listen, Event, emit } from '@tauri-apps/api/event'
import { commands } from '@/tauri/bindings'
import toast from 'react-hot-toast'

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
    enableMica: 1,
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

const legacySettingKeys = [
    'defaultTargetLanguage',
    'apiKeys',
    'apiURL',
    'apiURLPath',
    'apiModel',
    'provider',
    'chatgptModel',
    'azureAPIKeys',
    'azureAPIURL',
    'azureAPIURLPath',
    'azureAPIModel',
    'azMaxWords',
    'miniMaxGroupID',
    'miniMaxAPIKey',
    'miniMaxAPIModel',
    'geminiAPIURL',
    'geminiAPIKey',
    'geminiAPIModel',
    'moonshotAPIKey',
    'moonshotAPIModel',
    'deepSeekAPIKey',
    'deepSeekAPIModel',
    'defaultTranslateMode',
    'writingTargetLanguage',
    'writingHotkey',
    'writingNewlineHotkey',
    'ocrHotkey',
    'autoCollect',
    'customModelName',
    'ollamaAPIURL',
    'ollamaAPIModel',
    'ollamaCustomModelName',
    'ollamaModelLifetimeInMemory',
    'groqAPIURL',
    'groqAPIURLPath',
    'groqAPIModel',
    'groqAPIKey',
    'groqCustomModelName',
    'claudeAPIURL',
    'claudeAPIURLPath',
    'claudeAPIModel',
    'claudeAPIKey',
    'claudeCustomModelName',
    'kimiAccessToken',
    'kimiRefreshToken',
    'chatglmAccessToken',
    'chatglmRefreshToken',
    'cohereAPIKey',
    'cohereAPIModel',
    'cerebrasAPIKey',
    'cerebrasAPIModel',
    'noModelsAPISupport',
    'claudeThinking',
    'claudeThinkingLevel',
] as const

const migrationSettingKeys = {
    defaultTargetLanguage: 1,
}

const storageSettingKeys = {
    ...settingKeys,
    ...migrationSettingKeys,
}

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
        const model = typeof item.model === 'string' ? item.model : modelOptions[0] ?? ''
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

function hasDanglingOpenAITTSProvider(tts: ISettings['tts'] | undefined, providers: ProviderConfig[]): boolean {
    if (tts?.provider !== 'openai' || typeof tts.openai?.providerId !== 'string') {
        return false
    }
    const provider = providers.find((item) => item.id === tts.openai?.providerId)
    return !provider || provider.protocol === 'anthropic'
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
            : providers[0]?.id ?? null
    const nativeLanguage =
        getStringSetting(rawSettings.nativeLanguage) ??
        getStringSetting(rawSettings.defaultTargetLanguage) ??
        defaultNativeLanguage
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
        enableMica: rawSettings.enableMica ?? false,
        enableBackgroundBlur:
            rawSettings.enableBackgroundBlur === undefined || rawSettings.enableBackgroundBlur === null
                ? rawSettings.enableMica ?? false
                : rawSettings.enableBackgroundBlur,
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
// providers; providers themselves are written only when the caller supplies them.
export function sanitizeSettingsForStorage(settings: RawSettings, storedSettings: RawSettings): Partial<ISettings> {
    const normalized = normalizeSettings({ ...storedSettings, ...settings })
    const has = (key: string) => Object.prototype.hasOwnProperty.call(settings, key)
    const hasLegacyDefaultTargetLanguage = has('defaultTargetLanguage')
    const writesProviderSelection = has('providers') || has('defaultProviderId') || has('defaultModel')
    const sanitized: Record<string, unknown> = {}

    for (const key of Object.keys(settingKeys) as Array<keyof typeof settingKeys>) {
        if (
            has(key) ||
            (writesProviderSelection && (key === 'defaultProviderId' || key === 'defaultModel')) ||
            (hasLegacyDefaultTargetLanguage && (key === 'nativeLanguage' || key === 'translationTargetLanguage'))
        ) {
            sanitized[key] = normalized[key]
        }
    }

    return sanitized as Partial<ISettings>
}

export async function getSettings(): Promise<ISettings> {
    const browser = await getBrowser()
    const items = await browser.storage.sync.get(Object.keys(storageSettingKeys))

    return normalizeSettings(items)
}

// Persists only the fields in `settings`; fields it omits keep their stored values.
export async function setSettings(settings: Partial<ISettings>) {
    const browser = await getBrowser()
    const storedSettings = await browser.storage.sync.get(Object.keys(storageSettingKeys))
    const normalized = sanitizeSettingsForStorage(settings, storedSettings)
    await browser.storage.sync.set(normalized)
    await browser.storage.sync.remove?.([
        ...legacySettingKeys.filter(
            (key) =>
                key !== 'defaultTargetLanguage' || Object.prototype.hasOwnProperty.call(normalized, 'nativeLanguage')
        ),
    ])
    if (settings.tts?.provider === 'openai' && normalized.tts?.provider === 'edge') {
        // Loaded lazily so the background service worker never initializes i18n.
        const { default: i18n } = await import('./i18n')
        const providers = normalized.providers ?? normalizeSettings(storedSettings).providers
        const linkedProvider = providers.find((item) => item.id === settings.tts?.openai?.providerId)
        toast(
            i18n.t(
                linkedProvider
                    ? 'The Provider linked to OpenAI TTS uses the Anthropic protocol, which does not support speech. Switched to Edge TTS.'
                    : 'The Provider linked to OpenAI TTS was deleted. Switched to Edge TTS.'
            )
        )
    }
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

export const isDesktopApp = () => {
    return isTauri()
}

export const isDarkMode = async () => {
    const settings = await getSettings()
    if (settings.themeType === 'followTheSystem') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return settings.themeType === 'dark'
}

export const isFirefox = () => /firefox/i.test(navigator.userAgent)

// js to csv
export async function exportToCsv<T extends Record<string, string | number>>(filename: string, rows: T[]) {
    if (!rows.length) return
    filename += '.csv'
    const columns = Object.keys(rows[0])
    let csvFile = ''
    for (const key of columns) {
        csvFile += key + ','
    }
    csvFile += '\r\n'
    const processRow = function (row: T) {
        let s = ''
        for (const key of columns) {
            if (key === 'updatedAt') {
                s += '\t' + `${row[key]}` + ','
            } else {
                s += '"' + `${row[key]}` + '"' + ','
            }
        }
        return s + '\r\n'
    }

    for (let i = 0; i < rows.length; i++) {
        csvFile += processRow(rows[i])
    }

    if (isDesktopApp()) {
        const { BaseDirectory, writeTextFile } = await import('@tauri-apps/plugin-fs')
        try {
            return await writeTextFile(filename, csvFile, { baseDir: BaseDirectory.Desktop })
        } catch (e) {
            console.error(e)
        }
    } else {
        const link = document.createElement('a')
        if (link.download !== undefined) {
            link.setAttribute('href', 'data:text/csv;charset=utf-8,ufeff' + encodeURIComponent(csvFile))
            link.setAttribute('download', filename)
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
        }
    }
}

interface FetchSSEOptions extends RequestInit {
    onMessage(data: string): Promise<void>
    // Receives the complete error body of a non-200 response, parsed as JSON when possible.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const handlers = { onMessage, onError, onJSONResponse }

    if (isTauri()) {
        const id = uuidv4()
        const signal = options.signal
        const abortError = () => new DOMException('Aborted', 'AbortError')
        if (signal?.aborted) {
            throw abortError()
        }
        const unlistens: Array<() => void> = []
        let cleanedUp = false
        const track = (unlisten: () => void) => {
            if (cleanedUp) {
                unlisten()
            } else {
                unlistens.push(unlisten)
            }
        }
        let rejectRun: (error: unknown) => void = () => {}
        const interrupted = new Promise<never>((_resolve, reject) => {
            rejectRun = reject
        })
        const handleAbort = () => {
            rejectRun(abortError())
            void emit('abort-fetch-stream', { id }).catch(() => {})
        }
        signal?.addEventListener('abort', handleAbort, { once: true })
        let consumer: ReturnType<typeof createResponseConsumer> | undefined
        const getConsumer = (status: number, contentType?: string | null) => {
            consumer ??= createResponseConsumer(status, contentType, handlers)
            return consumer
        }
        // Native events arrive without waiting for the consumer, so they are queued and
        // handled in order. A failed consumer stops the request.
        let queue = Promise.resolve()
        let failed = false
        const enqueue = (task: () => Promise<void>) => {
            queue = queue
                .then(async () => {
                    if (!failed && !cleanedUp && !signal?.aborted) {
                        await task()
                    }
                })
                .catch((error) => {
                    failed = true
                    rejectRun(error)
                    void emit('abort-fetch-stream', { id }).catch(() => {})
                })
        }
        let resolveEnd: () => void = () => {}
        const ended = new Promise<void>((resolve) => {
            resolveEnd = resolve
        })
        const isCurrent = (eventId: string) => !cleanedUp && !signal?.aborted && eventId === id
        const run = async () => {
            await Promise.all([
                listen(
                    'fetch-stream-status-code',
                    (event: Event<{ id: string; status: number; contentType?: string | null }>) => {
                        if (isCurrent(event.payload.id)) {
                            getConsumer(event.payload.status, event.payload.contentType)
                            onStatusCode?.(event.payload.status)
                        }
                    }
                ).then(track),
                listen(
                    'fetch-stream-chunk',
                    (event: Event<{ id: string; data: string; done: boolean; status: number }>) => {
                        const payload = event.payload
                        if (!isCurrent(payload.id)) {
                            return
                        }
                        if (payload.done) {
                            enqueue(async () => {
                                await getConsumer(payload.status).end()
                                resolveEnd()
                            })
                        } else {
                            enqueue(() => getConsumer(payload.status).push(payload.data))
                        }
                    }
                ).then(track),
            ])
            if (cleanedUp || signal?.aborted) {
                return
            }
            const result = await commands.fetchStream(id, input, JSON.stringify(fetchOptions))
            if (result.status === 'error') {
                throw new Error(result.error)
            }
            // The command returns after emitting the final chunk; wait until it is consumed.
            await ended
        }
        try {
            await Promise.race([run(), interrupted])
        } finally {
            cleanedUp = true
            signal?.removeEventListener('abort', handleAbort)
            unlistens.splice(0).forEach((unlisten) => unlisten())
        }
        return
    }

    const resp = await fetcher(input, fetchOptions)
    onStatusCode?.(resp.status)
    const consumer = createResponseConsumer(resp.status, resp.headers.get('content-type'), handlers)
    const reader = resp.body?.getReader()
    if (reader) {
        const decode = createUTF8Decoder()
        try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const { done, value } = await reader.read()
                if (done) {
                    break
                }
                await consumer.push(decode(value))
            }
            await consumer.push(decode())
        } catch (error) {
            await reader.cancel().catch(() => {})
            throw error
        } finally {
            reader.releaseLock()
        }
    }
    await consumer.end()
}

export function getAssetUrl(asset: string) {
    return new URL(asset, import.meta.url).href
}
export const isMacOS = navigator.userAgent.includes('Mac OS X')
export const isWindows = navigator.userAgent.includes('Windows')
