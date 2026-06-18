import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import Backend from 'i18next-http-backend'
import LanguageDetector from 'i18next-browser-languagedetector'

import ENtranslation from './locales/en/translation.json'
import JAtranslation from './locales/ja/translation.json'
import THtranslation from './locales/th/translation.json'
import zhHanstranslation from './locales/zh-Hans/translation.json'
import zhHanttranslation from './locales/zh-Hant/translation.json'
import TRtranslation from './locales/tr/translation.json'

const resources = {
    'zh-Hans': {
        translation: zhHanstranslation,
    },
    'zh-Hant': {
        translation: zhHanttranslation,
    },
    'en': {
        translation: ENtranslation,
    },
    'ja': {
        translation: JAtranslation,
    },
    'th': {
        translation: THtranslation,
    },
    'tr': {
        translation: TRtranslation,
    },
}

i18n.use(Backend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'en',

        interpolation: {
            escapeValue: false,
        },
        // prevent creating i18nextLng in localStorage for each domain
        detection: {
            caches: [],
        },
    })

export default i18n
