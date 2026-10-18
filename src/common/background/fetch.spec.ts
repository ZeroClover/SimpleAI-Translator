import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchSSE } from '../utils'
import { backgroundFetch, getHostPermissionOrigin, requestHostPermission } from './fetch'

const browserMock = vi.hoisted(() => ({
    permissions: {
        contains: vi.fn(),
        request: vi.fn(),
    },
    runtime: {
        connect: vi.fn(),
        onConnect: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
    },
}))

vi.mock('webextension-polyfill', () => ({ default: browserMock }))

function createFetchPort(body: string | undefined, beforeDisconnect?: () => void) {
    let messageListener: ((message: unknown) => void) | undefined
    let disconnectListener: (() => void) | undefined

    const port = {
        onMessage: {
            addListener: vi.fn((listener: (message: unknown) => void) => {
                messageListener = listener
            }),
        },
        onDisconnect: {
            addListener: vi.fn((listener: () => void) => {
                disconnectListener = listener
            }),
        },
        postMessage: vi.fn((message: unknown) => {
            queueMicrotask(() => {
                if (body === undefined) {
                    beforeDisconnect?.()
                    disconnectListener?.()
                    return
                }
                messageListener?.({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    redirected: false,
                    type: 'basic',
                    url: (message as { details: { url: string } }).details.url,
                    data: Array.from(new TextEncoder().encode(body)),
                })
                disconnectListener?.()
            })
        }),
    }

    return port
}

