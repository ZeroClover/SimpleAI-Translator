import { parse as parsePartialJSON } from 'best-effort-json-parser'
import { getUniversalFetch } from '../universal-fetch'
import { fetchSSE } from '../utils'
import { ThinkingFilter } from './thinking-filter'

export interface IModel {
    id: string
    name: string
    description?: string
}

export type StructuredOutputMode = 'word' | 'short-phrase-to-chinese' | 'sentence'

export interface StructuredOutputRequest {
    mode: StructuredOutputMode
    schemaName: string
    schema: Record<string, unknown>
    strict: boolean
}

export interface IMessageRequest {
    // System-channel instruction: role, task, constraints, anti-injection clauses,
    // and any structured-output schema prompt. Adapters map it to the system message
    // (openai-chat), the top-level `system` parameter (anthropic), or `instructions`
    // (openai-responses). Never carries the source text.
    rolePrompt: string
    // Untrusted user data: the source text wrapped in a per-request random boundary.
    // Adapters map it to the user message / `input`. Never placed in the system channel.
    commandPrompt: string
    structuredOutput?: StructuredOutputRequest
    modelOverride?: string
    onMessage: (message: { content: string; role: string; isFullText?: boolean }) => Promise<void>
    onError: (error: string) => void
    onFinished: (reason: string) => void
    onStatusCode?: (statusCode: number) => void
    signal: AbortSignal
}

export interface IEngine {
    listModels(): Promise<IModel[]>
    sendMessage(req: IMessageRequest): Promise<void>
}

// Previews parse unfinished text on every chunk, so trailing tokens are expected there;
// the strict final parse rejects them, and the parser's console report is only noise.
parsePartialJSON.onExtraToken = () => undefined

type JSONObject = Record<string, unknown>

function isObject(value: unknown): value is JSONObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// A preview can end inside a surrogate pair (`\uD83D` without its low half); hold that
// code unit back until the pair is complete.
const TRAILING_HIGH_SURROGATE = /[\uD800-\uDBFF]$/

type ReadString = (value: unknown) => string | null

function readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readPreviewString(value: unknown): string | null {
    return typeof value === 'string' ? readString(value.replace(TRAILING_HIGH_SURROGATE, '')) : null
}

function readObjects(value: unknown): JSONObject[] {
    return Array.isArray(value) ? value.filter(isObject) : []
}

function numbered(items: string[]): string {
    return items.map((item, index) => `${index + 1}. ${item}`).join('\n')
}

function formatExamples(value: unknown, read: ReadString): string {
    const examples = readObjects(value)
        .map((example) => {
            const sentence = read(example.sentence)
            const translation = read(example.translation)
            return `${sentence ?? ''}${translation ? `(${translation})` : ''}`
        })
        .filter(Boolean)
    return examples.length > 0 ? `例句：\n${numbered(examples)}` : ''
}

function formatShortPhrase(data: JSONObject, read: ReadString): string {
    return readObjects(data.options)
        .map((option) => {
            const phonetics = read(option.phonetics)
            const partOfSpeech = read(option.part_of_speech)
            const context = read(option.context_explanation)
            return [
                [read(option.translation), phonetics && `/${phonetics}/`].filter(Boolean).join(' · '),
                partOfSpeech ? `[${partOfSpeech}]${context ? ` ${context}` : ''}` : context,
                formatExamples(option.examples, read),
            ].filter(Boolean)
        })
        .filter((lines) => lines.length > 0)
        .slice(0, 3)
        .map((lines, index) => `${index + 1}. ${lines.join('\n')}`)
        .join('\n\n')
}

function formatWord(data: JSONObject, read: ReadString): string {
    const language = read(data.language)
    const phonetics = read(data.phonetics)
    const etymology = read(data.etymology)
    const correctionHint = read(data.correction_hint)
    const senses = readObjects(data.senses)
        .map((sense) => {
            const pos = read(sense.pos)
            const meaning = read(sense.meaning)
            return pos ? `[${pos}]${meaning ? ` ${meaning}` : ''}` : meaning
        })
        .filter(Boolean)
    return [
        read(data.original_form),
        [language && `[${language}]`, phonetics && `/${phonetics}/`].filter(Boolean).join(' · '),
        senses.join('\n'),
        formatExamples(data.examples, read),
        etymology && `词源：\n${etymology}`,
        correctionHint && `拼写提示：${correctionHint}`,
    ]
        .filter(Boolean)
        .join('\n')
}

// Projects only usable values; unusable optional fields are skipped rather than rejected.
function formatStructuredData(mode: StructuredOutputMode, data: JSONObject, read: ReadString): string {
    if (mode === 'sentence') {
        return read(data.translatedText) ?? ''
    }
    if (mode === 'short-phrase-to-chinese') {
        return formatShortPhrase(data, read)
    }
    return formatWord(data, read)
}

