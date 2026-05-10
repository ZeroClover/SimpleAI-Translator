import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchEdgeVoices, speak } from './edge-tts'

const isDesktopAppMock = vi.hoisted(() => vi.fn())
const edgeTtsSynthesizeMock = vi.hoisted(() => vi.fn())
const edgeTtsListVoicesMock = vi.hoisted(() => vi.fn())
const edgeTtsUniversalImportMock = vi.hoisted(() => vi.fn())
const browserEdgeTtsMock = vi.hoisted(() => vi.fn())
const browserListVoicesMock = vi.hoisted(() => vi.fn())

vi.mock('../utils', async () => {
    const actual = await vi.importActual<typeof import('../utils')>('../utils')
    return {
        ...actual,
        isDesktopApp: isDesktopAppMock,
    }
})

vi.mock('../../tauri/bindings', () => ({
    commands: {
        edgeTtsSynthesize: edgeTtsSynthesizeMock,
        edgeTtsListVoices: edgeTtsListVoicesMock,
    },
}))

vi.mock('edge-tts-universal', () => {
    edgeTtsUniversalImportMock()

    return {
        EdgeTTS: browserEdgeTtsMock,
        listVoices: browserListVoicesMock,
    }
})

class FakeAudioBufferSource extends EventTarget {
    buffer: AudioBuffer | null = null
    connect = vi.fn()
    start = vi.fn()
    stop = vi.fn(() => {
        this.dispatchEvent(new Event('ended'))
    })
}

class FakeAudioContext {
    static instances: FakeAudioContext[] = []

    destination = {}
    sources: FakeAudioBufferSource[] = []
    decodedBytes: number[][] = []
    close = vi.fn(async () => {})
    decodeAudioData = vi.fn(async (buffer: ArrayBuffer) => {
        this.decodedBytes.push(Array.from(new Uint8Array(buffer)))
        return { byteLength: buffer.byteLength } as AudioBuffer
    })
    createBufferSource = vi.fn(() => {
        const source = new FakeAudioBufferSource()
        this.sources.push(source)
        return source
    })

    constructor() {
        FakeAudioContext.instances.push(this)
    }
}

function mockAudioContext() {
    vi.stubGlobal('AudioContext', FakeAudioContext)
}

function latestAudioContext() {
    return FakeAudioContext.instances[FakeAudioContext.instances.length - 1]
}

