/* eslint-disable camelcase */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProviderConfig } from '../../types'
import { fetchSSE } from '../../utils'
import { getUniversalFetch } from '../../universal-fetch'
import { formatStructuredOutput, IEngine, IMessageRequest } from '../interfaces'
import { AnthropicEngine, listModels as listAnthropicModels } from './anthropic'
import { OpenAIChatEngine, listModels as listOpenAIChatModels } from './openai-chat'
import { OpenAIResponsesEngine, listModels as listOpenAIResponsesModels } from './openai-responses'

vi.mock('../../utils', () => ({ fetchSSE: vi.fn() }))
vi.mock('../../universal-fetch', () => ({ getUniversalFetch: vi.fn() }))

interface MockFetchSSEOptions {
    body?: BodyInit | null
    headers?: HeadersInit
    onMessage: (data: string) => Promise<void>
    onError: (error: unknown) => void
    onStatusCode?: (statusCode: number) => void
}

type ProtocolThinkingFilterCase = [string, () => IEngine, (options: MockFetchSSEOptions) => Promise<void>]

const providerConfig: ProviderConfig = {
    id: 'provider-1',
    name: 'Provider',
    protocol: 'openai-chat',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
}

function createRequest(signal = new AbortController().signal, overrides: Partial<IMessageRequest> = {}) {
    const onMessage = vi.fn().mockResolvedValue(undefined)
    const onError = vi.fn()
    const onFinished = vi.fn()
    const onStatusCode = vi.fn()
    const req: IMessageRequest = {
        rolePrompt: 'You are a translator',
        commandPrompt: 'Translate hello',
        onMessage,
        onError,
        onFinished,
        onStatusCode,
        signal,
        ...overrides,
    }

    return { req, onMessage, onError, onFinished, onStatusCode }
}

const sentenceStructuredOutput: IMessageRequest['structuredOutput'] = {
    mode: 'sentence',
    schemaName: 'sentence_translation',
    strict: true,
    schema: {
        type: 'object',
        properties: {
            translatedText: { type: 'string' },
        },
        required: ['translatedText'],
        additionalProperties: false,
    },
}

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

