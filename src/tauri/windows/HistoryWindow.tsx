import { useCallback } from 'react'
import { Window } from '../components/Window'
import { TranslationHistory } from '../../common/components/TranslationHistory'
import { HistoryItem } from '../../common/internal-services/db'
import { emit } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useMemoWindow } from '../../common/hooks/useMemoWindow'

export function HistoryWindow() {
    useMemoWindow({ size: true, position: true, show: true })

    const appWindow = WebviewWindow.getCurrent()

    const handleClose = useCallback(() => {
        void appWindow.close()
    }, [appWindow])

    const handleRestore = useCallback((item: HistoryItem) => {
        void emit('history:restore', item)
    }, [])

    return (
        <Window>
            <TranslationHistory variant='window' isOpen onClose={handleClose} onRestore={handleRestore} />
        </Window>
    )
}