describe('Edge TTS desktop integration', () => {
    beforeEach(() => {
        FakeAudioContext.instances = []
        isDesktopAppMock.mockReturnValue(true)
        edgeTtsSynthesizeMock.mockResolvedValue({
            status: 'ok',
            data: {
                mimeType: 'audio/mpeg',
                audioSegments: ['AQI=', 'Aw=='],
            },
        })
        edgeTtsListVoicesMock.mockResolvedValue({
            status: 'ok',
            data: [
                {
                    shortName: 'en-US-AvaNeural',
                    friendlyName: 'Ava',
                    locale: 'en-US',
                },
            ],
        })
        mockAudioContext()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('dispatches desktop synthesis to the Tauri command and plays returned segments in order', async () => {
        const onStartSpeaking = vi.fn()
        const onFinish = vi.fn()

        await speak({
            text: 'Hello',
            lang: 'en',
            voice: 'en-US-AvaNeural',
            rate: 1.2,
            volume: 80,
            signal: new AbortController().signal,
            onStartSpeaking,
            onFinish,
        })

        expect(edgeTtsSynthesizeMock).toHaveBeenCalledWith({
            text: 'Hello',
            voice: 'en-US-AvaNeural',
            rate: '+20%',
            volume: '-20%',
            pitch: '+0Hz',
        })

        const audioContext = latestAudioContext()
        expect(audioContext.decodedBytes).toEqual([[1, 2], [3]])
        expect(audioContext.sources).toHaveLength(1)
        expect(audioContext.sources[0].start).toHaveBeenCalledTimes(1)
        expect(onStartSpeaking).toHaveBeenCalledTimes(1)
        expect(onFinish).not.toHaveBeenCalled()

        audioContext.sources[0].dispatchEvent(new Event('ended'))
        expect(audioContext.sources).toHaveLength(2)
        expect(audioContext.sources[1].start).toHaveBeenCalledTimes(1)
        expect(onFinish).not.toHaveBeenCalled()

        audioContext.sources[1].dispatchEvent(new Event('ended'))
        expect(onFinish).toHaveBeenCalledTimes(1)
    })

    it('does not import the browser Edge TTS package on desktop', async () => {
        await speak({
            text: 'Hello',
            lang: 'en',
            signal: new AbortController().signal,
        })
        await fetchEdgeVoices()

        expect(edgeTtsUniversalImportMock).not.toHaveBeenCalled()
        expect(browserEdgeTtsMock).not.toHaveBeenCalled()
        expect(browserListVoicesMock).not.toHaveBeenCalled()
    })

    it('does not start the next returned segment after cancellation', async () => {
        const controller = new AbortController()
        const onFinish = vi.fn()

        await speak({
            text: 'Hello',
            lang: 'en',
            signal: controller.signal,
            onFinish,
        })

        const audioContext = latestAudioContext()
        expect(audioContext.sources).toHaveLength(1)

        controller.abort()

        expect(audioContext.sources).toHaveLength(1)
        expect(onFinish).not.toHaveBeenCalled()
    })

    it('does not wrap desktop native synthesis in the browser 15 second timeout', async () => {
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

        await speak({
            text: 'Hello',
            lang: 'en',
            signal: new AbortController().signal,
        })

        expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 15000)
    })

    it('ignores late desktop synthesis results after cancellation', async () => {
        let resolveSynthesis: (value: Awaited<ReturnType<typeof edgeTtsSynthesizeMock>>) => void = () => {}
        edgeTtsSynthesizeMock.mockReturnValue(
            new Promise((resolve) => {
                resolveSynthesis = resolve
            })
        )
        const controller = new AbortController()
        const onStartSpeaking = vi.fn()
        const onFinish = vi.fn()

        const speakPromise = speak({
            text: 'Hello',
            lang: 'en',
            signal: controller.signal,
            onStartSpeaking,
            onFinish,
        })
        controller.abort()
        resolveSynthesis({
            status: 'ok',
            data: {
                mimeType: 'audio/mpeg',
                audioSegments: ['AQI='],
            },
        })
        await speakPromise

        const audioContext = latestAudioContext()
        expect(audioContext.decodeAudioData).not.toHaveBeenCalled()
        expect(audioContext.createBufferSource).not.toHaveBeenCalled()
        expect(onStartSpeaking).not.toHaveBeenCalled()
        expect(onFinish).not.toHaveBeenCalled()
    })

    it('uses desktop voice command results and falls back to default voices on failure', async () => {
        await expect(fetchEdgeVoices()).resolves.toEqual([
            {
                name: 'Ava',
                lang: 'en-US',
                voiceURI: 'en-US-AvaNeural',
            },
        ])

        edgeTtsListVoicesMock.mockResolvedValueOnce({
            status: 'error',
            error: 'network: unavailable',
        })
        const fallbackVoices = await fetchEdgeVoices()

        expect(fallbackVoices).toContainEqual({
            name: 'en-US-JennyNeural',
            lang: 'en-US',
            voiceURI: 'en-US-JennyNeural',
        })
    })

    it('surfaces desktop Edge TTS failures without switching to system speech', async () => {
        const speechSynthesisSpeak = vi.fn()
        vi.stubGlobal('speechSynthesis', { speak: speechSynthesisSpeak })
        edgeTtsSynthesizeMock.mockResolvedValueOnce({
            status: 'error',
            error: 'auth: forbidden',
        })
        const onFinish = vi.fn()

        await expect(
            speak({
                text: 'Hello',
                lang: 'en',
                signal: new AbortController().signal,
                onFinish,
            })
        ).rejects.toThrow('Edge TTS: auth: forbidden')

        expect(onFinish).toHaveBeenCalledTimes(1)
        expect(speechSynthesisSpeak).not.toHaveBeenCalled()
    })
})
