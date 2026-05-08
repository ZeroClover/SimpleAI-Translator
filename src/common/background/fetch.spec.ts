import { beforeEach, describe, expect, it, vi } from 'vitest'

import { backgroundFetch, getHostPermissionOrigin } from './fetch'

const browserMock = vi.hoisted(() => ({
    permissions: {
        contains: vi.fn(),
        request: vi.fn(),
    },
    runtime: {
        connect: vi.fn(),
    },
}))

vi.mock('webextension-polyfill', () => ({ default: browserMock }))

function createFetchPort(body: string) {
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
