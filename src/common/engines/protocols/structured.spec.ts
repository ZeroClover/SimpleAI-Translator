/* eslint-disable camelcase */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProviderConfig } from '../../types'
import { fetchSSE } from '../../utils'
import { getUniversalFetch } from '../../universal-fetch'
import { IEngine, IMessageRequest, StructuredOutputMode, StructuredOutputRequest } from '../interfaces'
import { AnthropicEngine } from './anthropic'
import { OpenAIChatEngine } from './openai-chat'
import { OpenAIResponsesEngine } from './openai-responses'

vi.mock('../../utils', () => ({ fetchSSE: vi.fn() }))
vi.mock('../../universal-fetch', () => ({ getUniversalFetch: vi.fn() }))

interface MockFetchSSEOptions extends RequestInit {
    onMessage: (data: string) => Promise<void>
    onError: (error: unknown) => void
    onStatusCode?: (statusCode: number) => void
    onJSONResponse?: (data: unknown) => Promise<void>
}

type Script = (options: MockFetchSSEOptions) => Promise<void>

const baseConfig: ProviderConfig = {
    id: 'provider-1',
    name: 'Provider',
    protocol: 'openai-chat',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
    extraHeaders: { 'X-Trace': 'trace-1' },
}

function structuredOutput(mode: StructuredOutputMode, strict = true): StructuredOutputRequest {
    return {
        mode,
        schemaName: `${mode}_translation`,
        strict,
        schema: { type: 'object', properties: { options: { type: 'array', minItems: 1, maxItems: 3 } } },
    }
}

interface Protocol {
    name: string
    engine: () => IEngine
    // SSE data payload carrying a text delta.
    delta: (text: string) => string
    // SSE payloads that end the stream with the given reason.
    end: (reason?: 'stop' | 'length') => string[]
    // Complete (non-streamed) envelope.
    complete: (text: string, reason?: 'stop' | 'length') => unknown
    // A streamed protocol error event that explicitly rejects streaming.
    streamError: unknown
    // SSE payload carrying reasoning or refusal content (not translation text).
    nonTextContent: string
    lengthReason: string
}

const PROTOCOLS: Protocol[] = [
    {
        name: 'OpenAI Chat',
        engine: () => new OpenAIChatEngine(baseConfig),
        delta: (text) => JSON.stringify({ choices: [{ delta: { content: text } }] }),
        end: (reason = 'stop') => [JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] })],
        complete: (text, reason = 'stop') => ({
            choices: [{ message: { role: 'assistant', content: text }, finish_reason: reason }],
        }),
        streamError: { error: { message: 'Streaming is not supported with response_format json_schema' } },
        nonTextContent: JSON.stringify({ choices: [{ delta: { reasoning_content: 'thinking' } }] }),
        lengthReason: 'length',
    },
    {
        name: 'OpenAI Responses',
        engine: () => new OpenAIResponsesEngine({ ...baseConfig, protocol: 'openai-responses' }),
        delta: (text) => JSON.stringify({ type: 'response.output_text.delta', delta: text }),
        end: (reason = 'stop') => [
            JSON.stringify(
                reason === 'stop'
                    ? { type: 'response.completed', response: { status: 'completed' } }
                    : {
                          type: 'response.incomplete',
                          response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } },
                      }
            ),
        ],
        complete: (text, reason = 'stop') => ({
            status: reason === 'stop' ? 'completed' : 'incomplete',
            incomplete_details: reason === 'stop' ? null : { reason: 'max_output_tokens' },
            error: null,
            output: [
                { type: 'reasoning', summary: [], content: [{ type: 'reasoning_text', text: 'secret' }] },
                { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
            ],
        }),
        streamError: {
            type: 'error',
            code: 'unsupported_value',
            param: 'stream',
            message: 'Unsupported value: stream',
        },
        nonTextContent: JSON.stringify({ type: 'response.reasoning_summary_text.delta', delta: 'thinking' }),
        lengthReason: 'max_tokens',
    },
    {
        name: 'Anthropic',
        engine: () => new AnthropicEngine({ ...baseConfig, protocol: 'anthropic', model: 'claude-opus-5-5' }),
        delta: (text) => JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } }),
        end: (reason = 'stop') => [
            ...(reason === 'length'
                ? [JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } })]
                : []),
            JSON.stringify({ type: 'message_stop' }),
        ],
        complete: (text, reason = 'stop') => ({
            type: 'message',
            role: 'assistant',
            content: [
                { type: 'thinking', thinking: 'secret', signature: 'sig' },
                { type: 'text', text },
            ],
            stop_reason: reason === 'stop' ? 'end_turn' : 'max_tokens',
        }),
        streamError: {
            type: 'error',
            error: { type: 'invalid_request_error', message: 'Streaming is not supported for structured outputs.' },
        },
        nonTextContent: JSON.stringify({
            type: 'content_block_delta',
            delta: { type: 'thinking_delta', thinking: 'thinking' },
        }),
        lengthReason: 'max_tokens',
    },
]

