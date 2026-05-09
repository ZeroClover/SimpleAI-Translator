/* eslint-disable camelcase */
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { TranslatorWindow } from './windows/TranslatorWindow'
import { SettingsWindow } from './windows/SettingsWindow'
import { UpdaterWindow } from './windows/UpdaterWindow'
import { HistoryWindow } from './windows/HistoryWindow'

const windowsMap: Record<string, typeof TranslatorWindow> = {
    translator: TranslatorWindow,
    settings: SettingsWindow,
    updater: UpdaterWindow,
    history: HistoryWindow,
}

export function App() {
    const appWindow = WebviewWindow.getCurrent()
    return <>{windowsMap[appWindow.label]()}</>
}
