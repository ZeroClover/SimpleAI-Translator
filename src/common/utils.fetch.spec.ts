import { afterEach, describe, expect, it, vi } from 'vitest'
import { listen } from '@tauri-apps/api/event'
import { commands } from '@/tauri/bindings'
import { fetchSSE } from './utils'

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(), emit: vi.fn(async () => {}) }))
vi.mock('@/tauri/bindings', () => ({ commands: { fetchStream: vi.fn(async () => ({ status: 'ok', data: '' })) } }))

afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
})

describe('desktop stream lifetime', () => {
    const options = (signal?: AbortSignal) => ({ signal, onMessage: vi.fn(async () => {}), onError: vi.fn() })

    it('registers both listeners before fetching and removes them on success', async () => {
        vi.stubGlobal('__TAURI__', {})
        const stops = [vi.fn(), vi.fn()]
        vi.mocked(listen).mockResolvedValueOnce(stops[0]).mockResolvedValueOnce(stops[1])
        vi.mocked(commands.fetchStream).mockImplementationOnce(async () => {
            expect(listen).toHaveBeenCalledTimes(2)
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
})
