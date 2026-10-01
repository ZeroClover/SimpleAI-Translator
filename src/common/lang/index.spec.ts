import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getUniversalFetch } from '../universal-fetch'
import { getSettings } from '../utils'
import { bingDetectLang, detectLang } from '.'

vi.mock('../universal-fetch', () => ({ getUniversalFetch: vi.fn() }))
vi.mock('../utils', async () => {
    const actual = await vi.importActual<typeof import('../utils')>('../utils')
    return {
        ...actual,
        getSettings: vi.fn(),
    }
})

function mockEngine(languageDetectionEngine: string) {
    vi.mocked(getSettings).mockResolvedValue({ languageDetectionEngine } as Awaited<ReturnType<typeof getSettings>>)
}

function mockBingDetection(language: string) {
    vi.mocked(getUniversalFetch).mockReturnValue(
        vi.fn(async (url: string) => {
            if (url.includes('/translate/auth')) {
                return new Response('token')
            }
            return new Response(JSON.stringify([{ language }]))
        })
    )
}

describe('language detection', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it.each([
        ['zh-Hans', 'zh-Hans'],
        ['zh-Hant', 'zh-Hant'],
        ['yue', 'yue'],
        ['pt', 'pt'],
        ['pt-PT', 'pt'],
        ['mn-Cyrl', 'mn'],
        ['fr-CA', 'fr'],
        ['ja', 'ja'],
    ])('maps Bing language %s to %s', async (bingCode, langCode) => {
        mockBingDetection(bingCode)

        await expect(bingDetectLang('text')).resolves.toBe(langCode)
    })

    it('maps unsupported Bing languages to en', async () => {
        mockBingDetection('sw')

        await expect(bingDetectLang('text')).resolves.toBe('en')
    })

    it.each(['google', 'baidu', 'bing'])('falls back to local detection when %s detection throws', async (engine) => {
        mockEngine(engine)
        vi.mocked(getUniversalFetch).mockReturnValue(
            vi.fn(async () => {
                throw new TypeError('Failed to fetch')
            })
        )

        await expect(detectLang('今天天气很好')).resolves.toBe('zh-Hans')
    })

    it('keeps en for a non-successful remote response', async () => {
        mockEngine('baidu')
        vi.mocked(getUniversalFetch).mockReturnValue(vi.fn(async () => new Response('', { status: 500 })))

        await expect(detectLang('今天天气很好')).resolves.toBe('en')
    })

    it('detects locally without network requests by default', async () => {
        mockEngine('local')

        await expect(detectLang('Ça va très bien.')).resolves.toBe('fr')
        expect(getUniversalFetch).not.toHaveBeenCalled()
    })
})
