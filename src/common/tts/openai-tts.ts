import toast from 'react-hot-toast/headless'
import i18n from '../i18n'
import { OPENAI_AUDIO_SPEECH_API_PATH, normalizeAPIEndpoint } from '../openai-api-path'
import { ProviderConfig } from '../types'
import { getUniversalFetch } from '../universal-fetch'
import { getSettings, setSettings } from '../utils'
import { SpeakOptions } from './types'

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1'
const MAX_INPUT_LENGTH = 4096
// gpt-4o-mini-tts caps input at 2000 tokens; CJK text is roughly one token per character.
const GPT_4O_MINI_TTS_MAX_INPUT_LENGTH = 1500
const REQUEST_TIMEOUT_MS = 15000

interface OpenAISpeakOptions extends SpeakOptions {
    onStartSpeaking?: () => void
}

const DEFAULT_VOICE = 'alloy'
const TTS_1_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer']
const ALL_VOICES = [...TTS_1_VOICES, 'ballad', 'verse', 'marin', 'cedar']

function isOpenAITTSModel(model: string): boolean {
    return /^gpt-4o-mini-tts(?:-[0-9]{4}-[0-9]{2}-[0-9]{2})?$/i.test(model)
}

function isTTS1Model(model: string): boolean {
    return /^tts-1(?:-hd)?$/i.test(model)
}

export function getOpenAITTSVoices(model: string): string[] {
    return isTTS1Model(model) ? TTS_1_VOICES : ALL_VOICES
}

export function getOpenAITTSMaxInputLength(model: string): number {
    return isOpenAITTSModel(model) ? GPT_4O_MINI_TTS_MAX_INPUT_LENGTH : MAX_INPUT_LENGTH
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message
    }
    if (typeof error === 'string') {
        return error
    }
    if (typeof error === 'object' && error !== null) {
        const resp = error as { error?: { message?: string }; message?: string; detail?: string }
        return resp.error?.message ?? resp.message ?? resp.detail ?? i18n.t('OpenAI TTS request failed.')
    }
    return i18n.t('OpenAI TTS request failed.')
}

function getConfigErrorMessage(providerId: string | undefined, providerConfig: ProviderConfig | undefined): string {
    if (!providerId) {
        return i18n.t('No Provider is linked to OpenAI TTS. Switched to Edge TTS.')
    }
    if (!providerConfig) {
        return i18n.t('The Provider linked to OpenAI TTS was deleted. Switched to Edge TTS.')
    }
    if (providerConfig.protocol === 'anthropic') {
        return i18n.t(
            'The Provider linked to OpenAI TTS uses the Anthropic protocol, which does not support speech. Switched to Edge TTS.'
        )
    }
    return i18n.t('No OpenAI TTS model is selected. Switched to Edge TTS.')
}

function getStatusErrorMessage(status: number): string {
    if (status === 401 || status === 403) {
        return i18n.t('OpenAI TTS authentication failed. Check the linked Provider in settings.')
    }
    if (status === 404) {
        return i18n.t(
            'The OpenAI TTS endpoint does not implement /audio/speech. Check the linked Provider in settings.'
        )
    }
    if (status >= 400 && status < 500) {
        return i18n.t('The OpenAI TTS request was rejected. Check the linked Provider in settings.')
    }
    if (status >= 500) {
        return i18n.t('The OpenAI TTS service is temporarily unavailable. Please try again later.')
    }
    return i18n.t('OpenAI TTS request failed.')
}

export function splitOpenAITTSInput(text: string, maxLength = MAX_INPUT_LENGTH): string[] {
    if (text.length <= maxLength) {
        return text ? [text] : []
    }

    const pieces = text.match(/[^.!?。！？\n]+[.!?。！？]?|\n+/g) ?? [text]
    const chunks: string[] = []
    let current = ''

    const pushCurrent = () => {
        if (current) {
            chunks.push(current)
            current = ''
        }
    }

    for (const piece of pieces) {
        if (piece.length > maxLength) {
            pushCurrent()
            for (let index = 0; index < piece.length; index += maxLength) {
                chunks.push(piece.slice(index, index + maxLength))
            }
            continue
        }
        if (current.length + piece.length > maxLength) {
            pushCurrent()
        }
        current += piece
    }
    pushCurrent()

    return chunks
}

