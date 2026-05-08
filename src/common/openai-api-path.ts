export const OPENAI_CHAT_COMPLETIONS_API_PATH = '/v1/chat/completions'
export const OPENAI_RESPONSES_API_PATH = '/v1/responses'
export const OPENAI_AUDIO_SPEECH_API_PATH = '/v1/audio/speech'
export const ANTHROPIC_MESSAGES_API_PATH = '/v1/messages'
export const OPENAI_PREFERRED_DEFAULT_MODEL = 'gpt-5-nano'

const KNOWN_ENDPOINT_SUFFIXES = ['/chat/completions', '/responses', '/messages', '/audio/speech']

const RESPONSES_CAPABLE_MODEL_PATTERNS = [
    /^gpt-5(?:$|[.-])/,
    /^o\d+(?:$|[.-])/,
    /^gpt-4o(?:$|[.-])/,
    /^gpt-4\.1(?:$|[.-])/,
    /^gpt-4\.5(?:$|[.-])/,
]

export function isResponsesCapableOpenAIModel(model: string | undefined | null): boolean {
    if (!model) {
        return false
    }
    const modelLower = model.trim().toLowerCase()
    if (!modelLower) {
        return false
    }
    return RESPONSES_CAPABLE_MODEL_PATTERNS.some((pattern) => pattern.test(modelLower))
}

export function getRecommendedOpenAIAPIPath(model: string | undefined | null): string {
    return isResponsesCapableOpenAIModel(model) ? OPENAI_RESPONSES_API_PATH : OPENAI_CHAT_COMPLETIONS_API_PATH
}

export function normalizeAPIEndpoint(
    endpoint: string | undefined | null,
    targetPath: string,
    defaultEndpoint = 'https://api.openai.com/v1'
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
        baseParts[baseParts.length - 1]?.toLowerCase() === 'v1' && targetParts[0]?.toLowerCase() === 'v1'
            ? targetParts.slice(1)
            : targetParts

    url.pathname = [...baseParts, ...pathParts].join('/')
    return url.toString()
}
