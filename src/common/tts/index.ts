import { DoSpeakOptions, SpeakOptions, TTSProvider } from './types'
import { getSettings } from '../utils'
import { speak as edgeSpeak } from './edge-tts'
import { LangCode } from '../lang'
import { speak as openAISpeak } from './openai-tts'

export const defaultTTSProvider: TTSProvider = 'edge'

export const langCode2TTSLang: Partial<Record<LangCode, string>> = {
    'en': 'en-US',
    'zh-Hans': 'zh-CN',
    'zh-Hant': 'zh-TW',
    'yue': 'zh-HK',
    'lzh': 'zh-CN',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'fr': 'fr-FR',
    'de': 'de-DE',
    'es': 'es-ES',
    'it': 'it-IT',
    'ru': 'ru-RU',
    'pt': 'pt-PT',
    'nl': 'nl-NL',
    'pl': 'pl-PL',
    'ar': 'ar-001',
    'bg': 'bg-BG',
    'ca': 'ca-ES',
    'cs': 'cs-CZ',
    'da': 'da-DK',
    'el': 'el-GR',
    'fi': 'fi-FI',
    'he': 'he-IL',
    'hi': 'hi-IN',
    'hr': 'hr-HR',
    'id': 'id-ID',
    'vi': 'vi-VN',
    'sv': 'sv-SE',
}

export const ttsLangTestTextMap: Partial<Record<keyof typeof langCode2TTSLang, string>> = {
    'en': 'Hello, welcome to SimpleAI Translator',
    'zh-Hans': '你好，欢迎使用 SimpleAI Translator',
    'zh-Hant': '你好，歡迎使用 SimpleAI Translator',
    'yue': '你好，歡迎使用 SimpleAI Translator',
    'lzh': '你好，歡迎使用 SimpleAI Translator',
    'ja': 'こんにちは、SimpleAI Translator をご利用いただきありがとうございます',
    'ko': '안녕하세요, SimpleAI Translator 를 사용해 주셔서 감사합니다',
    'fr': "Bonjour, merci d'utiliser SimpleAI Translator",
    'de': 'Hallo, vielen Dank, dass Sie SimpleAI Translator verwenden',
    'es': 'Hola, gracias por usar SimpleAI Translator',
    'it': 'Ciao, grazie per aver utilizzato SimpleAI Translator',
    'ru': 'Здравствуйте, спасибо за использование SimpleAI Translator',
    'pt': 'Olá, obrigado por usar o SimpleAI Translator',
    'nl': 'Hallo, bedankt voor het gebruik van SimpleAI Translator',
    'pl': 'Cześć, dziękujemy za korzystanie z SimpleAI Translator',
    'ar': 'مرحبًا ، شكرًا لك على استخدام SimpleAI Translator',
    'bg': 'Здравейте, благодаря ви, че използвате SimpleAI Translator',
    'ca': 'Hola, gràcies per utilitzar SimpleAI Translator',
    'cs': 'Ahoj, děkujeme, že používáte SimpleAI Translator',
    'da': 'Hej, tak fordi du bruger SimpleAI Translator',
    'el': 'Γεια σας, ευχαριστούμε που χρησιμοποιείτε το SimpleAI Translator',
    'fi': 'Hei, kiitos, että käytät SimpleAI Translator',
    'he': 'שלום, תודה שהשתמשת ב- SimpleAI Translator',
    'hi': 'नमस्ते, SimpleAI Translator का उपयोग करने के लिए धन्यवाद',
    'hr': 'Bok, hvala što koristite SimpleAI Translator',
    'id': 'Halo, terima kasih telah menggunakan SimpleAI Translator',
    'vi': 'Xin chào, cảm ơn bạn đã sử dụng SimpleAI Translator',
    'sv': 'Hej, tack för att du använder SimpleAI Translator',
}

let supportVoices: SpeechSynthesisVoice[] = []
if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
        supportVoices = speechSynthesis.getVoices()
    }
}

export async function speak({ text, lang, onFinish, signal }: SpeakOptions) {
    const settings = await getSettings()
    const voiceCfg = settings.tts?.voices?.find((item) => item.lang === lang)
    const rate = settings.tts?.rate
    const volume = settings.tts?.volume
    const provider = settings.tts?.provider ?? defaultTTSProvider

    return await doSpeak({
        provider,
        text,
        lang: lang ?? 'en',
        voice: voiceCfg?.voice,
        rate,
        volume,
        onFinish,
        signal,
    })
}

export async function doSpeak({
    provider,
    text,
    lang,
    voice,
    rate: rate_,
    volume,
    onFinish,
    signal,
    onStartSpeaking,
}: DoSpeakOptions) {
    const rate = (rate_ ?? 10) / 10

    if (provider === 'edge') {
        return edgeSpeak({
            text,
            lang,
            onFinish,
            voice: voice,
            rate,
            volume: volume ?? 100,
            signal,
            onStartSpeaking,
        })
    }

    if (provider === 'openai') {
        return openAISpeak({
            text,
            lang,
            onFinish,
            signal,
            onStartSpeaking,
        })
    }

    const ttsLang = langCode2TTSLang[lang] ?? 'en-US'

    const utterance = new SpeechSynthesisUtterance()
    if (onFinish) {
        utterance.addEventListener('end', onFinish, { once: true })
    }

    utterance.text = text
    utterance.lang = ttsLang
    utterance.rate = rate
    utterance.volume = volume ? volume / 100 : 1

    const defaultVoice = supportVoices.find((v) => v.lang === ttsLang) ?? null
    const settingsVoice = supportVoices.find((v) => v.voiceURI === voice)
    utterance.voice = settingsVoice ?? defaultVoice

    signal.addEventListener(
        'abort',
        () => {
            speechSynthesis.cancel()
        },
        { once: true }
    )

    onStartSpeaking?.()
    speechSynthesis.speak(utterance)
}
