import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSSE } from './utils'

afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
})

const encoder = new TextEncoder()

function bytes(...parts: Array<string | number[]>): Uint8Array[] {
    return parts.map((part) => (typeof part === 'string' ? encoder.encode(part) : new Uint8Array(part)))
}

// Splits text into chunks of `size` bytes so multi-byte characters straddle boundaries.
function splitBytes(text: string, size: number): Uint8Array[] {
    const all = encoder.encode(text)
    const chunks: Uint8Array[] = []
    for (let index = 0; index < all.length; index += size) {
        chunks.push(all.slice(index, index + size))
    }
    return chunks
}

function streamResponse(chunks: Uint8Array[], init: ResponseInit = {}): Response {
    return new Response(
        new ReadableStream({
            start(controller) {
                chunks.forEach((chunk) => controller.enqueue(chunk))
                controller.close()
            },
        }),
        init
    )
}

function browserOptions(response: Response, overrides: Record<string, unknown> = {}) {
    const events: string[] = []
    const options = {
        fetcher: vi.fn(async () => response),
        onMessage: vi.fn(async (data: string) => {
            events.push(data)
        }),
        onError: vi.fn(),
        onStatusCode: vi.fn(),
        ...overrides,
    }
    return { options, events }
}

const SSE_HEADERS = { 'Content-Type': 'text/event-stream; charset=utf-8' }

describe('browser stream transport', () => {
    it('reassembles UTF-8 characters split across chunks', async () => {
        const payload = '{"translatedText":"中文😀好"}'
        const { options, events } = browserOptions(
            streamResponse(splitBytes(`data: ${payload}\n\ndata: [DONE]\n\n`, 1), { headers: SSE_HEADERS })
        )
        await fetchSSE('https://example.test', options)
        expect(events).toEqual([payload, '[DONE]'])
        expect(events.join('')).not.toContain('�')
    })

    it('rejects an invalid UTF-8 body with a readable error', async () => {
        const { options } = browserOptions(streamResponse(bytes('data: a', [0xff], '\n\n'), { headers: SSE_HEADERS }))
        await expect(fetchSSE('https://example.test', options)).rejects.toThrow('The response body is not valid UTF-8.')
    })

    it('rejects a body that ends inside a multi-byte character', async () => {
        const { options } = browserOptions(
            streamResponse([encoder.encode('data: 你').slice(0, -1)], { headers: SSE_HEADERS })
        )
        await expect(fetchSSE('https://example.test', options)).rejects.toThrow('The response body is not valid UTF-8.')
    })

    it('waits for each asynchronous consumer before handling the next event', async () => {
        const order: string[] = []
        let active = 0
        const { options } = browserOptions(
            streamResponse(bytes('data: a\n\ndata: b\n\ndata: c\n\n'), { headers: SSE_HEADERS }),
            {
                onMessage: vi.fn(async (data: string) => {
                    active += 1
                    expect(active).toBe(1)
                    order.push(`start:${data}`)
                    await new Promise((resolve) => setTimeout(resolve, 5))
                    order.push(`end:${data}`)
                    active -= 1
                }),
            }
        )
        await fetchSSE('https://example.test', options)
        expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c'])
    })

    it('drains every event in the last packet before resolving', async () => {
        const order: string[] = []
        const { options } = browserOptions(
            streamResponse(bytes('data: tail\n\ndata: [DONE]\n\n'), { headers: SSE_HEADERS }),
            {
                onMessage: vi.fn(async (data: string) => {
                    await new Promise((resolve) => setTimeout(resolve, 5))
                    order.push(data)
                }),
            }
        )
        await fetchSSE('https://example.test', options)
        order.push('resolved')
        expect(order).toEqual(['tail', '[DONE]', 'resolved'])
    })

    it('rejects when an asynchronous consumer fails and stops consuming', async () => {
        const unhandled = vi.fn()
        process.on('unhandledRejection', unhandled)
        try {
            const onMessage = vi.fn(async (data: string) => {
                if (data === 'b') {
                    throw new Error('consumer failed')
                }
            })
            const { options } = browserOptions(
                streamResponse(bytes('data: a\n\ndata: b\n\ndata: c\n\n'), { headers: SSE_HEADERS }),
                { onMessage }
            )
            await expect(fetchSSE('https://example.test', options)).rejects.toThrow('consumer failed')
            expect(onMessage.mock.calls.map(([data]) => data)).toEqual(['a', 'b'])
            await new Promise((resolve) => setTimeout(resolve, 0))
            expect(unhandled).not.toHaveBeenCalled()
        } finally {
            process.off('unhandledRejection', unhandled)
        }
    })

    it.each(['application/json', 'application/json; charset=utf-8', 'application/vnd.api+json'])(
        'passes a complete %s response to onJSONResponse',
        async (contentType) => {
            const onJSONResponse = vi.fn(async () => {})
            const { options } = browserOptions(
                streamResponse(splitBytes('{"choices":[{"message":{"content":"中文"}}]}', 3), {
                    headers: { 'Content-Type': contentType },
                }),
                { onJSONResponse }
            )
            await fetchSSE('https://example.test', options)
            expect(options.fetcher).toHaveBeenCalledOnce()
            expect(onJSONResponse).toHaveBeenCalledWith({ choices: [{ message: { content: '中文' } }] })
            expect(options.onMessage).not.toHaveBeenCalled()
        }
    )

    it('rejects a JSON media type response that is not valid JSON', async () => {
        const onJSONResponse = vi.fn(async () => {})
        const { options } = browserOptions(
            streamResponse(bytes('{"choices":'), { headers: { 'Content-Type': 'application/json' } }),
            { onJSONResponse }
        )
        await expect(fetchSSE('https://example.test', options)).rejects.toThrow('The response is not valid JSON.')
        expect(onJSONResponse).not.toHaveBeenCalled()
    })

    it('keeps SSE parsing when the media type is missing or JSON responses are not requested', async () => {
        const onJSONResponse = vi.fn(async () => {})
        const missing = browserOptions(streamResponse(bytes('data: a\n\n')), { onJSONResponse })
        await fetchSSE('https://example.test', missing.options)
        expect(missing.events).toEqual(['a'])
        expect(onJSONResponse).not.toHaveBeenCalled()

        const plain = browserOptions(
            streamResponse(bytes('data: b\n\n'), { headers: { 'Content-Type': 'application/json' } })
        )
        await fetchSSE('https://example.test', plain.options)
        expect(plain.events).toEqual(['b'])
    })

    it('reports a non-200 error body once after it is complete', async () => {
        const body = '{"error":{"message":"Streaming is not supported","param":"stream"}}'
        const { options } = browserOptions(
            streamResponse(splitBytes(body, 4), { status: 400, headers: { 'Content-Type': 'application/json' } })
        )
        await fetchSSE('https://example.test', options)
        expect(options.onStatusCode).toHaveBeenCalledWith(400)
        expect(options.onError).toHaveBeenCalledOnce()
        expect(options.onError).toHaveBeenCalledWith(JSON.parse(body))
        expect(options.onMessage).not.toHaveBeenCalled()
    })

    it.each(['', '  \n'])('reports an empty error body as undefined (%j)', async (body) => {
        const { options } = browserOptions(streamResponse(bytes(body), { status: 502 }))
        await fetchSSE('https://example.test', options)
        expect(options.onError).toHaveBeenCalledOnce()
        expect(options.onError).toHaveBeenCalledWith(undefined)
    })

    it('reports a non-JSON error body as text', async () => {
        const { options } = browserOptions(streamResponse(bytes('Bad ', 'Gateway'), { status: 502 }))
        await fetchSSE('https://example.test', options)
        expect(options.onError).toHaveBeenCalledWith('Bad Gateway')
    })
})

