import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast/headless'
import { ProviderConfig } from '../types'
import { getUniversalFetch } from '../universal-fetch'
import { getSettings, setSettings } from '../utils'
import {
    getOpenAITTSMaxInputLength,
    getOpenAITTSVoices,
    openAITTSSpeedFromRate,
    speak,
    splitOpenAITTSInput,
} from './openai-tts'

vi.mock('react-hot-toast/headless', () => ({ default: vi.fn() }))
vi.mock('../i18n', () => ({ default: { t: (key: string) => key } }))
vi.mock('../universal-fetch', () => ({ getUniversalFetch: vi.fn() }))
vi.mock('../utils', async () => {
    const actual = await vi.importActual<typeof import('../utils')>('../utils')
    return {
        ...actual,
        getSettings: vi.fn(),
        setSettings: vi.fn(),
    }
})

const provider: ProviderConfig = {
    id: 'provider-1',
    name: 'OpenAI',
    protocol: 'openai-chat',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
}

class FakeAudio {
    static instances: FakeAudio[] = []
    onended: (() => void) | null = null
    onerror: (() => void) | null = null
    pause = vi.fn()
    play = vi.fn(async () => {
        this.onended?.()
    })

    constructor(public src: string) {
        FakeAudio.instances.push(this)
    }
}

function mockSettings(overrides: Record<string, unknown> = {}) {
    vi.mocked(getSettings).mockResolvedValue({
        providers: [provider],
        defaultProviderId: provider.id,
        tts: {
            provider: 'openai',
            rate: 100,
            openai: {
                providerId: provider.id,
                model: 'gpt-4o-mini-tts',
                voice: 'alloy',
                format: 'mp3',
                instructions: 'Speak clearly',
            },
        },
        ...overrides,
    } as Awaited<ReturnType<typeof getSettings>>)
}

function mockAudio() {
    vi.stubGlobal('Audio', FakeAudio)
    Object.defineProperty(URL, 'createObjectURL', {
        value: vi.fn(() => 'blob:audio'),
        configurable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
        value: vi.fn(),
        configurable: true,
    })
}

function mockFetchResponse(status = 200) {
    const fetcher = vi.fn(async (...args: [string, RequestInit?]): Promise<Response> => {
        void args
        return new Response(new Blob(['audio']), { status })
    })
    vi.mocked(getUniversalFetch).mockReturnValue(fetcher)
    return fetcher
}

