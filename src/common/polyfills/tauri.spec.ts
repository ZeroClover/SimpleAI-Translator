import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeTextFile, rename, remove } from '@tauri-apps/plugin-fs'
import { tauriBrowser } from './tauri'

vi.mock('@tauri-apps/plugin-fs', () => ({
    BaseDirectory: { AppConfig: 1 },
    writeTextFile: vi.fn(async () => {}),
    rename: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
}))
vi.mock('@/tauri/bindings', () => ({
    commands: { getConfigContent: vi.fn(async () => '{"fontSize":15,"themeType":"dark"}') },
}))

beforeEach(() => {
    vi.clearAllMocks()
})

describe('atomic desktop settings writes', () => {
    it('writes a complete temporary file before replacing the config', async () => {
        await tauriBrowser.storage.sync.set({ fontSize: 20 })
        const [temporaryPath, content] = vi.mocked(writeTextFile).mock.calls[0]
        expect(temporaryPath).toMatch(/^config\..+\.tmp$/)
        expect(JSON.parse(content)).toEqual({ fontSize: 20, themeType: 'dark' })
        expect(rename).toHaveBeenCalledWith(temporaryPath, 'config.json', expect.any(Object))
        expect(vi.mocked(writeTextFile).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(rename).mock.invocationCallOrder[0]
        )
    })

    it('also replaces atomically when deleting a setting', async () => {
        await tauriBrowser.storage.sync.remove?.(['themeType'])
        expect(JSON.parse(vi.mocked(writeTextFile).mock.calls[0][1])).toEqual({ fontSize: 15 })
        expect(rename).toHaveBeenCalledOnce()
    })

    it('does not replace the original if writing fails', async () => {
        vi.mocked(writeTextFile).mockRejectedValueOnce(new Error('disk full'))
        await expect(tauriBrowser.storage.sync.set({ fontSize: 20 })).rejects.toThrow('disk full')
        expect(rename).not.toHaveBeenCalled()
        expect(remove).toHaveBeenCalledOnce()
    })

    it('cleans the temporary file if replacing fails', async () => {
        vi.mocked(rename).mockRejectedValueOnce(new Error('access denied'))
        await expect(tauriBrowser.storage.sync.set({ fontSize: 20 })).rejects.toThrow('access denied')
        expect(remove).toHaveBeenCalledWith(vi.mocked(writeTextFile).mock.calls[0][0], expect.any(Object))
    })
})
