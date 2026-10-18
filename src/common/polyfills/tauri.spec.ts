import { beforeEach, describe, expect, it, vi } from 'vitest'
import { commands } from '@/tauri/bindings'
import { tauriBrowser } from './tauri'

vi.mock('@/tauri/bindings', () => ({
    commands: {
        getConfigContent: vi.fn(async () => '{"fontSize":15,"themeType":"dark"}'),
        updateConfig: vi.fn(async () => ({ status: 'ok', data: null })),
    },
}))

beforeEach(() => {
    vi.clearAllMocks()
})

describe('desktop settings writes', () => {
    it('sends only the changed keys to the native merge', async () => {
        await tauriBrowser.storage.sync.set({ fontSize: 20, skipped: undefined })
        expect(commands.updateConfig).toHaveBeenCalledWith('{"fontSize":20}', [])
    })

    it('deletes keys through the same native update', async () => {
        await tauriBrowser.storage.sync.remove?.(['themeType'])
        expect(commands.updateConfig).toHaveBeenCalledWith('{}', ['themeType'])
    })

    it('passes native write failures to the caller', async () => {
        vi.mocked(commands.updateConfig).mockResolvedValueOnce({ status: 'error', error: 'disk full' })
        await expect(tauriBrowser.storage.sync.set({ fontSize: 20 })).rejects.toThrow('disk full')
    })
})
