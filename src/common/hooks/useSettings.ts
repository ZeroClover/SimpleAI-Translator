import useSWR from 'swr'

import { ISettings } from '../types'
import { getSettings, normalizeSettings, setSettings } from '../utils'
import { useCallback } from 'react'

export function useSettings(): {
    settings: ISettings
    // Persists `changes` and then updates the cached settings with the fields as written.
    updateSettings: (changes: Partial<ISettings>) => Promise<Partial<ISettings>>
} {
    const { data: settings, mutate } = useSWR<ISettings>('settings', getSettings, { suspense: true })

    const updateSettings = useCallback(
        async (changes: Partial<ISettings>) => {
            const written = await setSettings(changes)
            await mutate((prev) => normalizeSettings({ ...prev, ...written }), { revalidate: false })
            return written
        },
        [mutate]
    )

    return {
        settings: settings!,
        updateSettings,
    }
}