// Strict check of the complete source: JSON integrity, an object root, and the content the
// display needs. It runs even when the server enforced the schema.
export function formatStructuredOutput(mode: StructuredOutputMode, rawContent: string): string {
    const data: unknown = JSON.parse(rawContent)
    if (!isObject(data)) {
        throw new Error('Structured output is not a JSON object.')
    }
    if (mode === 'sentence' && !readString(data.translatedText)) {
        throw new Error('Structured output is missing translatedText.')
    }
    if (mode === 'short-phrase-to-chinese' && (!Array.isArray(data.options) || data.options.length === 0)) {
        throw new Error('Structured output is missing translation options.')
    }
    return formatStructuredData(mode, data, readString)
}

// Keeps the filtered source of one structured response. Previews come from a tolerant parse
// of that source and never replace it; only the strict final parse decides the result.
export class StructuredOutputBuffer {
    private readonly thinkingFilter = new ThinkingFilter()
    private source = ''
    private preview = ''

    constructor(private readonly mode: StructuredOutputMode) {}

    append(chunk: string): boolean {
        const filtered = this.thinkingFilter.push(chunk)
        this.source += filtered
        return filtered.length > 0
    }

    // Returns the readable text when it changed and is not empty.
    push(chunk: string): string | undefined {
        if (!this.append(chunk)) {
            return undefined
        }
        const source = this.source.trimStart()
        if (!source.startsWith('{')) {
            return undefined
        }
        let data: unknown
        try {
            data = parsePartialJSON(source)
        } catch {
            // An escape sequence is still incomplete; keep the previous preview.
            return undefined
        }
        if (!isObject(data)) {
            return undefined
        }
        const preview = formatStructuredData(this.mode, data, readPreviewString)
        if (!preview || preview === this.preview) {
            return undefined
        }
        this.preview = preview
        return preview
    }

    finish(): string {
        this.source += this.thinkingFilter.finish()
        return formatStructuredOutput(this.mode, this.source)
    }
}

function getErrorDetail(error: unknown): { message?: unknown; param?: unknown; code?: unknown; type?: unknown } {
    if (typeof error === 'string') {
        return { message: error }
    }
    if (!isObject(error)) {
        return {}
    }
    const response = isObject(error.response) ? error.response : undefined
    const detail = error.error ?? response?.error
    if (isObject(detail)) {
        return detail
    }
    return typeof detail === 'string' ? { message: detail } : error
}

