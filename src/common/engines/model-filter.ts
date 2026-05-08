const CHAT_MODEL_BLOCKLIST = [
    /(^|[-/])(text-)?embedding($|[-/])/i,
    /(^|[-/])realtime($|-)/i,
    /(^|[-/])audio($|-)/i,
    /^whisper(-|$)/i,
    /(^|[-/])transcribe($|-)/i,
    /(^|[-/])moderation($|-)/i,
    /^tts(-|$)/i,
    /-tts($|-)/i,
    /^dall-e/i,
    /^gpt-image/i,
    /(^|[-/])sora($|-)/i,
    /-search-(preview|api)/i,
    /(^|[-/])image($|-)/i,
]

const TTS_MODEL_ALLOWLIST = [/^tts-1(-hd)?$/i, /^gpt-4o-mini-tts(?:-[0-9]{4}-[0-9]{2}-[0-9]{2})?$/i]

export function filterChatModels(ids: string[]): string[] {
    return ids.filter((id) => !CHAT_MODEL_BLOCKLIST.some((pattern) => pattern.test(id)))
}

export function filterTTSModels(ids: string[]): string[] {
    return ids.filter((id) => TTS_MODEL_ALLOWLIST.some((pattern) => pattern.test(id)))
}