describe('protocol engines', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('streams OpenAI Chat Completions deltas and finishes on DONE', async () => {
        const engine = new OpenAIChatEngine(providerConfig)
        const { req, onMessage, onFinished } = createRequest()

        vi.mocked(fetchSSE).mockImplementationOnce(async (input: string, options: MockFetchSSEOptions) => {
            expect(input).toBe('https://api.openai.com/v1/chat/completions')
            expect(JSON.parse(options.body as string)).toEqual({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: 'You are a translator\n\nTranslate hello' }],
                stream: true,
            })
            expect(options.headers).toMatchObject({ Authorization: 'Bearer sk-test' })

            await options.onMessage(JSON.stringify({ choices: [{ delta: { content: '你', role: 'assistant' } }] }))
            await options.onMessage(JSON.stringify({ choices: [] }))
            await options.onMessage(' [DONE] ')
        })

        await engine.sendMessage(req)

        expect(onMessage).toHaveBeenCalledWith({ content: '你', role: 'assistant' })
        expect(onFinished).toHaveBeenCalledWith('stop')
    })

    it('uses OpenAI Chat strict schema response_format and emits only formatted text', async () => {
        const engine = new OpenAIChatEngine(providerConfig)
        const { req, onMessage, onFinished } = createRequest(undefined, {
            structuredOutput: sentenceStructuredOutput,
        })

        vi.mocked(fetchSSE).mockImplementationOnce(async (_input: string, options: MockFetchSSEOptions) => {
            expect(JSON.parse(options.body as string)).toMatchObject({
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'sentence_translation',
                        strict: true,
                        schema: sentenceStructuredOutput.schema,
                    },
                },
            })

            await options.onMessage(
                JSON.stringify({ choices: [{ delta: { content: '{"translatedText":"' }, finish_reason: null }] })
            )
            await options.onMessage(
                JSON.stringify({ choices: [{ delta: { content: '你好"}' }, finish_reason: null }] })
            )
            await options.onMessage(JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }))
        })

        await engine.sendMessage(req)

        expect(onMessage).toHaveBeenCalledTimes(1)
        expect(onMessage).toHaveBeenCalledWith({ content: '你好', role: 'assistant', isFullText: true })
        expect(onFinished).toHaveBeenCalledWith('stop')
    })

    it('uses OpenAI Chat JSON object response_format when strict schema is off', async () => {
        const engine = new OpenAIChatEngine(providerConfig)
        const { req } = createRequest(undefined, {
            structuredOutput: { ...sentenceStructuredOutput, strict: false },
        })

        vi.mocked(fetchSSE).mockImplementationOnce(async (_input: string, options: MockFetchSSEOptions) => {
            expect(JSON.parse(options.body as string)).toMatchObject({
                response_format: { type: 'json_object' },
            })
            await options.onMessage(JSON.stringify({ choices: [{ delta: { content: '{"translatedText":"你好"}' } }] }))
            await options.onMessage(' [DONE] ')
        })

        await engine.sendMessage(req)
    })

    it('streams OpenAI Responses deltas and finishes on completed', async () => {
        const engine = new OpenAIResponsesEngine({ ...providerConfig, protocol: 'openai-responses' })
        const { req, onMessage, onFinished } = createRequest()

        vi.mocked(fetchSSE).mockImplementationOnce(async (input: string, options: MockFetchSSEOptions) => {
            expect(input).toBe('https://api.openai.com/v1/responses')
            expect(JSON.parse(options.body as string)).toEqual({
                model: 'gpt-4o-mini',
                input: 'Translate hello',
                instructions: 'You are a translator',
                stream: true,
            })

            await options.onMessage(JSON.stringify({ type: 'response.output_text.delta', delta: '好' }))
            await options.onMessage(JSON.stringify({ type: 'response.completed' }))
        })

        await engine.sendMessage(req)

        expect(onMessage).toHaveBeenCalledWith({ content: '好', role: 'assistant' })
        expect(onFinished).toHaveBeenCalledWith('stop')
    })

    it('uses OpenAI Responses text.format and emits only formatted text', async () => {
        const engine = new OpenAIResponsesEngine({ ...providerConfig, protocol: 'openai-responses' })
        const { req, onMessage, onFinished } = createRequest(undefined, {
            structuredOutput: sentenceStructuredOutput,
        })

        vi.mocked(fetchSSE).mockImplementationOnce(async (_input: string, options: MockFetchSSEOptions) => {
            expect(JSON.parse(options.body as string)).toMatchObject({
                text: {
                    format: {
                        type: 'json_schema',
                        name: 'sentence_translation',
                        strict: true,
                        schema: sentenceStructuredOutput.schema,
                    },
                },
            })

            await options.onMessage(
                JSON.stringify({ type: 'response.output_text.delta', delta: '{"translatedText":"' })
            )
            await options.onMessage(JSON.stringify({ type: 'response.output_text.delta', delta: '你好"}' }))
            await options.onMessage(JSON.stringify({ type: 'response.completed' }))
        })

        await engine.sendMessage(req)

        expect(onMessage).toHaveBeenCalledWith({ content: '你好', role: 'assistant', isFullText: true })
        expect(onFinished).toHaveBeenCalledWith('stop')
    })

    it('uses OpenAI Responses JSON object text.format when strict schema is off', async () => {
        const engine = new OpenAIResponsesEngine({ ...providerConfig, protocol: 'openai-responses' })
        const { req } = createRequest(undefined, {
            structuredOutput: { ...sentenceStructuredOutput, strict: false },
        })

        vi.mocked(fetchSSE).mockImplementationOnce(async (_input: string, options: MockFetchSSEOptions) => {
            expect(JSON.parse(options.body as string)).toMatchObject({
                text: { format: { type: 'json_object' } },
            })
            await options.onMessage(
                JSON.stringify({ type: 'response.output_text.delta', delta: '{"translatedText":"你好"}' })
            )
            await options.onMessage(JSON.stringify({ type: 'response.completed' }))
        })

        await engine.sendMessage(req)
    })

    it('streams Anthropic text deltas and ignores ping events', async () => {
        const engine = new AnthropicEngine({ ...providerConfig, protocol: 'anthropic', model: 'claude-sonnet-4-6' })
        const { req, onMessage, onFinished } = createRequest()

        vi.mocked(fetchSSE).mockImplementationOnce(async (input: string, options: MockFetchSSEOptions) => {
            expect(input).toBe('https://api.anthropic.com/v1/messages')
            expect(options.headers).toMatchObject({
                'x-api-key': 'sk-test',
                'anthropic-version': '2023-06-01',
            })
            expect(JSON.parse(options.body as string)).toEqual({
                model: 'claude-sonnet-4-6',
                ['max_tokens']: 4096,
                messages: [{ role: 'user', content: 'You are a translator\n\nTranslate hello' }],
                stream: true,
            })

            await options.onMessage(JSON.stringify({ type: 'ping' }))
            await options.onMessage(
                JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: '好' } })
            )
            await options.onMessage(JSON.stringify({ type: 'message_stop' }))
        })

        await engine.sendMessage(req)

        expect(onMessage).toHaveBeenCalledWith({ content: '好', role: 'assistant' })
        expect(onFinished).toHaveBeenCalledWith('stop')
    })

    it.each<ProtocolThinkingFilterCase>([
        [
            'OpenAI Chat',
            () => new OpenAIChatEngine(providerConfig),
            async (options: MockFetchSSEOptions) => {
                await options.onMessage(JSON.stringify({ choices: [{ delta: { content: '<thi' } }] }))
                await options.onMessage(
                    JSON.stringify({ choices: [{ delta: { content: 'nking>hidden</thinking>ok' } }] })
                )
                await options.onMessage(' [DONE] ')
            },
        ],
        [
            'OpenAI Responses',
            () => new OpenAIResponsesEngine({ ...providerConfig, protocol: 'openai-responses' }),
            async (options: MockFetchSSEOptions) => {
                await options.onMessage(JSON.stringify({ type: 'response.output_text.delta', delta: '<thi' }))
                await options.onMessage(
                    JSON.stringify({ type: 'response.output_text.delta', delta: 'nking>hidden</thinking>ok' })
                )
                await options.onMessage(JSON.stringify({ type: 'response.completed' }))
            },
        ],
        [
            'Anthropic',
            () => new AnthropicEngine({ ...providerConfig, protocol: 'anthropic', model: 'claude-sonnet-4-6' }),
            async (options: MockFetchSSEOptions) => {
                await options.onMessage(
                    JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: '<thi' } })
                )
                await options.onMessage(
                    JSON.stringify({
                        type: 'content_block_delta',
                        delta: { type: 'text_delta', text: 'nking>hidden</thinking>ok' },
                    })
                )
                await options.onMessage(JSON.stringify({ type: 'message_stop' }))
            },
        ],
    ])('filters legacy thinking XML before emitting text deltas for %s', async (_name, createEngine, sendMessages) => {
        const { req, onMessage, onFinished } = createRequest()

        vi.mocked(fetchSSE).mockImplementationOnce(async (_input: string, options: MockFetchSSEOptions) => {
            await sendMessages(options)
        })

        await createEngine().sendMessage(req)

        expect(onMessage).toHaveBeenCalledTimes(1)
        expect(onMessage).toHaveBeenCalledWith({ content: 'ok', role: 'assistant' })
        expect(onFinished).toHaveBeenCalledWith('stop')
    })

    it('uses Anthropic output_config.format and emits only formatted text', async () => {
        const engine = new AnthropicEngine({ ...providerConfig, protocol: 'anthropic', model: 'claude-sonnet-4-6' })
        const { req, onMessage, onFinished } = createRequest(undefined, {
            structuredOutput: { ...sentenceStructuredOutput, strict: false },
        })

        vi.mocked(fetchSSE).mockImplementationOnce(async (_input: string, options: MockFetchSSEOptions) => {
            expect(JSON.parse(options.body as string)).toMatchObject({
                output_config: {
                    format: {
                        type: 'json_schema',
                        schema: sentenceStructuredOutput.schema,
                    },
                },
            })

            await options.onMessage(
                JSON.stringify({
                    type: 'content_block_delta',
                    delta: { type: 'text_delta', text: '{"translatedText":"' },
                })
            )
            await options.onMessage(
                JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: '你好"}' } })
            )
            await options.onMessage(JSON.stringify({ type: 'message_stop' }))
        })

        await engine.sendMessage(req)

        expect(onMessage).toHaveBeenCalledWith({ content: '你好', role: 'assistant', isFullText: true })
        expect(onFinished).toHaveBeenCalledWith('stop')
    })

    it('reports OpenAI Chat refusals without treating finish_reason stop as success', async () => {
        const engine = new OpenAIChatEngine(providerConfig)
        const { req, onError, onFinished } = createRequest()

        vi.mocked(fetchSSE).mockImplementationOnce(async (_input: string, options: MockFetchSSEOptions) => {
            await options.onMessage(
                JSON.stringify({ choices: [{ message: { refusal: 'refused' }, finish_reason: 'stop' }] })
            )
        })

        await engine.sendMessage(req)

        expect(onError).toHaveBeenCalledWith('refused')
        expect(onFinished).toHaveBeenCalledWith('error')
    })

    it('reports OpenAI Responses refusals', async () => {
        const engine = new OpenAIResponsesEngine({ ...providerConfig, protocol: 'openai-responses' })
        const { req, onError, onFinished } = createRequest()

        vi.mocked(fetchSSE).mockImplementationOnce(async (_input: string, options: MockFetchSSEOptions) => {
            await options.onMessage(JSON.stringify({ type: 'response.refusal.delta', delta: 'refused' }))
            await options.onMessage(JSON.stringify({ type: 'response.completed' }))
        })

        await engine.sendMessage(req)

        expect(onError).toHaveBeenCalledWith('refused')
        expect(onFinished).toHaveBeenCalledWith('error')
    })

    it('reports Anthropic refusals', async () => {
        const engine = new AnthropicEngine({ ...providerConfig, protocol: 'anthropic', model: 'claude-sonnet-4-6' })
        const { req, onError, onFinished } = createRequest()

        vi.mocked(fetchSSE).mockImplementationOnce(async (_input: string, options: MockFetchSSEOptions) => {
            await options.onMessage(JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'refusal' } }))
        })

        await engine.sendMessage(req)

        expect(onError).toHaveBeenCalledWith('The model refused to answer.')
        expect(onFinished).toHaveBeenCalledWith('error')
    })

    it.each([
        ['OpenAI Chat', () => new OpenAIChatEngine(providerConfig)],
        ['OpenAI Responses', () => new OpenAIResponsesEngine({ ...providerConfig, protocol: 'openai-responses' })],
        ['Anthropic', () => new AnthropicEngine({ ...providerConfig, protocol: 'anthropic' })],
    ])('reports 4xx errors for %s', async (_name, createEngine) => {
        const { req, onError, onFinished, onStatusCode } = createRequest()

        vi.mocked(fetchSSE).mockImplementationOnce(async (_input: string, options: MockFetchSSEOptions) => {
            options.onStatusCode?.(401)
            options.onError({ error: { message: 'bad key' } })
        })

        await createEngine().sendMessage(req)

        expect(onStatusCode).toHaveBeenCalledWith(401)
        expect(onError).toHaveBeenCalledWith('bad key')
        expect(onFinished).toHaveBeenCalledWith('error')
    })

    it.each([
        ['OpenAI Chat', () => new OpenAIChatEngine(providerConfig)],
        ['OpenAI Responses', () => new OpenAIResponsesEngine({ ...providerConfig, protocol: 'openai-responses' })],
        ['Anthropic', () => new AnthropicEngine({ ...providerConfig, protocol: 'anthropic' })],
    ])('reports 5xx errors for %s', async (_name, createEngine) => {
        const { req, onError, onFinished, onStatusCode } = createRequest()

        vi.mocked(fetchSSE).mockImplementationOnce(async (_input: string, options: MockFetchSSEOptions) => {
            options.onStatusCode?.(500)
            options.onError({ message: 'upstream unavailable' })
        })

        await createEngine().sendMessage(req)

        expect(onStatusCode).toHaveBeenCalledWith(500)
        expect(onError).toHaveBeenCalledWith('upstream unavailable')
        expect(onFinished).toHaveBeenCalledWith('error')
    })

    it.each([
        ['OpenAI Chat', () => new OpenAIChatEngine(providerConfig)],
        ['OpenAI Responses', () => new OpenAIResponsesEngine({ ...providerConfig, protocol: 'openai-responses' })],
        ['Anthropic', () => new AnthropicEngine({ ...providerConfig, protocol: 'anthropic' })],
    ])('reports network interruption for %s', async (_name, createEngine) => {
        const { req, onError, onFinished } = createRequest()

        vi.mocked(fetchSSE).mockRejectedValueOnce(new Error('network down'))

        await createEngine().sendMessage(req)

        expect(onError).toHaveBeenCalledWith('network down')
        expect(onFinished).toHaveBeenCalledWith('error')
    })

    it.each([
        ['OpenAI Chat', () => new OpenAIChatEngine(providerConfig)],
        ['OpenAI Responses', () => new OpenAIResponsesEngine({ ...providerConfig, protocol: 'openai-responses' })],
        ['Anthropic', () => new AnthropicEngine({ ...providerConfig, protocol: 'anthropic' })],
    ])('finishes as aborted for %s', async (_name, createEngine) => {
        const controller = new AbortController()
        const { req, onError, onFinished } = createRequest(controller.signal)
        controller.abort()

        vi.mocked(fetchSSE).mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'))

        await createEngine().sendMessage(req)

        expect(onError).not.toHaveBeenCalled()
        expect(onFinished).toHaveBeenCalledWith('aborted')
    })
})

