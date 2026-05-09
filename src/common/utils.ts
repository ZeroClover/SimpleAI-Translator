/* eslint-disable @typescript-eslint/no-explicit-any */
import { createParser } from 'eventsource-parser'
import {
    AnthropicThinkingEffort,
    IBrowser,
    ISettings,
    ModelSelection,
    OpenAIReasoningEffort,
    ProviderConfig,
} from './types'
import { getUniversalFetch } from './universal-fetch'
import { v4 as uuidv4 } from 'uuid'
import { listen, Event, emit } from '@tauri-apps/api/event'
import { parse as bestEffortJSONParse } from 'best-effort-json-parser'
import { commands } from '@/tauri/bindings'
import toast from 'react-hot-toast'

export const defaultTargetLanguage = 'zh-Hans'
export const defaulti18n = 'en'

type RawSettings = Partial<ISettings> & Record<string, unknown>
const openAITTSDanglingProviderMessage = '原 OpenAI TTS 关联的 Provider 已被删除，已回退到 Edge TTS'

const settingKeys = {
    automaticCheckForUpdates: 1,
    providers: 1,
    defaultProviderId: 1,
    defaultModel: 1,
    useStructuredOutput: 1,
    useStrictSchema: 1,
    enableMica: 1,
    enableBackgroundBlur: 1,
    defaultTargetLanguage: 1,
    themeType: 1,
    i18n: 1,
    tts: 1,
    restorePreviousPosition: 1,
    runAtStartup: 1,
    allowUsingClipboardWhenSelectedTextNotAvailable: 1,
    pinned: 1,
    languageDetectionEngine: 1,
    proxy: 1,
    fontSize: 1,
    uiFontSize: 1,
    iconSize: 1,
} satisfies Partial<Record<keyof ISettings, number>>

