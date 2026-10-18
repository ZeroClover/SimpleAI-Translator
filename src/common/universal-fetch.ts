import { backgroundFetch } from './background/fetch'
import { tauriFetch } from './polyfills/tauri'
import { isTauri } from './utils'

export function getUniversalFetch() {
    return isTauri() ? tauriFetch : backgroundFetch
}
