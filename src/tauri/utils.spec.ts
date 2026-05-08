import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getSettings } from '@/common/utils'
import { isRegistered, register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { sendNotification } from '@tauri-apps/plugin-notification'
import { bindDisplayWindowHotkey, bindHotkey, isMissingNormalKey } from './utils'
import { commands } from './bindings'

vi.mock('@/common/utils', () => ({ getSettings: vi.fn() }))
vi.mock('@tauri-apps/plugin-global-shortcut', () => ({
    isRegistered: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
}))
vi.mock('@tauri-apps/plugin-notification', () => ({ sendNotification: vi.fn() }))
vi.mock('./bindings', () => ({
    commands: {
        showTranslatorWindowCommand: vi.fn(),
        showTranslatorWindowWithSelectedTextCommand: vi.fn(),
    },
    events: {
        configUpdatedEvent: {
            emit: vi.fn(),
        },
    },
}))

describe('tauri hotkey binding', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(isRegistered).mockResolvedValue(false)
        vi.mocked(register).mockResolvedValue(undefined)
        vi.mocked(unregister).mockResolvedValue(undefined)
    })

    it('detects hotkeys without a normal key', () => {
        expect(isMissingNormalKey('CommandOrControl+Shift')).toBe(true)
        expect(isMissingNormalKey('CommandOrControl+Shift+Y')).toBe(false)
    })

    it('registers the main hotkey to show the translator with selected text', async () => {
        vi.mocked(getSettings).mockResolvedValue({
            hotkey: 'CommandOrControl+Shift+Y',
        } as Awaited<ReturnType<typeof getSettings>>)

        await bindHotkey()

        expect(register).toHaveBeenCalledWith('CommandOrControl+Shift+Y', expect.any(Function))
        const callback = vi.mocked(register).mock.calls[0][1]
        await callback('CommandOrControl+Shift+Y')
        expect(commands.showTranslatorWindowWithSelectedTextCommand).toHaveBeenCalledTimes(1)
    })

    it('registers the display window hotkey to show the translator window', async () => {
        vi.mocked(getSettings).mockResolvedValue({
            displayWindowHotkey: 'CommandOrControl+Shift+O',
        } as Awaited<ReturnType<typeof getSettings>>)

        await bindDisplayWindowHotkey()

        expect(register).toHaveBeenCalledWith('CommandOrControl+Shift+O', expect.any(Function))
        const callback = vi.mocked(register).mock.calls[0][1]
        await callback('CommandOrControl+Shift+O')
        expect(commands.showTranslatorWindowCommand).toHaveBeenCalledTimes(1)
    })

    it('does not register modifier-only hotkeys', async () => {
        vi.mocked(getSettings).mockResolvedValue({
            hotkey: 'CommandOrControl+Shift',
        } as Awaited<ReturnType<typeof getSettings>>)

        await bindHotkey()

        expect(register).not.toHaveBeenCalled()
        expect(sendNotification).toHaveBeenCalledWith({
            title: 'Cannot bind hotkey',
            body: 'Hotkey must contain at least one normal key: CommandOrControl+Shift',
        })
    })

    it('unregisters an existing old hotkey before rebinding', async () => {
        vi.mocked(isRegistered).mockResolvedValueOnce(true).mockResolvedValueOnce(false)
        vi.mocked(getSettings).mockResolvedValue({
            hotkey: 'CommandOrControl+Shift+Y',
        } as Awaited<ReturnType<typeof getSettings>>)

        await bindHotkey('CommandOrControl+Shift+X')

        expect(unregister).toHaveBeenCalledWith('CommandOrControl+Shift+X')
        expect(register).toHaveBeenCalledWith('CommandOrControl+Shift+Y', expect.any(Function))
    })
})
