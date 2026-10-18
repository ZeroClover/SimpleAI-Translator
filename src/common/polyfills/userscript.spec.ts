/* eslint-disable camelcase */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSSE, getSettings, setSettings } from '../utils'
import { userscriptBrowser, userscriptFetch } from './userscript'

const encoder = new TextEncoder()

interface FakeRequest {
    onreadystatechange(response: Record<string, unknown>): void
    onerror?(): void
    onabort?(): void
}

function stubGM(streaming: boolean, respond: (request: FakeRequest) => void) {
    const abort = vi.fn()
    const request = vi.fn((details: FakeRequest) => {
        queueMicrotask(() => respond(details))
        return { abort }
    })
    vi.stubGlobal('GM_xmlhttpRequest', Object.assign(request, streaming ? { RESPONSE_TYPE_STREAM: 'stream' } : {}))
    return { request, abort }
}

function head(status: number, headers: string) {
    return { status, statusText: status === 200 ? 'OK' : 'Error', responseHeaders: headers }
}

function streamOf(chunks: string[]) {
    return new ReadableStream({
        start(controller) {
            chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
            controller.close()
        },
    })
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('userscript fetch', () => {
    it('reads a whole multi-chunk JSON body in stream mode with its media type', async () => {
        const json = '{"choices":[{"message":{"content":"中文"}}]}'
        stubGM(true, (details) =>
            details.onreadystatechange({
                ...head(200, 'content-type: application/json; charset=utf-8\r\nx-request-id: 1\r\n'),
                readyState: XMLHttpRequest.HEADERS_RECEIVED,
                response: streamOf([json.slice(0, 10), json.slice(10, 25), json.slice(25)]),
            })
        )
        const response = await userscriptFetch('https://api.example.test', { method: 'POST' })
        expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
        await expect(response.json()).resolves.toEqual(JSON.parse(json))
    })

    it('reads a text response once it is done in text mode', async () => {
        stubGM(false, (details) => {
            details.onreadystatechange({ ...head(200, ''), readyState: XMLHttpRequest.HEADERS_RECEIVED })
            details.onreadystatechange({
                ...head(400, 'Content-Type: application/json\r\n'),
                readyState: XMLHttpRequest.DONE,
                responseText: '{"error":{"message":"bad"}}',
            })
        })
        const response = await userscriptFetch('https://api.example.test', { method: 'POST' })
        expect(response.status).toBe(400)
        expect(response.headers.get('content-type')).toBe('application/json')
        await expect(response.text()).resolves.toBe('{"error":{"message":"bad"}}')
    })

    it.each([true, false])('lets fetchSSE consume a direct JSON response (stream mode: %s)', async (streaming) => {
        const json = '{"content":[{"type":"text","text":"好"}]}'
        stubGM(streaming, (details) => {
            const base = head(200, 'content-type: application/json\r\n')
            details.onreadystatechange(
                streaming
                    ? {
                          ...base,
                          readyState: XMLHttpRequest.HEADERS_RECEIVED,
                          response: streamOf([json.slice(0, 7), json.slice(7)]),
                      }
                    : { ...base, readyState: XMLHttpRequest.DONE, responseText: json }
            )
        })
        const onJSONResponse = vi.fn(async () => {})
        const onMessage = vi.fn(async () => {})
        await fetchSSE('https://api.example.test', {
            fetcher: userscriptFetch,
            onMessage,
            onError: vi.fn(),
            onJSONResponse,
        })
        expect(onJSONResponse).toHaveBeenCalledWith(JSON.parse(json))
        expect(onMessage).not.toHaveBeenCalled()
    })

    it('streams SSE events in text mode until the body ends', async () => {
        stubGM(false, (details) =>
            details.onreadystatechange({
                ...head(200, 'content-type: text/event-stream\r\n'),
                readyState: XMLHttpRequest.DONE,
                responseText: 'data: a\n\ndata: b\n\n',
            })
        )
        const events: string[] = []
        await fetchSSE('https://api.example.test', {
            fetcher: userscriptFetch,
            onMessage: async (data) => {
                events.push(data)
            },
            onError: vi.fn(),
        })
        expect(events).toEqual(['a', 'b'])
    })

    it('rejects network errors and cancellation', async () => {
        stubGM(true, (details) => details.onerror?.())
        await expect(userscriptFetch('https://api.example.test', {})).rejects.toThrow('The userscript request failed.')

        const controller = new AbortController()
        const { abort } = stubGM(true, () => {})
        const pending = userscriptFetch('https://api.example.test', { signal: controller.signal })
        controller.abort()
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
        expect(abort).toHaveBeenCalledOnce()
    })
})

function stubGMStorage() {
    const values = new Map<string, unknown>()
    // Writes resolve on a later task so set() must await them to be observable.
    const later = () => new Promise((resolve) => setTimeout(resolve, 5))
    vi.stubGlobal('GM_info', {})
    vi.stubGlobal('GM', {
        getValue: async (key: string, fallback: unknown) => (values.has(key) ? values.get(key) : fallback),
        setValue: async (key: string, value: unknown) => {
            await later()
            values.set(key, value)
        },
        deleteValue: async (key: string) => {
            values.delete(key)
        },
    })
    return values
}

describe('userscript storage', () => {
    it('stores every defined value, including falsy ones, before set() resolves', async () => {
        const values = stubGMStorage()
        await userscriptBrowser.storage.sync.set({ off: false, empty: null, zero: 0, blank: '', skipped: undefined })
        expect(Object.fromEntries(values)).toEqual({ off: false, empty: null, zero: 0, blank: '' })
    })

    it('keeps Markdown rendering off after it is turned on and off again', async () => {
        stubGMStorage()
        const settings = await getSettings()
        expect(settings.renderMarkdown).toBe(false)
        await setSettings({ ...settings, renderMarkdown: true })
        expect((await getSettings()).renderMarkdown).toBe(true)
        await setSettings({ ...settings, renderMarkdown: false })
        expect((await getSettings()).renderMarkdown).toBe(false)
    })
})
