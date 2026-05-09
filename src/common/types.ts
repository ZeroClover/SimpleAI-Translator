import { Theme } from 'baseui-sd/theme'
import { OpenAITTSSettings, TTSProvider } from './tts/types'
import { LangCode } from './lang'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ISync {
    get(keys: string[]): Promise<Record<string, any>>
    set(items: Record<string, any>): Promise<void>
    remove?(keys: string[]): Promise<void>
}

interface IStorage {
    sync: ISync
}

interface IRuntimeOnMessage {
    addListener(callback: (message: any, sender: any, sendResponse: any) => void): void
    removeListener(callback: (message: any, sender: any, sendResponse: any) => void): void
}

interface IRuntime {
    onMessage: IRuntimeOnMessage
    sendMessage(message: any): void
    getURL(path: string): string
}

interface II18n {
    detectLanguage(text: string): Promise<{ languages: { language: string; percentage: number }[] }>
}

export interface IBrowser {
    storage: IStorage
    runtime: IRuntime
    i18n: II18n
}

export type BaseThemeType = 'light' | 'dark'
export type ThemeType = BaseThemeType | 'followTheSystem'

export interface IThemedStyleProps {
    theme: Theme
    themeType: BaseThemeType
    isDesktopApp?: boolean
    showLogo?: boolean
}

export type LanguageDetectionEngine = 'google' | 'baidu' | 'bing' | 'local'

export type ProxyProtocol = 'HTTP' | 'HTTPS'

export type ProviderProtocol = 'openai-chat' | 'openai-responses' | 'anthropic'

export interface ProviderConfig {
    id: string
    name: string
    protocol: ProviderProtocol
    apiKey: string
    endpoint?: string
    model: string
    extraHeaders?: Record<string, string>
}

export interface ISettings {
    automaticCheckForUpdates: boolean
    providers: ProviderConfig[]
    defaultProviderId: string | null
    enableBackgroundBlur: boolean
    enableMica: boolean // deprecated, please use enableBackgroundBlur
    defaultTargetLanguage: string
    themeType?: ThemeType
    i18n?: string
    tts?: {
        voices?: {
            lang: LangCode
            voice: string
        }[]
        provider?: TTSProvider
        volume?: number
        rate?: number
        openai?: OpenAITTSSettings
    }
    restorePreviousPosition?: boolean
    readSelectedWordsFromInputElementsText?: boolean
    runAtStartup?: boolean
    allowUsingClipboardWhenSelectedTextNotAvailable?: boolean
    pinned?: boolean
    languageDetectionEngine?: LanguageDetectionEngine
    proxy?: {
        enabled?: boolean
        protocol?: ProxyProtocol
        server?: string
        port?: string
        basicAuth?: {
            username?: string
            password?: string
        }
        noProxy?: string
    }
    fontSize: number
    uiFontSize: number
    iconSize: number
}
