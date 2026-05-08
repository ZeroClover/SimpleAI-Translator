import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast/headless'
import { ProviderConfig } from '../types'
import { getUniversalFetch } from '../universal-fetch'
import { getSettings, setSettings } from '../utils'
import { openAITTSSpeedFromRate, speak, splitOpenAITTSInput } from './openai-tts'

vi.mock('react-hot-toast/headless', () => ({ default: vi.fn() }))
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
        ).rejects.toThrow('OpenAI TTS 鉴权失败')

        expect(toast).toHaveBeenCalledWith('OpenAI TTS 鉴权失败，请在设置中检查关联的 Provider 配置')
    })

    it('reports unsupported speech endpoints', async () => {
        mockFetchResponse(404)

        await expect(
            speak({
                text: 'Hello',
                lang: 'en',
                signal: new AbortController().signal,
            })
        ).rejects.toThrow('OpenAI TTS Endpoint 未实现')

        expect(toast).toHaveBeenCalledWith('OpenAI TTS Endpoint 未实现 /audio/speech，请检查关联的 Provider 配置')
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
        ).rejects.toThrow('已回退到 Edge TTS')

        expect(setSettings).toHaveBeenCalledWith({
            tts: expect.objectContaining({
                provider: 'edge',
            }),
        })
        expect(getUniversalFetch).not.toHaveBeenCalled()
    })

    it('splits long input into sequential requests', async () => {
        const fetcher = mockFetchResponse()
        const text = 'a'.repeat(9000)

        await speak({
            text,
            lang: 'en',
            signal: new AbortController().signal,
        })

        expect(fetcher).toHaveBeenCalledTimes(3)
        for (const call of fetcher.mock.calls) {
            const init = call[1] as RequestInit
            const body = JSON.parse(init.body as string)
            expect(body.input.length).toBeLessThanOrEqual(4096)
        }
        expect(splitOpenAITTSInput(text)).toHaveLength(3)
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
