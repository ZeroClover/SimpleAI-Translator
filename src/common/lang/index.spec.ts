import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getUniversalFetch } from '../universal-fetch'
import { getSettings } from '../utils'
import { bingDetectLang, detectLang, googleDetectLang } from '.'

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

    it('sends the Google detection query parameters', async () => {
        const urls: string[] = []
        vi.mocked(getUniversalFetch).mockReturnValue(
            vi.fn(async (url: string) => {
                urls.push(url)
                return new Response(JSON.stringify([null, null, 'ja']))
            })
        )

        await expect(googleDetectLang('a b&c')).resolves.toBe('ja')

        const url = new URL(urls[0])
        expect(url.origin + url.pathname).toBe('https://translate.google.com/translate_a/single')
        expect(Array.from(url.searchParams.entries())).toEqual([
            ...['at', 'bd', 'ex', 'ld', 'md', 'qca', 'rw', 'rm', 'ss', 't'].map((dt) => ['dt', dt]),
            ['client', 'gtx'],
            ['sl', 'auto'],
            ['tl', 'zh-CN'],
            ['hl', 'zh-CN'],
            ['ie', 'UTF-8'],
            ['oe', 'UTF-8'],
            ['otf', '1'],
            ['ssel', '0'],
            ['tsel', '0'],
            ['kc', '7'],
            ['q', 'a b&c'],
        ])
    })

    it('sends the Bing detection query parameters', async () => {
        const fetcher = vi.fn(async (url: string) =>
            url.includes('/translate/auth') ? new Response('token') : new Response(JSON.stringify([{ language: 'ja' }]))
        )
        vi.mocked(getUniversalFetch).mockReturnValue(fetcher)

        await expect(bingDetectLang('text')).resolves.toBe('ja')

        const url = new URL(fetcher.mock.calls[1][0])
        expect(url.origin + url.pathname).toBe('https://api-edge.cognitive.microsofttranslator.com/detect')
        expect(Array.from(url.searchParams.entries())).toEqual([['api-version', '3.0']])
    })

    it('reports unsupported Bing languages as unknown', async () => {
        mockBingDetection('sw')

        await expect(bingDetectLang('text')).resolves.toBeUndefined()
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

    it.each(['google', 'baidu', 'bing'])('falls back locally for a non-successful %s response', async (engine) => {
        mockEngine(engine)
        vi.mocked(getUniversalFetch).mockReturnValue(vi.fn(async () => new Response('', { status: 500 })))

        await expect(detectLang('今天天气很好')).resolves.toBe('zh-Hans')
    })

    it('detects locally without network requests by default', async () => {
        mockEngine('local')

        await expect(detectLang('Ça va très bien.')).resolves.toBe('fr')
        expect(getUniversalFetch).not.toHaveBeenCalled()
    })

    it.each([
        ['google', [null, null, 'unknown']],
        ['google', []],
        ['baidu', { lan: 'unknown' }],
        ['baidu', {}],
        ['bing', [{ language: 'unknown' }]],
        ['bing', []],
    ])('uses local detection for an unknown or empty %s result', async (engine, body) => {
        mockEngine(engine as string)
        vi.mocked(getUniversalFetch).mockReturnValue(
            vi.fn(async (url: string) => new Response(url.includes('/translate/auth') ? 'token' : JSON.stringify(body)))
        )
        await expect(detectLang('今天天气很好')).resolves.toBe('zh-Hans')
    })
})