describe('structured output formatting', () => {
    it('formats word translation JSON without exposing raw JSON', () => {
        const result = formatStructuredOutput(
            'word',
            JSON.stringify({
                original_form: 'run',
                language: 'English',
                phonetics: 'rʌn',
                senses: [{ pos: 'verb', meaning: '跑' }],
                examples: [{ sentence: 'I run daily.', translation: '我每天跑步。' }],
                etymology: 'Old English rinnan.',
                correction_hint: null,
            })
        )

        expect(result).toContain('run')
        expect(result).toContain('[verb] 跑')
        expect(result).toContain('I run daily.(我每天跑步。)')
        expect(result).not.toContain('{')
        expect(result).not.toContain('}')
    })

    it('formats short phrase options without exposing raw JSON', () => {
        const result = formatStructuredOutput(
            'short-phrase-to-chinese',
            JSON.stringify({
                options: [
                    {
                        translation: '你好',
                        context_explanation: '问候语',
                        phonetics: 'ni hao',
                        part_of_speech: 'phrase',
                        examples: [{ sentence: 'Hi there.', translation: '你好。' }],
                    },
                    {
                        translation: '嗨',
                        context_explanation: '非正式问候',
                        phonetics: null,
                        part_of_speech: 'interjection',
                        examples: [],
                    },
                ],
            })
        )

        expect(result).toContain('1. 你好')
        expect(result).toContain('[phrase] 问候语')
        expect(result).toContain('2. 嗨')
        expect(result).not.toContain('{')
        expect(result).not.toContain('}')
    })
})