describe('OpenAI TTS', () => {
    beforeEach(() => {
        mockAudio()
        mockSettings()
    })

    afterEach(() => {
        FakeAudio.instances = []
        vi.unstubAllGlobals()
        vi.clearAllMocks()
    })

    it('synthesizes and plays audio through the referenced provider', async () => {
        const fetcher = mockFetchResponse()

        await speak({
            text: 'Hello',
            lang: 'en',
            signal: new AbortController().signal,
        })

        expect(fetcher).toHaveBeenCalledTimes(1)
        const [url, init] = fetcher.mock.calls[0] as [string, RequestInit]
        expect(url).toBe('https://api.openai.com/v1/audio/speech')
        expect(init.headers).toMatchObject({
            'Authorization': 'Bearer sk-test',
            'Content-Type': 'application/json',
        })
        expect(JSON.parse(init.body as string)).toEqual({
            model: 'gpt-4o-mini-tts',
            voice: 'alloy',
            input: 'Hello',
            ['response_format']: 'mp3',
            speed: 4,
            instructions: 'Speak clearly',
        })
        expect(FakeAudio.instances).toHaveLength(1)
    })

    it('reports authentication failures', async () => {
        mockFetchResponse(401)

        await expect(
            speak({
                text: 'Hello',
                lang: 'en',
                signal: new AbortController().signal,
            })
        ).rejects.toThrow('OpenAI TTS authentication failed.')

        expect(toast).toHaveBeenCalledWith('OpenAI TTS authentication failed. Check the linked Provider in settings.')
    })

    it('reports unsupported speech endpoints', async () => {
        mockFetchResponse(404)

        await expect(
            speak({
                text: 'Hello',
                lang: 'en',
                signal: new AbortController().signal,
            })
        ).rejects.toThrow('does not implement /audio/speech')

        expect(toast).toHaveBeenCalledWith(
            'The OpenAI TTS endpoint does not implement /audio/speech. Check the linked Provider in settings.'
        )
    })

    it('falls back to edge when the referenced provider is missing', async () => {
        mockSettings({
            providers: [],
            defaultProviderId: null,
        })

        await expect(
            speak({
                text: 'Hello',
                lang: 'en',
                signal: new AbortController().signal,
            })
        ).rejects.toThrow('Switched to Edge TTS')

        expect(toast).toHaveBeenCalledWith('The Provider linked to OpenAI TTS was deleted. Switched to Edge TTS.')
        expect(setSettings).toHaveBeenCalledWith({
            tts: expect.objectContaining({
                provider: 'edge',
            }),
        })
        expect(getUniversalFetch).not.toHaveBeenCalled()
    })

    it('splits gpt-4o-mini-tts input to stay under its token limit', async () => {
        const fetcher = mockFetchResponse()
        const text = '你'.repeat(4000)

        await speak({
            text,
            lang: 'zh-Hans',
            signal: new AbortController().signal,
        })

        expect(fetcher).toHaveBeenCalledTimes(3)
        for (const call of fetcher.mock.calls) {
            const body = JSON.parse((call[1] as RequestInit).body as string)
            expect(body.input.length).toBeLessThanOrEqual(1500)
        }
    })

    it('splits tts-1 input at 4096 characters', async () => {
        const fetcher = mockFetchResponse()
        mockSettings({
            tts: {
                provider: 'openai',
                openai: { providerId: provider.id, model: 'tts-1', voice: 'alloy' },
            },
        })
        const text = 'a'.repeat(9000)

        await speak({
            text,
            lang: 'en',
            signal: new AbortController().signal,
        })

        expect(fetcher).toHaveBeenCalledTimes(3)
        for (const call of fetcher.mock.calls) {
            const body = JSON.parse((call[1] as RequestInit).body as string)
            expect(body.input.length).toBeLessThanOrEqual(4096)
        }
    })

    it('keeps sentence boundaries when splitting', () => {
        const sentence = 'a'.repeat(900) + '. '
        const chunks = splitOpenAITTSInput(sentence.repeat(3), getOpenAITTSMaxInputLength('gpt-4o-mini-tts'))

        expect(chunks).toHaveLength(3)
        expect(chunks.join('')).toBe(sentence.repeat(3))
        expect(chunks[1].startsWith(' a')).toBe(true)
    })

    it('uses per-model input limits', () => {
        expect(getOpenAITTSMaxInputLength('gpt-4o-mini-tts')).toBe(1500)
        expect(getOpenAITTSMaxInputLength('gpt-4o-mini-tts-2025-12-15')).toBe(1500)
        expect(getOpenAITTSMaxInputLength('tts-1')).toBe(4096)
        expect(getOpenAITTSMaxInputLength('tts-1-hd')).toBe(4096)
    })

    it('offers only classic voices for tts-1 models', () => {
        const classic = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer']
        expect(getOpenAITTSVoices('tts-1')).toEqual(classic)
        expect(getOpenAITTSVoices('TTS-1-HD')).toEqual(classic)
        expect(getOpenAITTSVoices('gpt-4o-mini-tts')).toEqual([...classic, 'ballad', 'verse', 'marin', 'cedar'])
        expect(getOpenAITTSVoices('custom-tts')).toContain('marin')
    })

    it('defaults to the alloy voice when none is saved', async () => {
        const fetcher = mockFetchResponse()
        mockSettings({
            tts: {
                provider: 'openai',
                openai: { providerId: provider.id, model: 'tts-1' },
            },
        })

        await speak({
            text: 'Hello',
            lang: 'en',
            signal: new AbortController().signal,
        })

        const body = JSON.parse((fetcher.mock.calls[0][1] as RequestInit).body as string)
        expect(body.voice).toBe('alloy')
    })

    it.each([
        [
            'no provider is linked',
            { providers: [provider], tts: { provider: 'openai', openai: { providerId: '', model: 'tts-1' } } },
            'No Provider is linked to OpenAI TTS. Switched to Edge TTS.',
        ],
        [
            'the linked provider uses anthropic',
            {
                providers: [{ ...provider, protocol: 'anthropic' }],
                tts: { provider: 'openai', openai: { providerId: provider.id, model: 'tts-1' } },
            },
            'The Provider linked to OpenAI TTS uses the Anthropic protocol, which does not support speech. Switched to Edge TTS.',
        ],
        [
            'the model is missing',
            { tts: { provider: 'openai', openai: { providerId: provider.id, model: '' } } },
            'No OpenAI TTS model is selected. Switched to Edge TTS.',
        ],
    ])('explains the fallback when %s', async (_case, overrides, message) => {
        mockSettings(overrides)

        await expect(
            speak({
                text: 'Hello',
                lang: 'en',
                signal: new AbortController().signal,
            })
        ).rejects.toThrow(message)

        expect(toast).toHaveBeenCalledWith(message)
        expect(setSettings).toHaveBeenCalledWith({
            tts: expect.objectContaining({ provider: 'edge' }),
        })
        expect(getUniversalFetch).not.toHaveBeenCalled()
    })

    it('stays silent when the user stops while the request is in flight', async () => {
        const controller = new AbortController()
        vi.mocked(getUniversalFetch).mockReturnValue(
            vi.fn(
                (_url: string, init?: RequestInit) =>
                    new Promise<Response>((_resolve, reject) => {
                        init?.signal?.addEventListener('abort', () =>
                            reject(new DOMException('The operation was aborted.', 'AbortError'))
                        )
                        controller.abort()
                    })
            )
        )

        await expect(
            speak({
                text: 'Hello',
                lang: 'en',
                signal: controller.signal,
            })
        ).resolves.toBeUndefined()

        expect(toast).not.toHaveBeenCalled()
        expect(FakeAudio.instances).toHaveLength(0)
    })

    it('reports request timeouts', async () => {
        vi.useFakeTimers()
        vi.mocked(getUniversalFetch).mockReturnValue(
            vi.fn(
                (_url: string, init?: RequestInit) =>
                    new Promise<Response>((_resolve, reject) => {
                        init?.signal?.addEventListener('abort', () =>
                            reject(new DOMException('The operation was aborted.', 'AbortError'))
                        )
                    })
            )
        )

        const result = speak({
            text: 'Hello',
            lang: 'en',
            signal: new AbortController().signal,
        })
        const assertion = expect(result).rejects.toThrow('OpenAI TTS request timed out. Please try again later.')
        await vi.advanceTimersByTimeAsync(15000)
        await assertion
        vi.useRealTimers()

        expect(toast).toHaveBeenCalledWith('OpenAI TTS request timed out. Please try again later.')
    })

    it('does not send instructions to tts-1 models', async () => {
        const fetcher = mockFetchResponse()
        mockSettings({
            tts: {
                provider: 'openai',
                rate: 1,
                openai: {
                    providerId: provider.id,
                    model: 'tts-1',
                    voice: 'nova',
                    instructions: 'Ignored',
                },
            },
        })

        await speak({
            text: 'Hello',
            lang: 'en',
            signal: new AbortController().signal,
        })

        const init = fetcher.mock.calls[0][1] as RequestInit
        const body = JSON.parse(init.body as string)
        expect(body).not.toHaveProperty('instructions')
        expect(body.speed).toBe(0.25)
    })

    it('maps settings rate to OpenAI speed limits', () => {
        expect(openAITTSSpeedFromRate(1)).toBe(0.25)
        expect(openAITTSSpeedFromRate(10)).toBe(1)
        expect(openAITTSSpeedFromRate(100)).toBe(4)
    })
})
