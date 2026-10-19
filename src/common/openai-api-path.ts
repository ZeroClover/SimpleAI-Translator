import { ProviderProtocol } from './types'

export const OPENAI_CHAT_COMPLETIONS_API_PATH = '/v1/chat/completions'
export const OPENAI_RESPONSES_API_PATH = '/v1/responses'
export const OPENAI_AUDIO_SPEECH_API_PATH = '/v1/audio/speech'
export const ANTHROPIC_MESSAGES_API_PATH = '/v1/messages'

export const DEFAULT_ENDPOINT_BY_PROTOCOL: Record<ProviderProtocol, string> = {
    'openai-chat': 'https://api.openai.com/v1',
    'openai-responses': 'https://api.openai.com/v1',
    'anthropic': 'https://api.anthropic.com',
}

const KNOWN_ENDPOINT_SUFFIXES = ['/chat/completions', '/responses', '/messages', '/audio/speech']

// A base path that already names an API version (`/v1`, `/v1beta/openai`, `/api/v3`)
// replaces the target path's own `/v1` prefix.
const API_VERSION_SEGMENT = /^v\d+(?:alpha|beta)?\d*$/i

export function normalizeAPIEndpoint(
    endpoint: string | undefined | null,
    targetPath: string,
    defaultEndpoint = DEFAULT_ENDPOINT_BY_PROTOCOL['openai-chat']
): string {
    const url = new URL((endpoint || defaultEndpoint).trim().replace(/\/+$/, ''))
    const targetParts = targetPath.split('/').filter(Boolean)
    let basePath = url.pathname.replace(/\/+$/, '')

    for (const suffix of KNOWN_ENDPOINT_SUFFIXES) {
        if (basePath.toLowerCase().endsWith(suffix.toLowerCase())) {
            basePath = basePath.slice(0, -suffix.length)
            break
        }
    }

    const baseParts = basePath.split('/').filter(Boolean)
    const pathParts =
        baseParts.some((part) => API_VERSION_SEGMENT.test(part)) && targetParts[0]?.toLowerCase() === 'v1'
            ? targetParts.slice(1)
            : targetParts

    url.pathname = [...baseParts, ...pathParts].join('/')
    return url.toString()
}
