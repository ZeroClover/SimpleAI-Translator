import toast from 'react-hot-toast/headless'
import { langCode2TTSLang } from '.'
import { SpeakOptions } from './types'
import { isTauri } from '../utils'

// https://github.com/microsoft/cognitive-services-speech-sdk-js/blob/e6faf6b7fc1febb45993b940617719e8ed1358b2/src/sdk/SpeechSynthesizer.ts#L216
const languageToDefaultVoice: { [key: string]: string } = {
    ['af-ZA']: 'af-ZA-AdriNeural',
    ['am-ET']: 'am-ET-AmehaNeural',
    ['ar-AE']: 'ar-AE-FatimaNeural',
    ['ar-BH']: 'ar-BH-AliNeural',
    ['ar-DZ']: 'ar-DZ-AminaNeural',
    ['ar-EG']: 'ar-EG-SalmaNeural',
    ['ar-IQ']: 'ar-IQ-BasselNeural',
    ['ar-JO']: 'ar-JO-SanaNeural',
    ['ar-KW']: 'ar-KW-FahedNeural',
    ['ar-LY']: 'ar-LY-ImanNeural',
    ['ar-MA']: 'ar-MA-JamalNeural',
    ['ar-QA']: 'ar-QA-AmalNeural',
    ['ar-SA']: 'ar-SA-HamedNeural',
    ['ar-SY']: 'ar-SY-AmanyNeural',
    ['ar-TN']: 'ar-TN-HediNeural',
    ['ar-YE']: 'ar-YE-MaryamNeural',
    ['az-AZ']: 'az-AZ-BabekNeural',
    ['bg-BG']: 'bg-BG-BorislavNeural',
    ['bn-BD']: 'bn-BD-NabanitaNeural',
    ['bn-IN']: 'bn-IN-BashkarNeural',
    ['bs-BA']: 'bs-BA-VesnaNeural',
    ['ca-ES']: 'ca-ES-JoanaNeural',
    ['cs-CZ']: 'cs-CZ-AntoninNeural',
    ['cy-GB']: 'cy-GB-AledNeural',
    ['da-DK']: 'da-DK-ChristelNeural',
    ['de-AT']: 'de-AT-IngridNeural',
    ['de-CH']: 'de-CH-JanNeural',
    ['de-DE']: 'de-DE-KatjaNeural',
    ['el-GR']: 'el-GR-AthinaNeural',
    ['en-AU']: 'en-AU-NatashaNeural',
    ['en-CA']: 'en-CA-ClaraNeural',
    ['en-GB']: 'en-GB-LibbyNeural',
    ['en-HK']: 'en-HK-SamNeural',
    ['en-IE']: 'en-IE-ConnorNeural',
    ['en-IN']: 'en-IN-NeerjaNeural',
    ['en-KE']: 'en-KE-AsiliaNeural',
    ['en-NG']: 'en-NG-AbeoNeural',
    ['en-NZ']: 'en-NZ-MitchellNeural',
    ['en-PH']: 'en-PH-JamesNeural',
    ['en-SG']: 'en-SG-LunaNeural',
    ['en-TZ']: 'en-TZ-ElimuNeural',
    ['en-US']: 'en-US-JennyNeural',
    ['en-ZA']: 'en-ZA-LeahNeural',
    ['es-AR']: 'es-AR-ElenaNeural',
    ['es-BO']: 'es-BO-MarceloNeural',
    ['es-CL']: 'es-CL-CatalinaNeural',
    ['es-CO']: 'es-CO-GonzaloNeural',
    ['es-CR']: 'es-CR-JuanNeural',
    ['es-CU']: 'es-CU-BelkysNeural',
    ['es-DO']: 'es-DO-EmilioNeural',
    ['es-EC']: 'es-EC-AndreaNeural',
    ['es-ES']: 'es-ES-AlvaroNeural',
    ['es-GQ']: 'es-GQ-JavierNeural',
    ['es-GT']: 'es-GT-AndresNeural',
    ['es-HN']: 'es-HN-CarlosNeural',
    ['es-MX']: 'es-MX-DaliaNeural',
    ['es-NI']: 'es-NI-FedericoNeural',
    ['es-PA']: 'es-PA-MargaritaNeural',
    ['es-PE']: 'es-PE-AlexNeural',
    ['es-PR']: 'es-PR-KarinaNeural',
    ['es-PY']: 'es-PY-MarioNeural',
    ['es-SV']: 'es-SV-LorenaNeural',
    ['es-US']: 'es-US-AlonsoNeural',
    ['es-UY']: 'es-UY-MateoNeural',
    ['es-VE']: 'es-VE-PaolaNeural',
    ['et-EE']: 'et-EE-AnuNeural',
    ['fa-IR']: 'fa-IR-DilaraNeural',
    ['fi-FI']: 'fi-FI-SelmaNeural',
    ['fil-PH']: 'fil-PH-AngeloNeural',
    ['fr-BE']: 'fr-BE-CharlineNeural',
    ['fr-CA']: 'fr-CA-SylvieNeural',
    ['fr-CH']: 'fr-CH-ArianeNeural',
    ['fr-FR']: 'fr-FR-DeniseNeural',
    ['ga-IE']: 'ga-IE-ColmNeural',
    ['gl-ES']: 'gl-ES-RoiNeural',
    ['gu-IN']: 'gu-IN-DhwaniNeural',
    ['he-IL']: 'he-IL-AvriNeural',
    ['hi-IN']: 'hi-IN-MadhurNeural',
    ['hr-HR']: 'hr-HR-GabrijelaNeural',
    ['hu-HU']: 'hu-HU-NoemiNeural',
    ['id-ID']: 'id-ID-ArdiNeural',
    ['is-IS']: 'is-IS-GudrunNeural',
    ['it-IT']: 'it-IT-IsabellaNeural',
    ['ja-JP']: 'ja-JP-NanamiNeural',
    ['jv-ID']: 'jv-ID-DimasNeural',
    ['ka-GE']: 'ka-GE-EkaNeural',
    ['kk-KZ']: 'kk-KZ-AigulNeural',
    ['km-KH']: 'km-KH-PisethNeural',
    ['kn-IN']: 'kn-IN-GaganNeural',
    ['ko-KR']: 'ko-KR-SunHiNeural',
    ['lo-LA']: 'lo-LA-ChanthavongNeural',
    ['lt-LT']: 'lt-LT-LeonasNeural',
    ['lv-LV']: 'lv-LV-EveritaNeural',
    ['mk-MK']: 'mk-MK-AleksandarNeural',
    ['ml-IN']: 'ml-IN-MidhunNeural',
    ['mr-IN']: 'mr-IN-AarohiNeural',
    ['ms-MY']: 'ms-MY-OsmanNeural',
    ['mt-MT']: 'mt-MT-GraceNeural',
    ['mn-MN']: 'mn-MN-BataaNeural',
    ['my-MM']: 'my-MM-NilarNeural',
    ['nb-NO']: 'nb-NO-PernilleNeural',
    ['nl-BE']: 'nl-BE-ArnaudNeural',
    ['nl-NL']: 'nl-NL-ColetteNeural',
    ['pl-PL']: 'pl-PL-AgnieszkaNeural',
    ['ps-AF']: 'ps-AF-GulNawazNeural',
    ['pt-BR']: 'pt-BR-FranciscaNeural',
    ['pt-PT']: 'pt-PT-DuarteNeural',
    ['ro-RO']: 'ro-RO-AlinaNeural',
    ['ru-RU']: 'ru-RU-SvetlanaNeural',
    ['si-LK']: 'si-LK-SameeraNeural',
    ['sk-SK']: 'sk-SK-LukasNeural',
    ['sl-SI']: 'sl-SI-PetraNeural',
    ['so-SO']: 'so-SO-MuuseNeural',
    ['sr-RS']: 'sr-RS-NicholasNeural',
    ['su-ID']: 'su-ID-JajangNeural',
    ['sv-SE']: 'sv-SE-SofieNeural',
    ['sw-KE']: 'sw-KE-RafikiNeural',
    ['sw-TZ']: 'sw-TZ-DaudiNeural',
    ['ta-IN']: 'ta-IN-PallaviNeural',
    ['ta-LK']: 'ta-LK-KumarNeural',
    ['ta-SG']: 'ta-SG-AnbuNeural',
    ['te-IN']: 'te-IN-MohanNeural',
    ['th-TH']: 'th-TH-PremwadeeNeural',
    ['tr-TR']: 'tr-TR-AhmetNeural',
    ['uk-UA']: 'uk-UA-OstapNeural',
    ['ur-IN']: 'ur-IN-GulNeural',
    ['ur-PK']: 'ur-PK-AsadNeural',
    ['uz-UZ']: 'uz-UZ-MadinaNeural',
    ['vi-VN']: 'vi-VN-HoaiMyNeural',
    ['zh-CN']: 'zh-CN-XiaoxiaoNeural',
    ['zh-HK']: 'zh-HK-HiuMaanNeural',
    ['zh-TW']: 'zh-TW-HsiaoChenNeural',
    ['zu-ZA']: 'zu-ZA-ThandoNeural',
}

