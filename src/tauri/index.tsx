import './legacy-tauri-ipc'
import { createRoot } from 'react-dom/client'
import { App } from './App'

import '../common/i18n'

const root = createRoot(document.getElementById('root')!)

root.render(<App />)