export function openAITTSSpeedFromRate(rate?: number): number {
    const speed = (rate ?? 10) / 10
    return Math.min(4, Math.max(0.25, speed))
}

function getHeaders(providerConfig: ProviderConfig): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${providerConfig.apiKey}`,
        ...providerConfig.extraHeaders,
    }
}

async function playAudioBlob(blob: Blob, { signal, onStartSpeaking }: OpenAISpeakOptions): Promise<void> {
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)

    await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
            URL.revokeObjectURL(url)
            signal.removeEventListener('abort', onAbort)
        }
        const onAbort = () => {
            audio.pause()
            cleanup()
            resolve()
        }
        audio.onended = () => {
            cleanup()
            resolve()
        }
        audio.onerror = () => {
            cleanup()
            reject(new Error(i18n.t('OpenAI TTS audio playback failed.')))
        }
        signal.addEventListener('abort', onAbort, { once: true })
        onStartSpeaking?.()
        audio.play().catch((error) => {
            cleanup()
            reject(error)
        })
    })
}

async function synthesizeSegment({
    providerConfig,
    input,
    model,
    voice,
    format,
    speed,
    instructions,
    signal,
}: {
    providerConfig: ProviderConfig
    input: string
    model: string
    voice: string | { id: string }
    format: string
    speed: number
    instructions?: string
    signal: AbortSignal
}): Promise<Blob> {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true })

    try {
        const body: Record<string, unknown> = {
            model,
            voice,
            input,
            ['response_format']: format,
            speed,
        }
        if (instructions && isOpenAITTSModel(model)) {
            body.instructions = instructions
        }

        const resp = await getUniversalFetch()(
            normalizeAPIEndpoint(providerConfig.endpoint, OPENAI_AUDIO_SPEECH_API_PATH, DEFAULT_ENDPOINT),
            {
                method: 'POST',
                headers: getHeaders(providerConfig),
                body: JSON.stringify(body),
                signal: controller.signal,
            }
        )

        if (!resp.ok) {
            throw new Error(getStatusErrorMessage(resp.status))
        }

        return await resp.blob()
    } catch (error) {
        if (controller.signal.aborted && !signal.aborted) {
            throw new Error(i18n.t('OpenAI TTS request timed out. Please try again later.'))
        }
        throw error
    } finally {
        window.clearTimeout(timeout)
        signal.removeEventListener('abort', abort)
    }
}

export async function speak(options: OpenAISpeakOptions): Promise<void> {
    const settings = await getSettings()
    const openAIConfig = settings.tts?.openai
    const providerConfig = settings.providers.find((provider) => provider.id === openAIConfig?.providerId)

    if (!openAIConfig?.model || !providerConfig || providerConfig.protocol === 'anthropic') {
        await setSettings({
            tts: {
                ...settings.tts,
                provider: 'edge',
            },
        })
        const message = getConfigErrorMessage(openAIConfig?.providerId, providerConfig)
        toast(message)
        throw new Error(message)
    }

    const chunks = splitOpenAITTSInput(options.text, getOpenAITTSMaxInputLength(openAIConfig.model))
    const speed = openAITTSSpeedFromRate(settings.tts?.rate)
    const format = openAIConfig.format ?? 'mp3'

    try {
        for (const input of chunks) {
            if (options.signal.aborted) {
                return
            }
            const blob = await synthesizeSegment({
                providerConfig,
                input,
                model: openAIConfig.model,
                voice: openAIConfig.voice || DEFAULT_VOICE,
                format,
                speed,
                instructions: openAIConfig.instructions,
                signal: options.signal,
            })
            if (options.signal.aborted) {
                return
            }
            await playAudioBlob(blob, options)
        }
        options.onFinish?.()
    } catch (error) {
        if (options.signal.aborted) {
            return
        }
        const message = getErrorMessage(error)
        toast(message)
        throw error
    }
}