const legacySettingKeys = [
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

const openaiReasoningEfforts = new Set<OpenAIReasoningEffort>(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'])
const anthropicThinkingEfforts = new Set<AnthropicThinkingEffort>(['low', 'medium', 'high', 'xhigh', 'max'])

function normalizeDefaultModel(rawDefaultModel: unknown, providers: ProviderConfig[]): ModelSelection | null {
    const defaultModel = rawDefaultModel as Partial<ModelSelection> | undefined
    if (
        defaultModel &&
        typeof defaultModel.providerId === 'string' &&
        typeof defaultModel.model === 'string' &&
        providers.some((provider) => provider.id === defaultModel.providerId) &&
        defaultModel.model.trim()
    ) {
        const openaiReasoningEffort = openaiReasoningEfforts.has(
            String(defaultModel.openaiReasoningEffort) as OpenAIReasoningEffort
        )
            ? defaultModel.openaiReasoningEffort
            : undefined
        const anthropicThinkingEffort = anthropicThinkingEfforts.has(
            String(defaultModel.anthropicThinkingEffort) as AnthropicThinkingEffort
        )
            ? defaultModel.anthropicThinkingEffort
            : undefined
        return {
            providerId: defaultModel.providerId,
            model: defaultModel.model,
            ...(defaultModel.thinkingEnabled === true ? { thinkingEnabled: true } : {}),
            ...(openaiReasoningEffort ? { openaiReasoningEffort } : {}),
            ...(anthropicThinkingEffort ? { anthropicThinkingEffort } : {}),
        }
    }
    const fallbackProvider = providers.find((provider) => provider.model.trim()) ?? providers[0]
    if (!fallbackProvider || !fallbackProvider.model.trim()) {
        return null
    }
    return {
        providerId: fallbackProvider.id,
        model: fallbackProvider.model,
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

    return {
        automaticCheckForUpdates:
            rawSettings.automaticCheckForUpdates === undefined || rawSettings.automaticCheckForUpdates === null
                ? true
                : rawSettings.automaticCheckForUpdates,
        providers,
        defaultProviderId,
        defaultModel: normalizeDefaultModel(rawSettings.defaultModel, providers),
        useStructuredOutput: rawSettings.useStructuredOutput ?? false,
        useStrictSchema: rawSettings.useStrictSchema ?? true,
        enableMica: rawSettings.enableMica ?? false,
        enableBackgroundBlur:
            rawSettings.enableBackgroundBlur === undefined || rawSettings.enableBackgroundBlur === null
                ? rawSettings.enableMica ?? false
                : rawSettings.enableBackgroundBlur,
        defaultTargetLanguage: rawSettings.defaultTargetLanguage || defaultTargetLanguage,
        themeType: rawSettings.themeType || 'followTheSystem',
        i18n: rawSettings.i18n || defaulti18n,
        tts: normalizeTTSSettings(rawSettings.tts, providers),
        restorePreviousPosition: rawSettings.restorePreviousPosition,
        runAtStartup: rawSettings.runAtStartup,
        allowUsingClipboardWhenSelectedTextNotAvailable: rawSettings.allowUsingClipboardWhenSelectedTextNotAvailable,
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
        uiFontSize: rawSettings.uiFontSize ?? 12,
        iconSize: rawSettings.iconSize ?? 15,
    } as ISettings
}

export function sanitizeSettingsForStorage(settings: RawSettings): Partial<ISettings> {
    const normalized = normalizeSettings(settings)
    const sanitized: Record<string, unknown> = {
        providers: normalized.providers,
        defaultProviderId: normalized.defaultProviderId,
        defaultModel: normalized.defaultModel,
    }

    for (const key of Object.keys(settingKeys) as Array<keyof typeof settingKeys>) {
        if (key === 'providers' || key === 'defaultProviderId' || key === 'defaultModel') {
            continue
        }
        if (Object.prototype.hasOwnProperty.call(settings, key)) {
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

export async function setSettings(settings: Partial<ISettings>) {
    const browser = await getBrowser()
    const normalized = sanitizeSettingsForStorage(settings)
    await browser.storage.sync.set(normalized)
    await browser.storage.sync.remove?.([...legacySettingKeys])
    if (settings.tts?.provider === 'openai' && normalized.tts?.provider === 'edge') {
        toast(openAITTSDanglingProviderMessage)
    }
}

export async function getBrowser(): Promise<IBrowser> {
    if (isElectron()) {
        return (await import('./polyfills/electron')).electronBrowser
    }
    if (isTauri()) {
        return (await import('./polyfills/tauri')).tauriBrowser
    }
    if (isUserscript()) {
        return (await import('./polyfills/userscript')).userscriptBrowser
    }
    return (await import('webextension-polyfill')).default
}

export const isElectron = () => {
    return navigator.userAgent.indexOf('Electron') >= 0
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
    return isElectron() || isTauri()
}

export const isUserscript = () => {
    // eslint-disable-next-line camelcase
    return typeof GM_info !== 'undefined'
}

export const isDarkMode = async () => {
    const settings = await getSettings()
    if (settings.themeType === 'followTheSystem') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return settings.themeType === 'dark'
}

export const isFirefox = () => /firefox/i.test(navigator.userAgent)

export function isOpenAIOfficialProvider(provider: ProviderConfig | undefined): boolean {
    return Boolean(
        provider &&
            (provider.protocol === 'openai-chat' || provider.protocol === 'openai-responses') &&
            !provider.endpoint?.trim()
    )
}

export const isUsingOpenAIOfficial = async () => {
    const settings = await getSettings()
    const provider =
        settings.providers.find((provider) => provider.id === settings.defaultProviderId) ?? settings.providers[0]
    return isOpenAIOfficialProvider(provider)
}

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
            // link.style.visibility = 'hidden'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
        }
    }
}

interface FetchSSEOptions extends RequestInit {
    onMessage(data: string): Promise<void>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError(error: any): void
    onStatusCode?: (statusCode: number) => void
    fetcher?: (input: string, options: RequestInit) => Promise<Response>
    usePartialArrayJSONParser?: boolean
    isJSONStream?: boolean
}

export async function fetchSSE(input: string, options: FetchSSEOptions) {
    const {
        onMessage,
        onError,
        onStatusCode,
        usePartialArrayJSONParser = false,
        isJSONStream = false,
        fetcher = getUniversalFetch(),
        ...fetchOptions
    } = options

    let prevArrayJSONPartial = ''
    let prevArrayJSONPartialIndex = 0
    const partialArrayJSONParser = async ({ value, done }: { value: string; done: boolean }) => {
        if (done && !value) {
            return
        }

        try {
            const parsedResponse = bestEffortJSONParse(prevArrayJSONPartial + value)
            prevArrayJSONPartial += value
            parsedResponse.slice(prevArrayJSONPartialIndex).forEach((data: string) => {
                onMessage(JSON.stringify(data))
            })
            prevArrayJSONPartialIndex = parsedResponse.length
        } catch (e) {
            console.error('streaming json parser error', e)
            console.error('streaming json parser value', value)
            return
        }
    }

    let prevJSONPartial = ''
    const partialJSONParser = async ({ value, done }: { value: string; done: boolean }) => {
        if (done && !value) {
            return
        }

        try {
            const parsedResponse = JSON.parse(prevJSONPartial + value)
            prevJSONPartial = ''
            onMessage(JSON.stringify(parsedResponse))
        } catch (e) {
            prevJSONPartial += value
            return
        }
    }

    const sseParser = createParser(async (event) => {
        if (event.type === 'event') {
            await onMessage(event.data)
        }
    })

    if (isTauri()) {
        const id = uuidv4()
        const unlistens: Array<() => void> = []
        const unlisten = () => {
            unlistens.forEach((cb) => cb())
        }
        return await new Promise<void>((resolve, reject) => {
            let isAborted = false
            options.signal?.addEventListener('abort', () => {
                isAborted = true
                unlisten?.()
                reject()
                emit('abort-fetch-stream', { id })
            })
            listen('fetch-stream-status-code', (event: Event<{ id: string; status: number }>) => {
                if (isAborted) {
                    return
                }
                if (event.payload.id === id) {
                    onStatusCode?.(event.payload.status)
                }
            })
                .then((cb) => unlistens.push(cb))
                .catch((e) => reject(e))
            listen(
                'fetch-stream-chunk',
                (event: Event<{ id: string; data: string; done: boolean; status: number }>) => {
                    if (isAborted) {
                        return
                    }
                    const payload = event.payload
                    if (payload.id !== id) {
                        return
                    }
                    if (payload.done) {
                        return
                    }
                    if (payload.status !== 200) {
                        try {
                            const data = JSON.parse(payload.data)
                            onError(data)
                        } catch (e) {
                            onError(payload.data)
                        }
                        return
                    }
                    if (isJSONStream) {
                        partialJSONParser({ value: payload.data, done: payload.done })
                        return
                    }
                    if (usePartialArrayJSONParser) {
                        partialArrayJSONParser({ value: payload.data, done: payload.done })
                    } else {
                        sseParser.feed(payload.data)
                    }
                }
            )
                .then((cb) => {
                    unlistens.push(cb)
                })
                .catch((e) => {
                    reject(e)
                })

            commands
                .fetchStream(id, input, JSON.stringify(fetchOptions))
                .catch((e) => {
                    reject(e)
                })
                .finally(() => {
                    if (isAborted) {
                        return
                    }
                    unlisten?.()
                    resolve()
                })
        })
    }

    const resp = await fetcher(input, fetchOptions)
    onStatusCode?.(resp.status)
    if (resp.status !== 200) {
        onError(await resp.json())
        return
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const reader = resp.body!.getReader()
    try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const { done, value } = await reader.read()
            if (done) {
                break
            }
            const str = new TextDecoder().decode(value)
            if (isJSONStream) {
                partialJSONParser({ value: str, done })
            } else {
                if (usePartialArrayJSONParser) {
                    partialArrayJSONParser({ value: str, done })
                } else {
                    sseParser.feed(str)
                }
            }
        }
    } finally {
        reader.releaseLock()
    }
}

export function getAssetUrl(asset: string) {
    if (isUserscript()) {
        return asset
    }
    return new URL(asset, import.meta.url).href
}
export const isMacOS = navigator.userAgent.includes('Mac OS X')
export const isWindows = navigator.userAgent.includes('Windows')