const STREAMING_UNSUPPORTED_MESSAGES = [
    /\bstream(?:ing)?\b(?:\s+(?:mode|parameter|option|output|responses?|requests?))?(?:\s+(?:with|for)\b[^.;]{0,80}?)?\s+(?:is|are)\s+(?:not\s+(?:supported|available|allowed)|unsupported)\b/i,
    /\b(?:does not|doesn't|do not|don't|cannot|can't)\s+support\s+(?:the\s+)?stream(?:ing)?\b/i,
    /\bunsupported value:?\s*['"`]?stream\b/i,
]

// Conservative detection of "this endpoint cannot stream (this structured format)". Other
// failures (auth, limits, schema, ambiguous stream errors) must surface unchanged.
export function isStreamingUnsupportedError(error: unknown): boolean {
    const detail = getErrorDetail(error)
    if (detail.param === 'stream' && /unsupported/i.test(`${detail.code ?? ''} ${detail.type ?? ''}`)) {
        return true
    }
    const message = detail.message
    return typeof message === 'string' && STREAMING_UNSUPPORTED_MESSAGES.some((pattern) => pattern.test(message))
}

const STREAMING_REJECTION_STATUSES = new Set([400, 422, 501])

function getThrownMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

// Owns the single terminal callback of one logical request and the output it has emitted.
export class EngineSession {
    finished = false
    // Set when the streaming attempt was rejected for lack of streaming support.
    fallback = false
    private contentStarted = false
    private fallbackUsed = false
    private readonly thinkingFilter = new ThinkingFilter()
    private readonly structured?: StructuredOutputBuffer

    constructor(
        readonly req: IMessageRequest,
        private readonly getErrorMessage: (error: unknown) => string
    ) {
        if (req.structuredOutput) {
            this.structured = new StructuredOutputBuffer(req.structuredOutput.mode)
        }
    }

    // True once events of the current streaming attempt must be ignored.
    get closed(): boolean {
        return this.finished || this.fallback || this.req.signal.aborted
    }

    // Any model text, reasoning or refusal rules out replaying the request.
    markContent() {
        this.contentStarted = true
    }

    async text(content: string, role = 'assistant') {
        this.markContent()
        if (this.structured) {
            const preview = this.structured.push(content)
            if (preview) {
                await this.req.onMessage({ content: preview, role: 'assistant', isFullText: true })
            }
            return
        }
        const filtered = this.thinkingFilter.push(content)
        if (filtered) {
            await this.req.onMessage({ content: filtered, role })
        }
    }

    // Completes with a whole response body; structured output emits no preview first.
    async completeResponse(content: string, reason: string) {
        if (this.structured) {
            this.structured.append(content)
        } else {
            await this.text(content)
        }
        await this.complete(reason)
    }

    async complete(reason: string) {
        if (this.finished) {
            return
        }
        if (this.req.signal.aborted) {
            this.abort()
            return
        }
        let message: { content: string; role: string; isFullText?: boolean } | undefined
        if (this.structured) {
            try {
                message = { content: this.structured.finish(), role: 'assistant', isFullText: true }
            } catch (error) {
                this.fail(getThrownMessage(error))
                return
            }
        } else {
            const content = this.thinkingFilter.finish()
            message = content ? { content, role: 'assistant' } : undefined
        }
        // Claim the terminal state before awaiting so no other path can finish concurrently.
        this.finished = true
        try {
            if (message) {
                await this.req.onMessage(message)
            }
        } catch (error) {
            this.req.onError(getThrownMessage(error))
            this.req.onFinished('error')
            return
        }
        this.req.onFinished(this.req.signal.aborted ? 'aborted' : reason)
    }

    fail(message: string) {
        if (this.finished) {
            return
        }
        // Cancellation outranks any error that arrives after it.
        if (this.req.signal.aborted) {
            this.abort()
            return
        }
        this.finished = true
        this.req.onError(message)
        this.req.onFinished('error')
    }

    failWith(error: unknown) {
        this.fail(this.getErrorMessage(error))
    }

    abort() {
        if (this.finished) {
            return
        }
        this.finished = true
        this.req.onFinished('aborted')
    }

    // Handles an upstream error from the streaming attempt: HTTP errors carry their status,
    // protocol error events do not.
    streamFailed(error: unknown, status?: number) {
        if (this.closed) {
            return
        }
        const canFallback =
            this.req.structuredOutput !== undefined &&
            !this.fallbackUsed &&
            !this.contentStarted &&
            !this.req.signal.aborted &&
            (status === undefined || STREAMING_REJECTION_STATUSES.has(status)) &&
            isStreamingUnsupportedError(error)
        if (canFallback) {
            this.fallback = true
            this.fallbackUsed = true
            return
        }
        this.failWith(error)
    }
}

export interface ProtocolRequest {
    url: string
    headers: Record<string, string>
    // Request body without the `stream` flag.
    body: Record<string, unknown>
    // One SSE `data` payload of the streaming attempt.
    onEvent(data: string): Promise<void>
    // A complete (non-streamed) protocol response envelope.
    onResponse(data: unknown): Promise<void>
    // The stream closed without a terminal event.
    onEnd(): Promise<void>
}

// Streams first; when the endpoint explicitly cannot stream, replays the identical request
// once with `stream: false`. A JSON response to the streaming request is consumed directly.
export async function sendProtocolRequest(session: EngineSession, protocol: ProtocolRequest): Promise<void> {
    const { req } = session
    let status: number | undefined
    const onStatusCode = (statusCode: number) => {
        status = statusCode
        req.onStatusCode?.(statusCode)
    }
    const init = (stream: boolean) => ({
        method: 'POST',
        headers: protocol.headers,
        body: JSON.stringify({ ...protocol.body, stream }),
        signal: req.signal,
    })
    try {
        await fetchSSE(protocol.url, {
            ...init(true),
            onStatusCode,
            onMessage: async (data) => {
                if (!session.closed) {
                    await protocol.onEvent(data)
                }
            },
            onJSONResponse: req.structuredOutput
                ? async (data) => {
                      if (!session.closed) {
                          await protocol.onResponse(data)
                      }
                  }
                : undefined,
            onError: (error) => session.streamFailed(error, status),
        })
        if (req.signal.aborted) {
            session.abort()
            return
        }
        if (!session.closed) {
            await protocol.onEnd()
        }
        if (!session.fallback || session.finished) {
            return
        }
        const resp = await getUniversalFetch()(protocol.url, init(false))
        onStatusCode(resp.status)
        const body = await resp.text()
        let data: unknown
        try {
            data = JSON.parse(body)
        } catch {
            data = body.trim() || undefined
        }
        if (!resp.ok) {
            session.failWith(data)
            return
        }
        if (!isObject(data)) {
            session.fail('The response is not a valid JSON object.')
            return
        }
        await protocol.onResponse(data)
    } catch (error) {
        if (req.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
            session.abort()
            return
        }
        session.fail(getThrownMessage(error))
    }
}