interface EdgeTTSOptions extends SpeakOptions {
    voice?: string
    rate?: number
    volume?: number
}

const EDGE_AUDIO_MIME_TYPE = 'audio/mpeg'

export async function speak({
    text,
    lang: lang_,
    onFinish,
    voice,
    rate = 1,
    volume = 100,
    signal,
    onStartSpeaking,
}: EdgeTTSOptions) {
    if (signal.aborted) return
    const lang = langCode2TTSLang[lang_ ?? 'en'] ?? 'en-US'
    const selectedVoice = voice?.trim() || languageToDefaultVoice[lang] || 'en-US-JennyNeural'

    // Convert rate and volume to proper format
    // rate: 1 = +0%, 1.2 = +20%, 0.8 = -20%
    const rateStr = rate >= 1 ? `+${Math.round((rate - 1) * 100)}%` : `-${Math.round((1 - rate) * 100)}%`
    // volume: 100 = +0%, 120 = +20%, 80 = -20%
    const volumeStr = volume >= 100 ? `+${Math.round(volume - 100)}%` : `-${Math.round(100 - volume)}%`

    try {
        const request = { text, voice: selectedVoice, rate: rateStr, volume: volumeStr }
        await playEdgeAudio(
            (isStopped) => (isTauri() ? synthesizeDesktopEdge(request, isStopped) : synthesizeBrowserEdge(request)),
            { signal, onFinish, onStartSpeaking }
        )
    } catch (error) {
        if (signal.aborted) {
            return
        }
        console.error('Edge TTS error:', error)
        toast(getEdgeTTSErrorMessage(error))
        onFinish?.()
        throw error
    }
}

function getEdgeTTSErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    return message.startsWith('Edge TTS') ? message : `Edge TTS: ${message}`
}

interface EdgeSynthesisRequest {
    text: string
    voice: string
    rate: string
    volume: string
}

// Plays the synthesized segments in order through one AudioContext. `synthesize` returns
// undefined when playback was stopped while it ran. Stopping releases the AudioContext and
// prevents later segments from starting; onFinish runs once after the last segment ends.
async function playEdgeAudio(
    synthesize: (isStopped: () => boolean) => Promise<ArrayBuffer[] | undefined>,
    { signal, onFinish, onStartSpeaking }: Pick<SpeakOptions, 'signal' | 'onFinish' | 'onStartSpeaking'>
) {
    const audioContext = new AudioContext()
    let audioBufferSource: AudioBufferSourceNode | null = null
    let stopped = false
    const isStopped = () => stopped || signal.aborted

    const stopPlayback = () => {
        signal.removeEventListener('abort', stopPlayback)
        stopped = true
        if (audioBufferSource) {
            try {
                audioBufferSource.stop()
            } catch {
                // The source may already have ended.
            }
        }
        void audioContext.close().catch(() => {})
    }
    signal.addEventListener('abort', stopPlayback, { once: true })

    try {
        const segments = await synthesize(isStopped)
        if (!segments || isStopped()) {
            return
        }

        const audioBuffers: AudioBuffer[] = []
        for (const segment of segments) {
            if (isStopped()) {
                return
            }
            const audioBuffer = await audioContext.decodeAudioData(segment).catch((error) => {
                if (isStopped()) {
                    return null
                }
                throw error
            })
            if (!audioBuffer) {
                return
            }
            audioBuffers.push(audioBuffer)
        }

        if (isStopped()) {
            return
        }

        let segmentIndex = 0
        const playCurrentSegment = () => {
            const source = audioContext.createBufferSource()
            audioBufferSource = source
            source.buffer = audioBuffers[segmentIndex]
            source.connect(audioContext.destination)
            source.addEventListener(
                'ended',
                () => {
                    if (isStopped()) {
                        return
                    }

                    segmentIndex += 1
                    if (segmentIndex < audioBuffers.length) {
                        playCurrentSegment()
                        return
                    }

                    signal.removeEventListener('abort', stopPlayback)
                    onFinish?.()
                    void audioContext.close().catch(() => {})
                },
                { once: true }
            )

            if (segmentIndex === 0) {
                onStartSpeaking?.()
            }
            source.start()
        }

        playCurrentSegment()
    } catch (error) {
        if (!stopped) stopPlayback()
        throw error
    }
}