const MODES: Array<[StructuredOutputMode, unknown, string]> = [
    ['sentence', { translatedText: '早上好，世界' }, '早上好，世界'],
    [
        'word',
        { original_form: 'run', language: 'English', phonetics: 'rʌn', senses: [{ pos: 'verb', meaning: '跑' }] },
        'run\n[English] · /rʌn/\n[verb] 跑',
    ],
    [
        'short-phrase-to-chinese',
        { options: [{ translation: '你好', context_explanation: '问候' }, { translation: '嗨' }] },
        '1. 你好\n问候\n\n2. 嗨',
    ],
]

const STREAM_REJECTION = {
    error: { message: "Unsupported value: 'stream' does not support true with this model.", param: 'stream' },
}

// Records every callback in order so tests can check that the final text precedes the finish.
function createRequest(
    mode: StructuredOutputMode = 'sentence',
    overrides: Partial<IMessageRequest> = {},
    signal = new AbortController().signal
) {
    const log: Array<[string, unknown]> = []
    const req: IMessageRequest = {
        rolePrompt: 'You are a translator',
        commandPrompt: '<src_a1b2c3d4>\nGood morning\n</src_a1b2c3d4>',
        structuredOutput: structuredOutput(mode),
        onMessage: vi.fn(async (message) => {
            log.push(['message', message.content])
        }),
        onError: vi.fn((error) => {
            log.push(['error', error])
        }),
        onFinished: vi.fn((reason) => {
            log.push(['finish', reason])
        }),
        onStatusCode: vi.fn((status) => {
            log.push(['status', status])
        }),
        signal,
        ...overrides,
    }
    return { req, log }
}

function script(run: Script) {
    vi.mocked(fetchSSE).mockImplementationOnce(async (_input: string, options: MockFetchSSEOptions) => run(options))
}

async function sendAll(options: MockFetchSSEOptions, events: string[]) {
    for (const event of events) {
        await options.onMessage(event)
    }
}

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function mockFallback(...responses: Response[]) {
    const fetcher = vi.fn()
    responses.forEach((response) => fetcher.mockResolvedValueOnce(response))
    vi.mocked(getUniversalFetch).mockReturnValue(fetcher)
    return fetcher
}

