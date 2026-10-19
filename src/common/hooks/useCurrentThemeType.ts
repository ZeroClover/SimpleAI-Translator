import { useMemo } from 'react'
import { BaseThemeType } from '../types'
import { useThemeDetector } from './useThemeDetector'
import { useSettings } from './useSettings'

export const useCurrentThemeType = (): BaseThemeType => {
    const { settings } = useSettings()
    const themeTypeSetting = settings.themeType ?? 'light'

    const systemIsDark = useThemeDetector()

    const themeType = useMemo(() => {
        if (themeTypeSetting === 'followTheSystem') {
            return systemIsDark ? 'dark' : 'light'
        }
        return themeTypeSetting
    }, [themeTypeSetting, systemIsDark])
    return themeType
}
