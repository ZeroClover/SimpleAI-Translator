/* eslint-disable camelcase */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProviderConfig } from '../../types'
import { getUniversalFetch } from '../../universal-fetch'
import { IMessageRequest } from '../interfaces'
import { AnthropicEngine } from './anthropic'
import { OpenAIChatEngine } from './openai-chat'
import { OpenAIResponsesEngine } from './openai-responses'

// Engines run over the real fetchSSE; only the network fetch is replaced.
vi.mock('../../universal-fetch', () => ({ getUniversalFetch: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(), emit: vi.fn(async () => {}) }))
vi.mock('@/tauri/bindings', () => ({ commands: {} }))

const config: ProviderConfig = {
    id: 'provider-1',
    name: 'Provider',
    protocol: 'openai-chat',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
}

const sentence: IMessageRequest['structuredOutput'] = {
    mode: 'sentence',
    schemaName: 'sentence_translation',
    strict: true,
    schema: { type: 'object' },
}

const encoder = new TextEncoder()

function response(body: string, init: ResponseInit, chunkSize = 7): Response {
    const bytes = encoder.encode(body)
    return new Response(
        new ReadableStream({
            start(controller) {
                for (let index = 0; index < bytes.length; index += chunkSize) {
                    controller.enqueue(bytes.slice(index, index + chunkSize))
                }
                controller.close()
            },
        }),
        init
    )
}

function sse(events: unknown[]): string {
    return events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join('')
}

const SSE = { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } }
const JSON_INIT = (status = 200) => ({ status, headers: { 'Content-Type': 'application/json' } })

function createRequest(overrides: Partial<IMessageRequest> = {}) {
    const log: Array<[string, unknown]> = []
    const req: IMessageRequest = {
        rolePrompt: 'You are a translator',
        commandPrompt: 'Translate',
        structuredOutput: sentence,
        onMessage: vi.fn(async (message) => {
            log.push(['message', message.content])
        }),
        onError: vi.fn((error) => {
            log.push(['error', error])
        }),
        onFinished: vi.fn((reason) => {
            log.push(['finish', reason])
        }),
        signal: new AbortController().signal,
        ...overrides,
    }
    return { req, log }
}

function mockNetwork(...responses: Response[]) {
    const fetcher = vi.fn()
    responses.forEach((item) => fetcher.mockResolvedValueOnce(item))
    vi.mocked(getUniversalFetch).mockReturnValue(fetcher)
    return fetcher
}

function bodies(fetcher: ReturnType<typeof vi.fn>) {
    return fetcher.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string))
}

const unhandled = vi.fn()

beforeEach(() => {
    vi.clearAllMocks()
    process.on('unhandledRejection', unhandled)
})

afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
})

