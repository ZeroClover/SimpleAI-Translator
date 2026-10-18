import { ProviderConfig, ReasoningEffort, ThinkingControl } from '../../types'
import { getUniversalFetch } from '../../universal-fetch'
import { ANTHROPIC_MESSAGES_API_PATH, normalizeAPIEndpoint } from '../../openai-api-path'
import {
    EngineSession,
    IEngine,
    IMessageRequest,
    IModel,
    sendProtocolRequest,
    StructuredOutputRequest,
} from '../interfaces'

/* eslint-disable camelcase */

const DEFAULT_ENDPOINT = 'https://api.anthropic.com'
const MODELS_PATH = '/v1/models'
// Maximum page size accepted by the Models API.
const MODELS_PAGE_LIMIT = 1000
// Covers every model on the no-thinking and manual-thinking paths: Opus 4 caps
// output at 32K, everything newer at 64K or more.
const DEFAULT_MAX_TOKENS = 32000
const ADAPTIVE_MAX_TOKENS = 64000
type EngineProviderConfig = ProviderConfig & ThinkingControl

function getHeaders(providerConfig: ProviderConfig): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': providerConfig.apiKey,
        ...providerConfig.extraHeaders,
    }
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message
    }
    if (typeof error === 'string') {
        return error
    }
    if (typeof error === 'object' && error !== null) {
        const err = error as { error?: { message?: string }; message?: string }
        return err.error?.message ?? err.message ?? 'Unknown error'
    }
    return 'Unknown error'
}

// Anthropic structured outputs reject array-size constraints; item counts are
// enforced client-side by the structured output formatter instead.
function stripArrayConstraints(schema: unknown): unknown {
    if (Array.isArray(schema)) {
        return schema.map(stripArrayConstraints)
    }
    if (typeof schema !== 'object' || schema === null) {
        return schema
    }
    return Object.fromEntries(
        Object.entries(schema)
            .filter(([key]) => key !== 'minItems' && key !== 'maxItems')
            .map(([key, value]) => [key, stripArrayConstraints(value)])
    )
}

function getOutputConfig(structuredOutput: StructuredOutputRequest | undefined) {
    if (!structuredOutput) {
        return undefined
    }
    return {
        format: {
            type: 'json_schema',
            schema: stripArrayConstraints(structuredOutput.schema),
        },
    }
}

// Model patterns match anywhere in the ID so gateway forms such as
// `anthropic/claude-sonnet-4.5`, `us.anthropic.claude-...`, and `claude-...@date` resolve too.
// budget_tokens is accepted only by Haiku 4.5, Sonnet/Opus 4.5, and Sonnet/Opus 4;
// newer models use adaptive thinking and reject budget_tokens with a 400.
const MANUAL_THINKING_MODEL = /claude-(?:haiku-4-5|sonnet-4-5|opus-4-5|(?:sonnet|opus)-4(?:-0|-\d{8}|@|$))/
// These models think even when the thinking parameter is omitted, so "off" means
// lowest effort rather than no thinking.
const ALWAYS_THINKING_MODEL = /claude-(?:opus|sonnet|fable|mythos)-5/
// thinking.display arrived with Opus 4.7; the 4.6 models adapt without it.
const NO_DISPLAY_ADAPTIVE_MODEL = /claude-(?:opus|sonnet)-4-6/

function normalizeModelId(model: string): string {
    return model.toLowerCase().replace(/\./g, '-')
}

// Each budget leaves most of DEFAULT_MAX_TOKENS for the translation itself.
const MANUAL_BUDGET_BY_EFFORT: Record<ReasoningEffort, number> = {
    low: 1024,
    medium: 4096,
    high: 16000,
}

function getThinkingRequest(providerConfig: EngineProviderConfig) {
    const model = normalizeModelId(providerConfig.model)
    if (providerConfig.thinkingEnabled !== true) {
        if (ALWAYS_THINKING_MODEL.test(model)) {
            return {
                maxTokens: ADAPTIVE_MAX_TOKENS,
                outputEffort: 'low',
            }
        }
        return {
            maxTokens: DEFAULT_MAX_TOKENS,
        }
    }

    const effort = providerConfig.reasoningEffort ?? 'medium'
    if (!MANUAL_THINKING_MODEL.test(model)) {
        return {
            maxTokens: ADAPTIVE_MAX_TOKENS,
            thinking: NO_DISPLAY_ADAPTIVE_MODEL.test(model)
                ? { type: 'adaptive' }
                : { type: 'adaptive', display: 'omitted' },
            outputEffort: effort,
        }
    }

    return {
        maxTokens: DEFAULT_MAX_TOKENS,
        thinking: {
            type: 'enabled',
            budget_tokens: MANUAL_BUDGET_BY_EFFORT[effort],
        },
    }
}

