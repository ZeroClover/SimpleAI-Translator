import { beforeEach, describe, expect, it, vi } from 'vitest'
import { commands, type FetchResponse } from '@/tauri/bindings'
import { tauriBrowser, tauriFetch } from './tauri'

vi.mock('@/tauri/bindings', () => ({
    commands: {
        getConfigContent: vi.fn(async () => '{"fontSize":15,"themeType":"dark"}'),
        updateConfig: vi.fn(async () => ({ status: 'ok', data: null })),
        fetch: vi.fn(),
        fetchCancel: vi.fn(async () => {}),
    },
}))

vi.mock('@tauri-apps/api/core', () => ({
    Channel: class {
        constructor(public onmessage: (message: unknown) => void) {}
    },
}))

beforeEach(() => {
    vi.clearAllMocks()
})

describe('desktop settings writes', () => {
    it('sends only the changed keys to the native merge', async () => {
        await tauriBrowser.storage.sync.set({ fontSize: 20, skipped: undefined })
        expect(commands.updateConfig).toHaveBeenCalledWith('{"fontSize":20}')
    })

    it('passes native write failures to the caller', async () => {
        vi.mocked(commands.updateConfig).mockResolvedValueOnce({ status: 'error', error: 'disk full' })
        await expect(tauriBrowser.storage.sync.set({ fontSize: 20 })).rejects.toThrow('disk full')
    })
})

type BodyChannel = { onmessage: (message: unknown) => void }

// Resolves the native command with `head` and returns the body channel it received.
function nativeResponse(head: FetchResponse = { status: 200, statusText: 'OK', headers: [] }) {
    let channel!: BodyChannel
    vi.mocked(commands.fetch).mockImplementationOnce(async (_request, onBody) => {
        channel = onBody as unknown as BodyChannel
        return { status: 'ok', data: head }
    })
    return () => channel
}

const encode = (text: string) => new TextEncoder().encode(text).buffer

describe('desktop fetch', () => {
    it('sends the request and exposes the response head and streamed body', async () => {
        const channel = nativeResponse({
            status: 201,
            statusText: 'Created',
            headers: [['content-type', 'text/event-stream']],
        })

        const response = await tauriFetch('https://api.example.test/v1', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Referer': 'https://example.test/' },
            body: '{"stream":true}',
        })
        channel().onmessage(encode('data: 中'))
        channel().onmessage(encode('文'))
        channel().onmessage({ done: true })

        expect(commands.fetch).toHaveBeenCalledWith(
            {
                id: expect.any(String),
                method: 'POST',
                url: 'https://api.example.test/v1',
                headers: [
                    ['content-type', 'application/json'],
                    ['referer', 'https://example.test/'],
                ],
                body: '{"stream":true}',
                proxy: null,
            },
            channel()
        )
        expect(response.status).toBe(201)
        expect(response.statusText).toBe('Created')
        expect(response.headers.get('content-type')).toBe('text/event-stream')
        await expect(response.text()).resolves.toBe('data: 中文')
        expect(commands.fetchCancel).not.toHaveBeenCalled()
    })

    it('keeps a binary body intact', async () => {
        const channel = nativeResponse()
        const response = await tauriFetch('https://api.example.test/audio')
        channel().onmessage(new Uint8Array([0, 255, 128]).buffer)
        channel().onmessage(new Uint8Array([7]).buffer)
        channel().onmessage({ done: true })

        expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([0, 255, 128, 7])
    })

    it('passes a proxy override to the native request', async () => {
        nativeResponse()
        await tauriFetch('https://api.ip.sb/geoip', {
            proxy: { enabled: true, protocol: 'HTTP', server: '127.0.0.1', port: '1080' },
        })

        expect(vi.mocked(commands.fetch).mock.calls[0][0].proxy).toEqual({
            enabled: true,
            protocol: 'HTTP',
            server: '127.0.0.1',
            port: '1080',
            basicAuth: null,
            noProxy: null,
        })
    })

    it('does not start a request when the signal is already aborted', async () => {
        const controller = new AbortController()
        controller.abort()

        await expect(tauriFetch('https://api.example.test', { signal: controller.signal })).rejects.toMatchObject({
            name: 'AbortError',
        })
        expect(commands.fetch).not.toHaveBeenCalled()
    })

    it('cancels the native request when aborted before the response arrives', async () => {
        vi.mocked(commands.fetch).mockImplementationOnce(() => new Promise<never>(() => {}))
        const controller = new AbortController()
        const response = tauriFetch('https://api.example.test', { signal: controller.signal })
        controller.abort()

        await expect(response).rejects.toMatchObject({ name: 'AbortError' })
        expect(commands.fetchCancel).toHaveBeenCalledWith(vi.mocked(commands.fetch).mock.calls[0][0].id)
    })

    it('cancels the native request and fails the body when aborted while streaming', async () => {
        const channel = nativeResponse()
        const controller = new AbortController()
        const response = await tauriFetch('https://api.example.test', { signal: controller.signal })
        channel().onmessage(encode('data: partial'))
        const reader = response.body!.getReader()
        await reader.read()
        const pending = reader.read()
        controller.abort()

        await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
        expect(commands.fetchCancel).toHaveBeenCalledOnce()
        channel().onmessage(encode('data: late'))
    })

    it('cancels the native request when the body is cancelled', async () => {
        nativeResponse()
        const response = await tauriFetch('https://api.example.test')
        await response.body!.cancel()

        expect(commands.fetchCancel).toHaveBeenCalledWith(vi.mocked(commands.fetch).mock.calls[0][0].id)
    })

    it('reports network failures as TypeError', async () => {
        vi.mocked(commands.fetch).mockResolvedValueOnce({ status: 'error', error: 'connection refused' })

        await expect(tauriFetch('https://api.example.test')).rejects.toEqual(new TypeError('connection refused'))
    })

    it('fails the body with TypeError when the native body read fails', async () => {
        const channel = nativeResponse()
        const response = await tauriFetch('https://api.example.test')
        channel().onmessage({ error: 'connection reset' })

        await expect(response.text()).rejects.toEqual(new TypeError('connection reset'))
        expect(commands.fetchCancel).not.toHaveBeenCalled()
    })
})