describe('protocol listModels', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('lists OpenAI Chat models', async () => {
        const fetcher = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'gpt-4o' }, { id: 'o3-mini' }] }))
        vi.mocked(getUniversalFetch).mockReturnValue(fetcher)

        await expect(listOpenAIChatModels(providerConfig)).resolves.toEqual(['gpt-4o', 'o3-mini'])
        expect(fetcher).toHaveBeenCalledWith(
            'https://api.openai.com/v1/models',
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
            })
        )
    })

    it('lists OpenAI Responses models through the same models endpoint', async () => {
        const fetcher = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'gpt-5-nano' }] }))
        vi.mocked(getUniversalFetch).mockReturnValue(fetcher)

        await expect(listOpenAIResponsesModels({ ...providerConfig, protocol: 'openai-responses' })).resolves.toEqual([
            'gpt-5-nano',
        ])
    })

    it('lists Anthropic models', async () => {
        const fetcher = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'claude-sonnet-4-6' }] }))
        vi.mocked(getUniversalFetch).mockReturnValue(fetcher)

        await expect(listAnthropicModels({ ...providerConfig, protocol: 'anthropic' })).resolves.toEqual([
            'claude-sonnet-4-6',
        ])
        expect(fetcher).toHaveBeenCalledWith(
            'https://api.anthropic.com/v1/models',
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({ 'x-api-key': 'sk-test', 'anthropic-version': '2023-06-01' }),
            })
        )
    })

    it('returns an empty list for missing model data', async () => {
        const fetcher = vi.fn().mockResolvedValue(jsonResponse({ object: 'list' }))
        vi.mocked(getUniversalFetch).mockReturnValue(fetcher)

        await expect(listOpenAIChatModels(providerConfig)).resolves.toEqual([])
    })

    it('returns an empty list for 404 and 405 model endpoints', async () => {
        const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse({ error: 'missing' }, 404))
        vi.mocked(getUniversalFetch).mockReturnValue(fetcher)

        await expect(listOpenAIChatModels(providerConfig)).resolves.toEqual([])

        fetcher.mockResolvedValueOnce(jsonResponse({ error: 'method' }, 405))
        await expect(listAnthropicModels({ ...providerConfig, protocol: 'anthropic' })).resolves.toEqual([])
    })

    it('returns an empty list for model endpoint timeouts', async () => {
        const fetcher = vi.fn().mockRejectedValue(new DOMException('Timeout', 'TimeoutError'))
        vi.mocked(getUniversalFetch).mockReturnValue(fetcher)

        await expect(listOpenAIChatModels(providerConfig)).resolves.toEqual([])
    })
})