function getRefusalMessage(resp: unknown): string {
    const data = resp as {
        delta?: { stop_details?: { explanation?: unknown; category?: unknown } | null }
        message?: { stop_details?: { explanation?: unknown; category?: unknown } | null }
    }
    const details = data.delta?.stop_details ?? data.message?.stop_details
    if (typeof details?.explanation === 'string' && details.explanation) {
        return `The model refused to answer: ${details.explanation}`
    }
    if (typeof details?.category === 'string' && details.category) {
        return `The model refused to answer (${details.category}).`
    }
    return 'The model refused to answer.'
}

export async function listModels(providerConfig: ProviderConfig): Promise<string[]> {
    try {
        const fetcher = getUniversalFetch()
        // One deadline for the whole listing, across all pages.
        const signal = AbortSignal.timeout(15000)
        const ids: string[] = []
        let afterId: string | undefined
        for (;;) {
            const url = new URL(normalizeAPIEndpoint(providerConfig.endpoint, MODELS_PATH, DEFAULT_ENDPOINT))
            url.searchParams.set('limit', String(MODELS_PAGE_LIMIT))
            if (afterId) {
                url.searchParams.set('after_id', afterId)
            }
            const resp = await fetcher(url.toString(), {
                method: 'GET',
                headers: getHeaders(providerConfig),
                signal,
            })
            if (!resp.ok) {
                return []
            }
            const data = await resp.json()
            if (!Array.isArray(data?.data)) {
                return []
            }
            ids.push(
                ...data.data
                    .map((model: { id?: unknown }) => model.id)
                    .filter((id: unknown): id is string => typeof id === 'string')
            )
            const lastId = data.last_id
            if (data.has_more !== true || typeof lastId !== 'string' || !lastId || lastId === afterId) {
                return ids
            }
            afterId = lastId
        }
    } catch {
        return []
    }
}

export class AnthropicEngine implements IEngine {
    constructor(private readonly providerConfig: EngineProviderConfig) {}

    async listModels(): Promise<IModel[]> {
        return (await listModels(this.providerConfig)).map((id) => ({ id, name: id }))
    }

    async sendMessage(req: IMessageRequest): Promise<void> {
        const session = new EngineSession(req, getErrorMessage)
        let lastStopReason: string | null = null

        const outputConfig = getOutputConfig(req.structuredOutput)
        const thinkingRequest = getThinkingRequest(this.providerConfig)
        await sendProtocolRequest(session, {
            url: normalizeAPIEndpoint(this.providerConfig.endpoint, ANTHROPIC_MESSAGES_API_PATH, DEFAULT_ENDPOINT),
            headers: getHeaders(this.providerConfig),
            body: {
                model: this.providerConfig.model,
                ['max_tokens']: thinkingRequest.maxTokens,
                ...(req.rolePrompt ? { system: req.rolePrompt } : {}),
                messages: [{ role: 'user', content: req.commandPrompt }],
                ...(thinkingRequest.thinking ? { thinking: thinkingRequest.thinking } : {}),
                ...(outputConfig || thinkingRequest.outputEffort
                    ? {
                          output_config: {
                              ...outputConfig,
                              ...(thinkingRequest.outputEffort ? { effort: thinkingRequest.outputEffort } : {}),
                          },
                      }
                    : {}),
            },
            onEvent: async (message) => {
                const resp = JSON.parse(message)
                const type = resp?.type
                if (type === 'error') {
                    session.streamFailed(resp)
                    return
                }
                if (type === 'content_block_start' || type === 'content_block_delta') {
                    session.markContent()
                }
                const stopReason = resp?.delta?.stop_reason ?? resp?.message?.stop_reason ?? resp?.stop_reason
                if (stopReason) {
                    lastStopReason = stopReason
                }
                if (stopReason === 'refusal') {
                    session.fail(getRefusalMessage(resp))
                    return
                }

                if (type === 'content_block_delta' && resp?.delta?.type === 'text_delta') {
                    const text = resp?.delta?.text
                    if (text) {
                        await session.text(text)
                    }
                    return
                }
                // thinking_delta, signature_delta, thinking block boundaries, ping and unknown
                // events carry no translation text.
                if (type === 'message_stop') {
                    await session.complete(lastStopReason === 'max_tokens' ? 'max_tokens' : 'stop')
                }
            },
            onResponse: async (data) => {
                const resp = data as {
                    type?: unknown
                    error?: unknown
                    content?: unknown
                    stop_reason?: unknown
                    stop_details?: unknown
                }
                if (resp?.type === 'error' || resp?.error) {
                    session.failWith(resp)
                    return
                }
                if (!Array.isArray(resp?.content)) {
                    session.fail('The response does not contain Anthropic message content.')
                    return
                }
                if (resp.stop_reason === 'refusal') {
                    session.fail(getRefusalMessage({ message: resp }))
                    return
                }
                const text = (resp.content as Array<{ type?: unknown; text?: unknown }>)
                    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
                    .map((block) => block.text)
                    .join('')
                await session.completeResponse(text, resp.stop_reason === 'max_tokens' ? 'max_tokens' : 'stop')
            },
            // Some compatible endpoints close the stream without message_stop.
            onEnd: () => session.complete(lastStopReason === 'max_tokens' ? 'max_tokens' : 'stop'),
        })
    }
}
