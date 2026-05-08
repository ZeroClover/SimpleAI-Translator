import { LangCode } from '../lang'

export interface SpeakOptions {
    text: string
    lang?: LangCode
    signal: AbortSignal
    onFinish?: () => void
    onStartSpeaking?: () => void
}

export type TTSProvider = 'edge' | 'system' | 'openai'

export type OpenAITTSFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'

export interface OpenAITTSSettings {
    providerId: string
    model: string
    voice: string | { id: string }
    format?: OpenAITTSFormat
    instructions?: string
}

export interface DoSpeakOptions extends SpeakOptions {
    lang: LangCode
    provider: TTSProvider
    voice?: string
    rate?: number
    volume?: number
}
