import { InnerSettings } from '../../common/components/Settings'
import Toaster from '../../common/components/Toaster'
import { Window } from '../components/Window'
import { onSettingsSave } from '../utils'

export function SettingsWindow() {
    return (
        <Window windowsTitlebarDisableDarkMode>
            <InnerSettings showFooter onSave={onSettingsSave} />
            {/* TTS reports errors through react-hot-toast/headless, which the Settings Toaster does not render. */}
            <Toaster />
        </Window>
    )
}