// The native command synthesizes each text segment and returns its MP3 audio as base64.
async function synthesizeDesktopEdge(
    { text, voice, rate, volume }: EdgeSynthesisRequest,
    isStopped: () => boolean
): Promise<ArrayBuffer[] | undefined> {
    const { commands } = await import('../../tauri/bindings')
    const result = await commands.edgeTtsSynthesize({ text, voice, rate, volume, pitch: '+0Hz' }).catch((error) => {
        if (isStopped()) {
            return null
        }
        throw error
    })

    if (!result || isStopped()) {
        return undefined
    }
    if (result.status === 'error') {
        throw new Error(`Edge TTS: ${result.error}`)
    }
    if (result.data.mimeType !== EDGE_AUDIO_MIME_TYPE) {
        throw new Error(`Edge TTS: unsupported audio type ${result.data.mimeType}`)
    }
    if (!result.data.audioSegments.length) {
        throw new Error('Edge TTS: no audio received')
    }
    return result.data.audioSegments.map((segment) => {
        const audio = base64ToArrayBuffer(segment)
        if (!audio.byteLength) {
            throw new Error('Edge TTS: empty audio segment')
        }
        return audio
    })
}

// The browser synthesizes the whole text as one segment.
async function synthesizeBrowserEdge({ text, voice, rate, volume }: EdgeSynthesisRequest): Promise<ArrayBuffer[]> {
    const { EdgeTTS } = await import('edge-tts-universal')
    const tts = new EdgeTTS(text, voice, {
        rate,
        volume,
        pitch: '+0Hz',
    })

    let timeout: ReturnType<typeof setTimeout> | undefined
    const result = await Promise.race([
        tts.synthesize(),
        new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('Edge TTS: synthesis timeout')), 15000)
        }),
    ]).finally(() => clearTimeout(timeout))

    if (!result || !result.audio) {
        throw new Error('Edge TTS: no audio received')
    }
    const audio = await result.audio.arrayBuffer()
    if (!audio || audio.byteLength === 0) {
        throw new Error('Edge TTS: empty audio data')
    }
    return [audio]
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
}

export async function fetchEdgeVoices() {
    try {
        if (isTauri()) {
            const { commands } = await import('../../tauri/bindings')
            const result = await commands.edgeTtsListVoices()

            if (result.status === 'error') {
                throw new Error(`Edge TTS: ${result.error}`)
            }

            return result.data.map((voice) => ({
                name: voice.friendlyName || voice.shortName,
                lang: voice.locale,
                voiceURI: voice.shortName,
            })) as SpeechSynthesisVoice[]
        }

        const { listVoices } = await import('edge-tts-universal')
        const voices = await listVoices()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return voices.map((voice: any) => ({
            name: voice.FriendlyName || voice.ShortName,
            lang: voice.Locale,
            voiceURI: voice.ShortName || voice.Name,
        })) as SpeechSynthesisVoice[]
    } catch (error) {
        console.error('Failed to fetch Edge voices:', error)
        // Fallback: return default voices from languageToDefaultVoice
        return Object.entries(languageToDefaultVoice).map(([locale, voiceName]) => ({
            name: voiceName,
            lang: locale,
            voiceURI: voiceName,
        })) as SpeechSynthesisVoice[]
    }
}
