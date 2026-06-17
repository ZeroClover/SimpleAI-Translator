import { create } from 'zustand'

interface ISettingsVisibilityState {
    showSettings: boolean
    toggleSettingsVisibility: () => void
    setShowSettings: (showSettings: boolean) => void
}

export const useSettingsVisibility = create<ISettingsVisibilityState>()((set) => ({
    showSettings: false,
    toggleSettingsVisibility: () => set((state) => ({ showSettings: !state.showSettings })),
    setShowSettings: (showSettings) => set({ showSettings }),
}))
