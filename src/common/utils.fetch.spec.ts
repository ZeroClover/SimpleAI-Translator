import { afterEach, describe, expect, it, vi } from 'vitest'
import { emit, listen } from '@tauri-apps/api/event'
import { commands } from '@/tauri/bindings'
import { fetchSSE } from './utils'

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(), emit: vi.fn(async () => {}) }))
vi.mock('@/tauri/bindings', () => ({ commands: { fetchStream: vi.fn(async () => ({ status: 'ok', data: '' })) } }))

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

type Listener = (event: { payload: Record<string, unknown> }) => void

// Captures the desktop listeners so a test can play the events the native command emits.
function captureDesktopListeners() {
    const listeners = new Map<string, Listener>()
    const stops = [vi.fn(), vi.fn()]
    let index = 0
    vi.mocked(listen).mockImplementation(async (name, handler) => {
        listeners.set(name, handler as unknown as Listener)
        return stops[index++]
    })
    const emitEvent = (name: string, payload: Record<string, unknown>) => listeners.get(name)?.({ payload })
    return { emitEvent, stops }
}

describe('desktop stream lifetime', () => {
    const options = (signal?: AbortSignal) => ({ signal, onMessage: vi.fn(async () => {}), onError: vi.fn() })

    it('registers both listeners before fetching and removes them on success', async () => {
        vi.stubGlobal('__TAURI__', {})
        const { emitEvent, stops } = captureDesktopListeners()
        vi.mocked(commands.fetchStream).mockImplementationOnce(async (id) => {
            expect(listen).toHaveBeenCalledTimes(2)
            emitEvent('fetch-stream-chunk', { id, data: '', done: true, status: 200 })
            return { status: 'ok' as const, data: '' }
        })
        await fetchSSE('https://example.test', options())
        stops.forEach((stop) => expect(stop).toHaveBeenCalledOnce())
    })

    it('removes registrations that complete after cancellation without starting a request', async () => {
        vi.stubGlobal('__TAURI__', {})
        const controller = new AbortController()
        let complete!: (stop: () => void) => void
        const stop = vi.fn()
        vi.mocked(listen).mockReturnValue(
            new Promise((resolve) => {
                complete = resolve
            })
        )
        const request = fetchSSE('https://example.test', options(controller.signal))
        expect(listen).toHaveBeenCalledTimes(2)
        controller.abort()
        await expect(request).rejects.toMatchObject({ name: 'AbortError' })
        complete(stop)
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(stop).toHaveBeenCalledTimes(2)
        expect(commands.fetchStream).not.toHaveBeenCalled()
    })

    it('cleans listeners after a native request failure', async () => {
        vi.stubGlobal('__TAURI__', {})
        const stop = vi.fn()
        vi.mocked(listen).mockResolvedValue(stop)
        vi.mocked(commands.fetchStream).mockRejectedValueOnce(new Error('offline'))
        await expect(fetchSSE('https://example.test', options())).rejects.toThrow('offline')
        expect(stop).toHaveBeenCalledTimes(2)
    })

    it('does not register or fetch when already aborted', async () => {
        vi.stubGlobal('__TAURI__', {})
        const controller = new AbortController()
        controller.abort()
        await expect(fetchSSE('https://example.test', options(controller.signal))).rejects.toMatchObject({
            name: 'AbortError',
        })
        expect(listen).not.toHaveBeenCalled()
        expect(commands.fetchStream).not.toHaveBeenCalled()
    })

    it('surfaces native Result errors and still removes listeners', async () => {
        vi.stubGlobal('__TAURI__', {})
        const stop = vi.fn()
        vi.mocked(listen).mockResolvedValue(stop)
        vi.mocked(commands.fetchStream).mockResolvedValueOnce({ status: 'error', error: 'connection refused' })
        await expect(fetchSSE('https://example.test', options())).rejects.toThrow('connection refused')
        expect(stop).toHaveBeenCalledTimes(2)
    })

    it('consumes queued events in order before resolving, even when the command returns first', async () => {
        vi.stubGlobal('__TAURI__', {})
        const { emitEvent } = captureDesktopListeners()
        const order: string[] = []
        let finishEvents!: () => void
        vi.mocked(commands.fetchStream).mockImplementationOnce(async (id) => {
            emitEvent('fetch-stream-status-code', { id, status: 200, contentType: 'text/event-stream' })
            emitEvent('fetch-stream-chunk', { id, data: 'data: a\n\ndata: b\n', done: false, status: 200 })
            // The final chunk and EOF arrive after the command has already resolved.
            finishEvents = () => {
                emitEvent('fetch-stream-chunk', { id, data: '\ndata: [DONE]\n\n', done: false, status: 200 })
                emitEvent('fetch-stream-chunk', { id, data: '', done: true, status: 200 })
            }
            return { status: 'ok' as const, data: '' }
        })
        const request = fetchSSE('https://example.test', {
            onMessage: vi.fn(async (data: string) => {
                await new Promise((resolve) => setTimeout(resolve, 2))
                order.push(data)
            }),
            onError: vi.fn(),
        }).then(() => order.push('resolved'))
        await new Promise((resolve) => setTimeout(resolve, 0))
        finishEvents()
        await request
        expect(order).toEqual(['a', 'b', '[DONE]', 'resolved'])
    })

    it('passes the native content type and consumes a JSON response once', async () => {
        vi.stubGlobal('__TAURI__', {})
        const { emitEvent } = captureDesktopListeners()
        const onJSONResponse = vi.fn(async () => {})
        vi.mocked(commands.fetchStream).mockImplementationOnce(async (id) => {
            emitEvent('fetch-stream-status-code', { id, status: 200, contentType: 'application/json; charset=utf-8' })
            emitEvent('fetch-stream-chunk', { id, data: '{"content":[{"type":"te', done: false, status: 200 })
            emitEvent('fetch-stream-chunk', { id, data: 'xt","text":"好"}]}', done: false, status: 200 })
            emitEvent('fetch-stream-chunk', { id, data: '', done: true, status: 200 })
            return { status: 'ok' as const, data: '' }
        })
        const onMessage = vi.fn(async () => {})
        await fetchSSE('https://example.test', { onMessage, onError: vi.fn(), onJSONResponse })
        expect(commands.fetchStream).toHaveBeenCalledOnce()
        expect(onJSONResponse).toHaveBeenCalledWith({ content: [{ type: 'text', text: '好' }] })
        expect(onMessage).not.toHaveBeenCalled()
    })

    it('reports an error body split across native chunks once', async () => {
        vi.stubGlobal('__TAURI__', {})
        const { emitEvent } = captureDesktopListeners()
        const onError = vi.fn()
        const onStatusCode = vi.fn()
        vi.mocked(commands.fetchStream).mockImplementationOnce(async (id) => {
            emitEvent('fetch-stream-status-code', { id, status: 400, contentType: 'application/json' })
            emitEvent('fetch-stream-chunk', { id, data: '{"error":{"message":"Stre', done: false, status: 400 })
            emitEvent('fetch-stream-chunk', { id, data: 'aming is not supported"}}', done: false, status: 400 })
            emitEvent('fetch-stream-chunk', { id, data: '', done: true, status: 400 })
            return { status: 'ok' as const, data: '' }
        })
        await fetchSSE('https://example.test', { onMessage: vi.fn(async () => {}), onError, onStatusCode })
        expect(onStatusCode).toHaveBeenCalledWith(400)
        expect(onError).toHaveBeenCalledOnce()
        expect(onError).toHaveBeenCalledWith({ error: { message: 'Streaming is not supported' } })
    })

    it('stops the native request when a consumer fails and ignores later events', async () => {
        vi.stubGlobal('__TAURI__', {})
        const { emitEvent, stops } = captureDesktopListeners()
        const onMessage = vi.fn(async () => {
            throw new Error('consumer failed')
        })
        let sendLate!: () => void
        vi.mocked(commands.fetchStream).mockImplementationOnce(async (id) => {
            emitEvent('fetch-stream-status-code', { id, status: 200, contentType: 'text/event-stream' })
            emitEvent('fetch-stream-chunk', { id, data: 'data: a\n\n', done: false, status: 200 })
            sendLate = () => {
                emitEvent('fetch-stream-chunk', { id, data: 'data: late\n\n', done: false, status: 200 })
                emitEvent('fetch-stream-chunk', { id, data: '', done: true, status: 200 })
            }
            return new Promise(() => {})
        })
        await expect(fetchSSE('https://example.test', { onMessage, onError: vi.fn() })).rejects.toThrow(
            'consumer failed'
        )
        expect(emit).toHaveBeenCalledWith('abort-fetch-stream', expect.objectContaining({ id: expect.any(String) }))
        stops.forEach((stop) => expect(stop).toHaveBeenCalledOnce())
        sendLate()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(onMessage).toHaveBeenCalledOnce()
    })

    it('cancels while a consumer is running without reporting later events', async () => {
        vi.stubGlobal('__TAURI__', {})
        const { emitEvent } = captureDesktopListeners()
        const controller = new AbortController()
        const onMessage = vi.fn(async () => {
            controller.abort()
        })
        vi.mocked(commands.fetchStream).mockImplementationOnce(async (id) => {
            emitEvent('fetch-stream-status-code', { id, status: 200, contentType: 'text/event-stream' })
            emitEvent('fetch-stream-chunk', { id, data: 'data: a\n\n', done: false, status: 200 })
            emitEvent('fetch-stream-chunk', { id, data: 'data: b\n\n', done: false, status: 200 })
            return new Promise(() => {})
        })
        await expect(
            fetchSSE('https://example.test', { signal: controller.signal, onMessage, onError: vi.fn() })
        ).rejects.toMatchObject({ name: 'AbortError' })
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(onMessage).toHaveBeenCalledOnce()
    })
})