function finishes(log: Array<[string, unknown]>) {
    return log.filter(([kind]) => kind === 'finish').map(([, reason]) => reason)
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe.each(PROTOCOLS)('$name structured streaming', (protocol) => {
    it.each(MODES)(
        'streams readable %s previews and commits the final text before finishing',
        async (mode, data, text) => {
            const json = JSON.stringify(data)
            const chunks = json.match(/[\s\S]{1,6}/g) ?? []
            const { req, log } = createRequest(mode)
            script((options) => sendAll(options, [...chunks.map(protocol.delta), ...protocol.end()]))

            await protocol.engine().sendMessage(req)

            const messages = log.filter(([kind]) => kind === 'message').map(([, content]) => content as string)
            expect(messages.length).toBeGreaterThan(2)
            messages.forEach((message) => expect(message).not.toMatch(/[{}"]/))
            expect(log.at(-2)).toEqual(['message', text])
            expect(log.at(-1)).toEqual(['finish', 'stop'])
            expect(req.onError).not.toHaveBeenCalled()
            expect(req.onMessage).toHaveBeenLastCalledWith({ content: text, role: 'assistant', isFullText: true })
            expect(getUniversalFetch).not.toHaveBeenCalled()
        }
    )

    it('consumes a direct JSON response once without a second request', async () => {
        const { req, log } = createRequest('sentence')
        script(async (options) => {
            expect(options.onJSONResponse).toBeTypeOf('function')
            await options.onJSONResponse?.(protocol.complete('{"translatedText":"你好"}'))
        })

        await protocol.engine().sendMessage(req)

        expect(fetchSSE).toHaveBeenCalledOnce()
        expect(getUniversalFetch).not.toHaveBeenCalled()
        expect(log).toEqual([
            ['message', '你好'],
            ['finish', 'stop'],
        ])
    })

    it('does not request whole JSON responses for plain text', async () => {
        const { req } = createRequest('sentence', { structuredOutput: undefined })
        script(async (options) => {
            expect(options.onJSONResponse).toBeUndefined()
            await sendAll(options, [protocol.delta('hi'), ...protocol.end()])
        })
        await protocol.engine().sendMessage(req)
        expect(req.onMessage).toHaveBeenCalledWith({ content: 'hi', role: 'assistant' })
    })

    it.each([400, 422, 501])('retries once without streaming after an explicit HTTP %s rejection', async (status) => {
        const { req, log } = createRequest('sentence')
        let streamInit: MockFetchSSEOptions | undefined
        script(async (options) => {
            streamInit = options
            options.onStatusCode?.(status)
            options.onError(STREAM_REJECTION)
        })
        const fetcher = mockFallback(jsonResponse(protocol.complete('{"translatedText":"你好"}')))

        await protocol.engine().sendMessage(req)

        expect(fetcher).toHaveBeenCalledOnce()
        const [url, init] = fetcher.mock.calls[0] as [string, RequestInit]
        expect(url).toBe(vi.mocked(fetchSSE).mock.calls[0][0])
        expect(init.method).toBe('POST')
        expect(init.headers).toEqual(streamInit?.headers)
        expect(init.headers).toMatchObject({ 'X-Trace': 'trace-1' })
        expect(init.signal).toBe(req.signal)
        const streamBody = JSON.parse(streamInit?.body as string)
        expect(streamBody.stream).toBe(true)
        expect(JSON.parse(init.body as string)).toEqual({ ...streamBody, stream: false })
        expect(log).toEqual([
            ['status', status],
            ['status', 200],
            ['message', '你好'],
            ['finish', 'stop'],
        ])
    })

    it('retries once after a protocol error event before any content', async () => {
        const { req, log } = createRequest('sentence')
        script(async (options) => {
            await options.onMessage(JSON.stringify(protocol.streamError))
            // Events after the rejection belong to the abandoned attempt.
            await options.onMessage(protocol.delta('{"translatedText":"stale"}'))
        })
        const fetcher = mockFallback(jsonResponse(protocol.complete('{"translatedText":"你好"}')))

        await protocol.engine().sendMessage(req)

        expect(fetcher).toHaveBeenCalledOnce()
        expect(req.onError).not.toHaveBeenCalled()
        expect(log.filter(([kind]) => kind !== 'status')).toEqual([
            ['message', '你好'],
            ['finish', 'stop'],
        ])
    })

    it.each([
        ['ambiguous stream error', 400, { error: { message: 'Invalid stream payload' } }],
        ['unsupported structured output', 400, { error: { message: 'response_format json_schema is not supported' } }],
        ['unknown schema', 422, { error: { message: 'Unknown schema' } }],
        ['auth error', 401, STREAM_REJECTION],
        ['forbidden', 403, STREAM_REJECTION],
        ['not found', 404, STREAM_REJECTION],
        ['rate limit', 429, STREAM_REJECTION],
        ['generic server error', 500, STREAM_REJECTION],
    ])('does not retry after %s', async (_name, status, body) => {
        const { req, log } = createRequest('sentence')
        script(async (options) => {
            options.onStatusCode?.(status)
            options.onError(body)
        })
        const fetcher = mockFallback()

        await protocol.engine().sendMessage(req)

        expect(fetcher).not.toHaveBeenCalled()
        expect(req.onError).toHaveBeenCalledOnce()
        expect(finishes(log)).toEqual(['error'])
    })

    it('does not retry after a network error', async () => {
        const { req, log } = createRequest('sentence')
        vi.mocked(fetchSSE).mockRejectedValueOnce(new Error('network down'))
        const fetcher = mockFallback()
        await protocol.engine().sendMessage(req)
        expect(fetcher).not.toHaveBeenCalled()
        expect(req.onError).toHaveBeenCalledWith('network down')
        expect(finishes(log)).toEqual(['error'])
    })

    it.each([
        ['text', (p: Protocol) => p.delta('{"translatedText":"你')],
        ['reasoning', (p: Protocol) => p.nonTextContent],
    ])('does not replay the request once %s content has arrived', async (_name, content) => {
        const { req, log } = createRequest('sentence')
        script((options) => sendAll(options, [content(protocol), JSON.stringify(protocol.streamError)]))
        const fetcher = mockFallback()

        await protocol.engine().sendMessage(req)

        expect(fetcher).not.toHaveBeenCalled()
        expect(req.onError).toHaveBeenCalledOnce()
        expect(finishes(log)).toEqual(['error'])
    })

    it('does not retry plain text requests', async () => {
        const { req, log } = createRequest('sentence', { structuredOutput: undefined })
        script(async (options) => {
            options.onStatusCode?.(400)
            options.onError(STREAM_REJECTION)
        })
        const fetcher = mockFallback()
        await protocol.engine().sendMessage(req)
        expect(fetcher).not.toHaveBeenCalled()
        expect(finishes(log)).toEqual(['error'])
    })

    it('reports a failed fallback once without a third request', async () => {
        const { req, log } = createRequest('sentence')
        script(async (options) => {
            options.onStatusCode?.(400)
            options.onError(STREAM_REJECTION)
        })
        const fetcher = mockFallback(
            jsonResponse({ type: 'error', error: { message: 'max_tokens is too large for non-streaming' } }, 400)
        )

        await protocol.engine().sendMessage(req)

        expect(fetcher).toHaveBeenCalledOnce()
        expect(log).toEqual([
            ['status', 400],
            ['status', 400],
            ['error', 'max_tokens is too large for non-streaming'],
            ['finish', 'error'],
        ])
    })

    it('reports a malformed fallback envelope', async () => {
        const { req, log } = createRequest('sentence')
        script(async (options) => {
            options.onStatusCode?.(400)
            options.onError(STREAM_REJECTION)
        })
        mockFallback(jsonResponse({ unexpected: true }))
        await protocol.engine().sendMessage(req)
        expect(req.onError).toHaveBeenCalledOnce()
        expect(req.onMessage).not.toHaveBeenCalled()
        expect(finishes(log)).toEqual(['error'])
    })

    it('reports a direct JSON response without a valid protocol envelope', async () => {
        const { req, log } = createRequest('sentence')
        script(async (options) => {
            await options.onJSONResponse?.({ id: 'x' })
        })
        const fetcher = mockFallback()
        await protocol.engine().sendMessage(req)
        expect(fetcher).not.toHaveBeenCalled()
        expect(req.onError).toHaveBeenCalledOnce()
        expect(finishes(log)).toEqual(['error'])
    })

    it('does not start a fallback after cancellation', async () => {
        const controller = new AbortController()
        const { req, log } = createRequest('sentence', {}, controller.signal)
        script(async (options) => {
            options.onStatusCode?.(400)
            options.onError(STREAM_REJECTION)
            controller.abort()
        })
        const fetcher = mockFallback()

        await protocol.engine().sendMessage(req)

        expect(fetcher).not.toHaveBeenCalled()
        expect(req.onError).not.toHaveBeenCalled()
        expect(finishes(log)).toEqual(['aborted'])
    })

    it('cancels a pending fallback once without a validation error', async () => {
        const controller = new AbortController()
        const { req, log } = createRequest('sentence', {}, controller.signal)
        script(async (options) => {
            options.onStatusCode?.(400)
            options.onError(STREAM_REJECTION)
        })
        const fetcher = vi.fn(
            (_url: string, init: RequestInit) =>
                new Promise<Response>((_resolve, reject) => {
                    init.signal?.addEventListener('abort', () => reject(new Error('Request cancelled')))
                    controller.abort()
                })
        )
        vi.mocked(getUniversalFetch).mockReturnValue(fetcher)

        await protocol.engine().sendMessage(req)

        expect(fetcher).toHaveBeenCalledOnce()
        expect(req.onError).not.toHaveBeenCalled()
        expect(finishes(log)).toEqual(['aborted'])
    })

    it('reports a refusal before validating the JSON', async () => {
        const { req, log } = createRequest('sentence')
        const refusal =
            protocol.name === 'OpenAI Chat'
                ? [JSON.stringify({ choices: [{ delta: { refusal: 'No.' }, finish_reason: 'stop' }] })]
                : protocol.name === 'OpenAI Responses'
                ? [
                      JSON.stringify({ type: 'response.refusal.delta', delta: 'No.' }),
                      JSON.stringify({ type: 'response.completed' }),
                  ]
                : [JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'refusal' } })]
        script((options) => sendAll(options, [protocol.delta('{"translatedText":"x'), ...refusal]))

        await protocol.engine().sendMessage(req)

        expect(req.onError).toHaveBeenCalledOnce()
        expect(vi.mocked(req.onError).mock.calls[0][0]).not.toMatch(/JSON|translatedText/)
        expect(finishes(log)).toEqual(['error'])
    })

    it('validates the buffer when the stream closes without a terminal event', async () => {
        const { req, log } = createRequest('sentence')
        script((options) => sendAll(options, [protocol.delta('{"translatedText":'), protocol.delta('"好"}')]))
        await protocol.engine().sendMessage(req)
        expect(log.slice(-2)).toEqual([
            ['message', '好'],
            ['finish', 'stop'],
        ])
    })

    it.each([
        ['no output', [] as string[]],
        ['unclosed JSON', ['{"translatedText":"好']],
    ])('fails at the end of the stream with %s', async (_name, chunks) => {
        const { req, log } = createRequest('sentence')
        script((options) => sendAll(options, chunks.map(protocol.delta)))
        const fetcher = mockFallback()
        await protocol.engine().sendMessage(req)
        expect(fetcher).not.toHaveBeenCalled()
        expect(req.onError).toHaveBeenCalledOnce()
        expect(finishes(log)).toEqual(['error'])
    })

    it('fails truncated invalid JSON instead of reporting a token limit', async () => {
        const { req, log } = createRequest('sentence')
        script((options) => sendAll(options, [protocol.delta('{"translatedText":"好'), ...protocol.end('length')]))
        await protocol.engine().sendMessage(req)
        expect(req.onError).toHaveBeenCalledOnce()
        expect(finishes(log)).toEqual(['error'])
    })

    it('keeps the token-limit reason for valid JSON', async () => {
        const { req, log } = createRequest('sentence')
        script((options) => sendAll(options, [protocol.delta('{"translatedText":"好"}'), ...protocol.end('length')]))
        await protocol.engine().sendMessage(req)
        expect(req.onError).not.toHaveBeenCalled()
        expect(log.slice(-2)).toEqual([
            ['message', '好'],
            ['finish', protocol.lengthReason],
        ])
    })

    it('keeps the token-limit reason for a valid complete response', async () => {
        const { req, log } = createRequest('sentence')
        script(async (options) => {
            await options.onJSONResponse?.(protocol.complete('{"translatedText":"好"}', 'length'))
        })
        await protocol.engine().sendMessage(req)
        expect(log).toEqual([
            ['message', '好'],
            ['finish', protocol.lengthReason],
        ])
    })

    it('ignores events after the request finished', async () => {
        const { req, log } = createRequest('sentence')
        script((options) =>
            sendAll(options, [
                protocol.delta('{"translatedText":"好"}'),
                ...protocol.end(),
                protocol.delta('late'),
                ...protocol.end(),
                JSON.stringify(protocol.streamError),
            ])
        )
        await protocol.engine().sendMessage(req)
        expect(finishes(log)).toEqual(['stop'])
        expect(req.onError).not.toHaveBeenCalled()
        expect(log.at(-1)).toEqual(['finish', 'stop'])
    })

    it('finishes as aborted without validating an unfinished buffer', async () => {
        const controller = new AbortController()
        const { req, log } = createRequest('sentence', {}, controller.signal)
        script(async (options) => {
            await options.onMessage(protocol.delta('{"translatedText":"好'))
            controller.abort()
            throw new DOMException('Aborted', 'AbortError')
        })
        await protocol.engine().sendMessage(req)
        expect(req.onError).not.toHaveBeenCalled()
        expect(finishes(log)).toEqual(['aborted'])
    })
})

describe('structured request payloads', () => {
    it.each([
        [true, { type: 'json_schema', json_schema: expect.objectContaining({ strict: true }) }],
        [false, { type: 'json_object' }],
    ])('keeps OpenAI Chat response_format with strict %s', async (strict, responseFormat) => {
        const { req } = createRequest('word', { structuredOutput: structuredOutput('word', strict) })
        script(async (options) => {
            expect(JSON.parse(options.body as string)).toMatchObject({ response_format: responseFormat, stream: true })
        })
        await new OpenAIChatEngine(baseConfig).sendMessage(req)
    })

    it.each([
        [true, { type: 'json_schema', strict: true }],
        [false, { type: 'json_object' }],
    ])('keeps OpenAI Responses text.format with strict %s', async (strict, format) => {
        const { req } = createRequest('word', { structuredOutput: structuredOutput('word', strict) })
        script(async (options) => {
            expect(JSON.parse(options.body as string)).toMatchObject({
                text: { format },
                store: false,
                stream: true,
            })
        })
        await new OpenAIResponsesEngine({ ...baseConfig, protocol: 'openai-responses' }).sendMessage(req)
    })

    it('merges Anthropic output_config format and effort in both attempts', async () => {
        const { req } = createRequest('short-phrase-to-chinese')
        script(async (options) => {
            options.onStatusCode?.(400)
            options.onError(STREAM_REJECTION)
        })
        const fetcher = mockFallback(jsonResponse(PROTOCOLS[2].complete('{"options":[{"translation":"你好"}]}')))

        await new AnthropicEngine({ ...baseConfig, protocol: 'anthropic', model: 'claude-opus-5-5' }).sendMessage(req)

        const streamBody = JSON.parse(vi.mocked(fetchSSE).mock.calls[0][1].body as string)
        const fallbackBody = JSON.parse((fetcher.mock.calls[0][1] as RequestInit).body as string)
        expect(streamBody).toMatchObject({
            max_tokens: 64000,
            output_config: {
                effort: 'low',
                format: { type: 'json_schema', schema: { properties: { options: { type: 'array' } } } },
            },
            stream: true,
        })
        expect(streamBody.output_config.format.schema.properties.options).not.toHaveProperty('maxItems')
        expect(fallbackBody).toEqual({ ...streamBody, stream: false })
        expect(req.onMessage).toHaveBeenCalledWith({ content: '1. 你好', role: 'assistant', isFullText: true })
    })
})

describe('content that rules out a fallback', () => {
    it.each([
        [
            'Anthropic thinking block start',
            () => new AnthropicEngine({ ...baseConfig, protocol: 'anthropic', model: 'claude-opus-5-5' }),
            JSON.stringify({
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'thinking', thinking: 'x' },
            }),
            PROTOCOLS[2].streamError,
        ],
        [
            'Responses reasoning item',
            () => new OpenAIResponsesEngine({ ...baseConfig, protocol: 'openai-responses' }),
            JSON.stringify({
                type: 'response.output_item.added',
                item: { type: 'reasoning', encrypted_content: 'opaque' },
            }),
            PROTOCOLS[1].streamError,
        ],
    ])('does not replay after a %s', async (_name, createEngine, content, streamError) => {
        const { req, log } = createRequest('sentence')
        script((options) => sendAll(options, [content, JSON.stringify(streamError)]))
        const fetcher = mockFallback()

        await createEngine().sendMessage(req)

        expect(fetcher).not.toHaveBeenCalled()
        expect(req.onError).toHaveBeenCalledOnce()
        expect(finishes(log)).toEqual(['error'])
    })

    it('reports an OpenAI Responses refusal before a token-limit end', async () => {
        const { req, log } = createRequest('sentence')
        script((options) =>
            sendAll(options, [
                JSON.stringify({ type: 'response.refusal.delta', delta: 'No.' }),
                JSON.stringify({
                    type: 'response.incomplete',
                    response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } },
                }),
            ])
        )
        await new OpenAIResponsesEngine({ ...baseConfig, protocol: 'openai-responses' }).sendMessage(req)
        expect(log).toEqual([
            ['error', 'No.'],
            ['finish', 'error'],
        ])
    })
})