describe('engines over the real stream transport', () => {
    it('previews OpenAI Chat output split across UTF-8 byte boundaries', async () => {
        const text = '{"translatedText":"早上好😀"}'
        const fetcher = mockNetwork(
            response(
                sse([
                    ...text.match(/.{1,4}/g)!.map((part) => ({ choices: [{ delta: { content: part } }] })),
                    { choices: [{ delta: {}, finish_reason: 'stop' }] },
                    '[DONE]',
                ]),
                SSE,
                3
            )
        )
        const { req, log } = createRequest()

        await new OpenAIChatEngine(config).sendMessage(req)

        expect(fetcher).toHaveBeenCalledOnce()
        const messages = log.filter(([kind]) => kind === 'message').map(([, content]) => content as string)
        expect(messages.length).toBeGreaterThan(2)
        expect(messages.join('')).not.toContain('�')
        expect(log.slice(-2)).toEqual([
            ['message', '早上好😀'],
            ['finish', 'stop'],
        ])
    })

    it('retries an explicit HTTP rejection once without streaming', async () => {
        const fetcher = mockNetwork(
            response(
                JSON.stringify({ error: { message: 'Unsupported value', param: 'stream', code: 'unsupported_value' } }),
                JSON_INIT(400),
                5
            ),
            response(
                JSON.stringify({
                    status: 'completed',
                    output: [{ type: 'message', content: [{ type: 'output_text', text: '{"translatedText":"好"}' }] }],
                }),
                JSON_INIT()
            )
        )
        const onStatusCode = vi.fn()
        const { req, log } = createRequest({ onStatusCode })

        await new OpenAIResponsesEngine({ ...config, protocol: 'openai-responses' }).sendMessage(req)

        expect(fetcher).toHaveBeenCalledTimes(2)
        const [streamBody, fallbackBody] = bodies(fetcher)
        expect(fallbackBody).toEqual({ ...streamBody, stream: false })
        expect(onStatusCode.mock.calls).toEqual([[400], [200]])
        expect(log).toEqual([
            ['message', '好'],
            ['finish', 'stop'],
        ])
    })

    it('surfaces a failed fallback without a third request', async () => {
        const rejection = JSON.stringify({ error: { message: 'Streaming is not supported for this model.' } })
        const fetcher = mockNetwork(
            response(rejection, JSON_INIT(400)),
            response(JSON.stringify({ error: { message: 'Model overloaded' } }), JSON_INIT(400))
        )
        const { req, log } = createRequest()

        await new OpenAIChatEngine(config).sendMessage(req)

        expect(fetcher).toHaveBeenCalledTimes(2)
        expect(log).toEqual([
            ['error', 'Model overloaded'],
            ['finish', 'error'],
        ])
    })

    it('consumes a direct Anthropic JSON response with one request', async () => {
        const fetcher = mockNetwork(
            response(
                JSON.stringify({
                    type: 'message',
                    content: [{ type: 'text', text: '{"translatedText":"中文"}' }],
                    stop_reason: 'end_turn',
                }),
                { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
                4
            )
        )
        const { req, log } = createRequest()

        await new AnthropicEngine({ ...config, protocol: 'anthropic', model: 'claude-sonnet-4-6' }).sendMessage(req)

        expect(fetcher).toHaveBeenCalledOnce()
        expect(log).toEqual([
            ['message', '中文'],
            ['finish', 'stop'],
        ])
    })

    it('ignores a [DONE] that follows the Responses terminal event', async () => {
        mockNetwork(
            response(
                sse([
                    { type: 'response.output_text.delta', delta: '{"translatedText":"好"}' },
                    { type: 'response.completed', response: { status: 'completed' } },
                    '[DONE]',
                ]),
                SSE
            )
        )
        const { req, log } = createRequest()
        await new OpenAIResponsesEngine({ ...config, protocol: 'openai-responses' }).sendMessage(req)
        expect(log.filter(([kind]) => kind === 'finish')).toEqual([['finish', 'stop']])
        expect(req.onError).not.toHaveBeenCalled()
    })

    it('waits for a slow consumer and commits the final text before one finish', async () => {
        mockNetwork(
            response(
                sse([
                    { choices: [{ delta: { content: '{"translatedText":"你' } }] },
                    { choices: [{ delta: { content: '好"}' }, finish_reason: 'stop' }] },
                ]),
                SSE,
                1000
            )
        )
        const { req, log } = createRequest({
            onMessage: vi.fn(async (message) => {
                await new Promise((resolve) => setTimeout(resolve, 5))
                log.push(['message', message.content])
            }),
        })

        await new OpenAIChatEngine(config).sendMessage(req)

        expect(log).toEqual([
            ['message', '你'],
            ['message', '你好'],
            ['message', '你好'],
            ['finish', 'stop'],
        ])
    })

    it('ends with a controlled error when a consumer rejects', async () => {
        mockNetwork(
            response(
                sse([
                    { choices: [{ delta: { content: '{"translatedText":"你' } }] },
                    { choices: [{ delta: { content: '好"}' }, finish_reason: 'stop' }] },
                ]),
                SSE
            )
        )
        const { req, log } = createRequest({
            onMessage: vi.fn(async () => {
                throw new Error('render failed')
            }),
        })

        await new OpenAIChatEngine(config).sendMessage(req)

        expect(log).toEqual([
            ['error', 'render failed'],
            ['finish', 'error'],
        ])
    })

    it('finishes once with an error when only the final snapshot fails to render', async () => {
        mockNetwork(
            response(
                sse([{ choices: [{ delta: { content: '{"translatedText":"好"}' }, finish_reason: 'stop' }] }]),
                SSE
            )
        )
        let calls = 0
        const { req, log } = createRequest({
            onMessage: vi.fn(async () => {
                calls += 1
                if (calls === 2) {
                    throw new Error('render failed')
                }
            }),
        })

        await new OpenAIChatEngine(config).sendMessage(req)

        expect(log).toEqual([
            ['error', 'render failed'],
            ['finish', 'error'],
        ])
    })

    it('finishes as aborted when cancelled while a later event of the same packet is pending', async () => {
        mockNetwork(
            response(
                sse([
                    { choices: [{ delta: { content: '{"translatedText":"部分' } }] },
                    { error: { message: 'upstream error' } },
                ]),
                SSE,
                1000
            )
        )
        const controller = new AbortController()
        const { req, log } = createRequest({
            signal: controller.signal,
            onMessage: vi.fn(async (message) => {
                log.push(['message', message.content])
                controller.abort()
            }),
        })

        await new OpenAIChatEngine(config).sendMessage(req)

        expect(log).toEqual([
            ['message', '部分'],
            ['finish', 'aborted'],
        ])
    })

    it('reports a malformed SSE payload as a controlled error', async () => {
        mockNetwork(response('data: {"choices":\n\n', SSE))
        const { req, log } = createRequest()
        await new OpenAIChatEngine(config).sendMessage(req)
        expect(req.onError).toHaveBeenCalledOnce()
        expect(log.at(-1)).toEqual(['finish', 'error'])
    })

    it('keeps plain text streaming unchanged for a JSON media type', async () => {
        mockNetwork(response(sse([{ choices: [{ delta: { content: 'hi' } }] }, '[DONE]']), JSON_INIT()))
        const { req, log } = createRequest({ structuredOutput: undefined })
        await new OpenAIChatEngine(config).sendMessage(req)
        expect(log).toEqual([
            ['message', 'hi'],
            ['finish', 'stop'],
        ])
    })
})
