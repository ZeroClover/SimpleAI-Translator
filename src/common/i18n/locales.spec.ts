import { describe, expect, it } from 'vitest'

const locales = import.meta.glob<Record<string, string>>('./locales/*/translation.json', {
    eager: true,
    import: 'default',
})

describe('i18n locales', () => {
    it('ships the six supported locales', () => {
        expect(Object.keys(locales).sort()).toEqual(
            ['en', 'ja', 'th', 'tr', 'zh-Hans', 'zh-Hant'].map((lang) => `./locales/${lang}/translation.json`)
        )
    })

    it('keeps identical key sets across all locales', () => {
        const enKeys = Object.keys(locales['./locales/en/translation.json']).sort()
        for (const [path, translation] of Object.entries(locales)) {
            expect(Object.keys(translation).sort(), path).toEqual(enKeys)
        }
    })
})