describe('complete response envelopes', () => {
    it('reports an OpenAI Chat refusal from a complete response', async () => {
        const { req, log } = createRequest('sentence')
        script(async (options) => {
            await options.onJSONResponse?.({
                choices: [{ message: { content: null, refusal: 'No.' }, finish_reason: 'stop' }],
            })
        })
        await new OpenAIChatEngine(baseConfig).sendMessage(req)
        expect(log).toEqual([
            ['error', 'No.'],
            ['finish', 'error'],
        ])
    })

    it('reports an OpenAI Responses refusal item', async () => {
        const { req, log } = createRequest('sentence')
        script(async (options) => {
            await options.onJSONResponse?.({
                status: 'completed',
                output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No.' }] }],
            })
        })
        await new OpenAIResponsesEngine({ ...baseConfig, protocol: 'openai-responses' }).sendMessage(req)
        expect(log).toEqual([
            ['error', 'No.'],
            ['finish', 'error'],
        ])
    })

    it.each([
        [{ status: 'failed', error: { message: 'boom' }, output: [] }, 'boom'],
        [
            { status: 'incomplete', incomplete_details: { reason: 'content_filter' }, output: [] },
            'The response is incomplete (content_filter).',
        ],
        [{ status: 'in_progress', output: [] }, 'The response finished with status: in_progress.'],
    ])('reports non-successful OpenAI Responses status %j', async (envelope, error) => {
        const { req, log } = createRequest('sentence')
        script(async (options) => {
            await options.onJSONResponse?.(envelope)
        })
        await new OpenAIResponsesEngine({ ...baseConfig, protocol: 'openai-responses' }).sendMessage(req)
        expect(log).toEqual([
            ['error', error],
            ['finish', 'error'],
        ])
    })

    it('reports an Anthropic refusal from a complete response', async () => {
        const { req, log } = createRequest('sentence')
        script(async (options) => {
            await options.onJSONResponse?.({
                type: 'message',
                content: [],
                stop_reason: 'refusal',
                stop_details: { type: 'refusal', category: 'cyber' },
            })
        })
        await new AnthropicEngine({ ...baseConfig, protocol: 'anthropic' }).sendMessage(req)
        expect(log).toEqual([
            ['error', 'The model refused to answer (cyber).'],
            ['finish', 'error'],
        ])
    })
})
