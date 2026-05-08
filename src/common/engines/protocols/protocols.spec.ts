import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProviderConfig } from '../../types'
import { fetchSSE } from '../../utils'
import { getUniversalFetch } from '../../universal-fetch'
import { IMessageRequest } from '../interfaces'
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

const providerConfig: ProviderConfig = {
    id: 'provider-1',
    name: 'Provider',
    protocol: 'openai-chat',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
}

function createRequest(signal = new AbortController().signal) {
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
    }

    return { req, onMessage, onError, onFinished, onStatusCode }
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