describe('backgroundFetch host permissions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it.each([false, true])('rejects a disconnect before response (aborted: %s)', async (aborted) => {
        const controller = new AbortController()
        const port = createFetchPort(undefined, () => {
            if (aborted) controller.abort()
        })
        browserMock.permissions.contains.mockResolvedValueOnce(true)
        browserMock.runtime.connect.mockReturnValueOnce(port)

        await expect(backgroundFetch('https://example.test', { signal: controller.signal })).rejects.toMatchObject(
            aborted
                ? { name: 'AbortError' }
                : { message: 'The connection to the background was closed before any response' }
        )
    })

    it('rejects a failure opening the background connection', async () => {
        browserMock.permissions.contains.mockResolvedValueOnce(true)
        browserMock.runtime.connect.mockImplementationOnce(() => {
            throw new Error('extension disconnected')
        })
        await expect(backgroundFetch('https://example.test', {})).rejects.toThrow('extension disconnected')
    })

    it('derives optional host permission origins from HTTP endpoints', () => {
        expect(getHostPermissionOrigin('http://127.0.0.1:43123/v1/models')).toBe('http://127.0.0.1:43123/*')
        expect(getHostPermissionOrigin('https://api.example.com/v1/models')).toBe('https://api.example.com/*')
        expect(getHostPermissionOrigin('chrome-extension://id/page.html')).toBeUndefined()
        expect(getHostPermissionOrigin('not a url')).toBeUndefined()
    })

    it('connects to the background fetch port after optional host permission is granted', async () => {
        const port = createFetchPort(JSON.stringify({ data: [{ id: 'gpt-4o' }] }))
        browserMock.permissions.contains.mockResolvedValueOnce(false)
        browserMock.permissions.request.mockResolvedValueOnce(true)
        browserMock.runtime.connect.mockReturnValueOnce(port)

        const response = await backgroundFetch('http://127.0.0.1:43123/v1/models', {
            method: 'GET',
        })

        await expect(response.json()).resolves.toEqual({ data: [{ id: 'gpt-4o' }] })
        expect(browserMock.permissions.request).toHaveBeenCalledWith({
            origins: ['http://127.0.0.1:43123/*'],
        })
        expect(browserMock.runtime.connect).toHaveBeenCalledTimes(1)
        expect(port.postMessage).toHaveBeenCalledWith({
            type: 'open',
            details: {
                url: 'http://127.0.0.1:43123/v1/models',
                options: { method: 'GET' },
            },
        })
    })

    it('requests host permission synchronously from a user action', async () => {
        const request = vi.fn().mockResolvedValue(true)
        vi.stubGlobal('browser', { permissions: { request } })
        try {
            const result = requestHostPermission('https://api.example.com/v1')
            // The prompt must be requested before the caller's first await (Firefox user gesture).
            expect(request).toHaveBeenCalledWith({ origins: ['https://api.example.com/*'] })
            await expect(result).resolves.toBe(true)
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('treats a rejected or denied host permission request as not granted', async () => {
        const request = vi.fn().mockRejectedValueOnce(new Error('not a user gesture')).mockResolvedValueOnce(false)
        vi.stubGlobal('browser', { permissions: { request } })
        try {
            await expect(requestHostPermission('https://api.example.com/v1')).resolves.toBe(false)
            await expect(requestHostPermission('https://api.example.com/v1')).resolves.toBe(false)
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('skips the host permission request outside extension pages or for empty endpoints', async () => {
        const request = vi.fn()
        vi.stubGlobal('browser', { permissions: { request } })
        try {
            await expect(requestHostPermission('')).resolves.toBe(true)
        } finally {
            vi.unstubAllGlobals()
        }
        await expect(requestHostPermission('https://api.example.com/v1')).resolves.toBe(true)
        expect(request).not.toHaveBeenCalled()
    })

    it('rejects before opening the background fetch port when optional host permission is denied', async () => {
        browserMock.permissions.contains.mockResolvedValueOnce(false)
        browserMock.permissions.request.mockResolvedValueOnce(false)

        await expect(
            backgroundFetch('http://127.0.0.1:43124/v1/models', {
                method: 'GET',
            })
        ).rejects.toMatchObject({
            name: 'NotAllowedError',
            message: 'Host permission denied for http://127.0.0.1:43124/*',
        })

        expect(browserMock.permissions.request).toHaveBeenCalledWith({
            origins: ['http://127.0.0.1:43124/*'],
        })
        expect(browserMock.runtime.connect).not.toHaveBeenCalled()
    })
})

type PortListener = (message: unknown) => void

// A connected pair of runtime ports, like the one the extension runtime creates.
function createPortPair(name: string) {
    const create = () => {
        const messageListeners: PortListener[] = []
        const disconnectListeners: Array<() => void> = []
        const port = {
            name,
            messageListeners,
            disconnectListeners,
            onMessage: { addListener: (listener: PortListener) => messageListeners.push(listener) },
            onDisconnect: { addListener: (listener: () => void) => disconnectListeners.push(listener) },
            // Replaced by link() once both ends exist.
            postMessage: (() => undefined) as (message: unknown) => void,
            disconnect: () => undefined as void,
        }
        return port
    }
    const front = create()
    const back = create()
    const link = (from: typeof front, to: typeof front) => {
        from.postMessage = (message) =>
            queueMicrotask(() => to.messageListeners.forEach((listener) => listener(message)))
        from.disconnect = () => queueMicrotask(() => to.disconnectListeners.forEach((listener) => listener()))
    }
    link(front, back)
    link(back, front)
    return { front, back }
}

function chunkedResponse(chunks: string[], init: ResponseInit): Response {
    const encoder = new TextEncoder()
    return new Response(
        new ReadableStream({
            start(controller) {
                chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
                controller.close()
            },
        }),
        init
    )
}

describe('background fetch bridge', () => {
    let fetchMock: ReturnType<typeof vi.fn>
    let onConnect: (port: unknown) => void

    beforeAll(async () => {
        // Route the content side through the real background listener.
        const { startBackground } = await import('../../browser-extension/background')
        startBackground()
        ;[onConnect] = browserMock.runtime.onConnect.addListener.mock.calls[0] as [(port: unknown) => void]
    })

    beforeEach(() => {
        vi.clearAllMocks()
        fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        browserMock.runtime.connect.mockImplementation(({ name }: { name: string }) => {
            const { front, back } = createPortPair(name)
            onConnect(back)
            return front
        })
        browserMock.permissions.contains.mockResolvedValue(true)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('restores the JSON media type so a direct JSON response is consumed once', async () => {
        fetchMock.mockResolvedValueOnce(
            chunkedResponse(['{"choices":[{"message":', '{"content":"好"}}]}'], {
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
            })
        )
        const onJSONResponse = vi.fn(async () => {})
        const onMessage = vi.fn(async () => {})
        await fetchSSE('https://api.example.test/v1/chat/completions', {
            method: 'POST',
            fetcher: backgroundFetch,
            onMessage,
            onError: vi.fn(),
            onJSONResponse,
        })
        expect(fetchMock).toHaveBeenCalledOnce()
        expect(onJSONResponse).toHaveBeenCalledWith({ choices: [{ message: { content: '好' } }] })
        expect(onMessage).not.toHaveBeenCalled()
    })

    it('streams SSE through the bridge', async () => {
        fetchMock.mockResolvedValueOnce(
            chunkedResponse(['data: a\n', '\ndata: [DONE]\n\n'], {
                headers: { 'Content-Type': 'text/event-stream' },
            })
        )
        const events: string[] = []
        await fetchSSE('https://api.example.test/v1/chat/completions', {
            fetcher: backgroundFetch,
            onMessage: async (data) => {
                events.push(data)
            },
            onError: vi.fn(),
            onJSONResponse: vi.fn(async () => {}),
        })
        expect(events).toEqual(['a', '[DONE]'])
    })

    it('reports a chunked error body once with its status', async () => {
        fetchMock.mockResolvedValueOnce(
            chunkedResponse(['{"error":{"message":"bad', ' key"}}'], {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            })
        )
        const onError = vi.fn()
        const onStatusCode = vi.fn()
        await fetchSSE('https://api.example.test/v1/chat/completions', {
            fetcher: backgroundFetch,
            onMessage: vi.fn(async () => {}),
            onError,
            onStatusCode,
        })
        expect(onStatusCode).toHaveBeenCalledWith(401)
        expect(onError).toHaveBeenCalledOnce()
        expect(onError).toHaveBeenCalledWith({ error: { message: 'bad key' } })
    })

    it('resolves a response with an empty body', async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
        const response = await backgroundFetch('https://api.example.test/v1/models', {})
        expect(response.status).toBe(200)
        await expect(response.text()).resolves.toBe('')
    })
})