describe('stream cancellation', () => {
    const options = (signal: AbortSignal, fetcher: () => Promise<Response>) => ({
        signal,
        fetcher: vi.fn(fetcher),
        onMessage: vi.fn(async () => {}),
        onError: vi.fn(),
    })

    it('does not call the fetcher when the signal is already aborted', async () => {
        const controller = new AbortController()
        controller.abort()
        const request = options(controller.signal, async () => streamResponse([]))

        await expect(fetchSSE('https://example.test', request)).rejects.toMatchObject({ name: 'AbortError' })
        expect(request.fetcher).not.toHaveBeenCalled()
    })

    it('ends a pending read at once and rejects with AbortError when aborted mid-stream', async () => {
        const controller = new AbortController()
        const cancel = vi.fn()
        // The transport never settles the read on its own, like a server that stopped sending.
        const body = new ReadableStream<Uint8Array>({
            start(streamController) {
                streamController.enqueue(encoder.encode('data: first\n\n'))
            },
            cancel,
        })
        const request = options(controller.signal, async () => new Response(body, { headers: SSE_HEADERS }))
        request.onMessage.mockImplementation(async () => {
            setTimeout(() => controller.abort(), 0)
        })

        await expect(fetchSSE('https://example.test', request)).rejects.toMatchObject({ name: 'AbortError' })
        expect(request.onMessage).toHaveBeenCalledTimes(1)
        expect(cancel).toHaveBeenCalled()
        expect(request.onError).not.toHaveBeenCalled()
    })

    it('reports AbortError when the aborted transport errors the stream with another error', async () => {
        const controller = new AbortController()
        let streamController!: ReadableStreamDefaultController<Uint8Array>
        const body = new ReadableStream<Uint8Array>({
            start(value) {
                streamController = value
                value.enqueue(encoder.encode('data: first\n\n'))
            },
        })
        const request = options(controller.signal, async () => new Response(body, { headers: SSE_HEADERS }))
        request.onMessage.mockImplementation(async () => {
            controller.abort()
            streamController.error(new TypeError('connection reset'))
        })

        await expect(fetchSSE('https://example.test', request)).rejects.toMatchObject({ name: 'AbortError' })
        expect(request.onError).not.toHaveBeenCalled()
    })
})
