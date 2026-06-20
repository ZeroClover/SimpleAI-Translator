import { AnthropicThinkingEffort, ProviderConfig, ThinkingControl } from '../../types'
import { getUniversalFetch } from '../../universal-fetch'
import { ANTHROPIC_MESSAGES_API_PATH, normalizeAPIEndpoint } from '../../openai-api-path'
import { fetchSSE } from '../../utils'
import { formatStructuredOutput, IEngine, IMessageRequest, IModel, StructuredOutputRequest } from '../interfaces'
import { ThinkingFilter } from '../thinking-filter'

/* eslint-disable camelcase */

const DEFAULT_ENDPOINT = 'https://api.anthropic.com'
const MODELS_PATH = '/v1/models'
const DEFAULT_MAX_TOKENS = 4096
const THINKING_MAX_TOKENS = 64000
const MANUAL_MAX_TOKENS = 128000
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

function isAbort(req: IMessageRequest, error: unknown): boolean {
    return req.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
}

function getOutputConfig(structuredOutput: StructuredOutputRequest | undefined) {
    if (!structuredOutput) {
        return undefined
    }
    return {
        format: {
            type: 'json_schema',
            schema: structuredOutput.schema,
        },
    }
}

function isAdaptiveThinkingModel(model: string): boolean {
    const id = model.toLowerCase()
    return (
        id.startsWith('claude-opus-4-7') ||
        id.startsWith('claude-opus-4-6') ||
        id.startsWith('claude-sonnet-4-6') ||
        id.startsWith('claude-mythos-preview')
    )
}

function getAdaptiveEffort(model: string, effort: AnthropicThinkingEffort) {
    if (effort === 'xhigh' && !model.toLowerCase().startsWith('claude-opus-4-7')) {
        return 'high'
    }
    return effort
}

function getManualBudget(effort: AnthropicThinkingEffort, maxTokens: number): number {
    const budgetByEffort: Record<Exclude<AnthropicThinkingEffort, 'max'>, number> = {
        low: 1024,
        medium: 4096,
        high: 16384,
        xhigh: 32768,
    }
    const targetBudget = effort === 'max' ? THINKING_MAX_TOKENS : budgetByEffort[effort]
    return Math.max(1024, Math.min(targetBudget, maxTokens - 1))
}

function getThinkingRequest(providerConfig: EngineProviderConfig) {
    if (providerConfig.thinkingEnabled !== true) {
        return {
            maxTokens: DEFAULT_MAX_TOKENS,
        }
    }

    const effort = providerConfig.anthropicThinkingEffort ?? 'high'
    if (isAdaptiveThinkingModel(providerConfig.model)) {
        return {
            maxTokens: THINKING_MAX_TOKENS,
            thinking: { type: 'adaptive', display: 'omitted' },
            outputEffort: getAdaptiveEffort(providerConfig.model, effort),
        }
    }

    const maxTokens = effort === 'max' ? MANUAL_MAX_TOKENS : THINKING_MAX_TOKENS
    return {
        maxTokens,
        thinking: {
            type: 'enabled',
            budget_tokens: getManualBudget(effort, maxTokens),
            display: 'omitted',
        },
    }
}

export async function listModels(providerConfig: ProviderConfig): Promise<string[]> {
    try {
        const fetcher = getUniversalFetch()
        const resp = await fetcher(normalizeAPIEndpoint(providerConfig.endpoint, MODELS_PATH, DEFAULT_ENDPOINT), {
            method: 'GET',
            headers: getHeaders(providerConfig),
            signal: AbortSignal.timeout(15000),
        })
        if (!resp.ok) {
            return []
        }
        const data = await resp.json()
        if (!Array.isArray(data?.data)) {
            return []
        }
        return data.data
            .map((model: { id?: unknown }) => model.id)
            .filter((id: unknown): id is string => typeof id === 'string')
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
        const url = normalizeAPIEndpoint(this.providerConfig.endpoint, ANTHROPIC_MESSAGES_API_PATH, DEFAULT_ENDPOINT)
        let finished = false
        let hasError = false
        let structuredContent = ''
        let structuredContentEmitted = false
        let lastStopReason: string | null = null
        const thinkingFilter = new ThinkingFilter()

        const emitStructuredContent = async (): Promise<boolean> => {
            if (!req.structuredOutput || structuredContentEmitted) {
                return true
            }
            structuredContentEmitted = true
            structuredContent += thinkingFilter.finish()
            let content: string
            try {
                content = formatStructuredOutput(req.structuredOutput.mode, structuredContent)
            } catch (error) {
                hasError = true
                finished = true
                req.onError(getErrorMessage(error))
                req.onFinished('error')
                return false
            }
            await req.onMessage({
                content,
                role: 'assistant',
                isFullText: true,
            })
            return true
        }

        const emitText = async (content: string) => {
            const filtered = thinkingFilter.push(content)
            if (filtered) {
                await req.onMessage({ content: filtered, role: 'assistant' })
            }
        }

        const emitRemainingText = async () => {
            if (req.structuredOutput) {
                return
            }
            const content = thinkingFilter.finish()
            if (content) {
                await req.onMessage({ content, role: 'assistant' })
            }
        }

        try {
            const outputConfig = getOutputConfig(req.structuredOutput)
            const thinkingRequest = getThinkingRequest(this.providerConfig)
            await fetchSSE(url, {
                method: 'POST',
                headers: getHeaders(this.providerConfig),
                body: JSON.stringify({
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
                    stream: true,
                }),
                signal: req.signal,
                onMessage: async (message) => {
                    if (finished) return
                    const resp = JSON.parse(message)
                    const type = resp?.type
                    const stopReason = resp?.delta?.stop_reason ?? resp?.message?.stop_reason ?? resp?.stop_reason
                    if (stopReason) {
                        lastStopReason = stopReason
                    }
                    if (stopReason === 'refusal') {
                        hasError = true
                        finished = true
                        req.onError('The model refused to answer.')
                        req.onFinished('error')
                        return
                    }

                    if (type === 'content_block_delta' && resp?.delta?.type === 'text_delta') {
                        const text = resp?.delta?.text
                        if (text) {
                            if (req.structuredOutput) {
                                structuredContent += thinkingFilter.push(text)
                                return
                            }
                            await emitText(text)
                        }
                        return
                    }
                    if (
                        type === 'content_block_delta' &&
                        (resp?.delta?.type === 'thinking_delta' || resp?.delta?.type === 'signature_delta')
                    ) {
                        return
                    }
                    if (
                        (type === 'content_block_start' || type === 'content_block_stop') &&
                        resp?.content_block?.type === 'thinking'
                    ) {
                        return
                    }
                    if (type === 'message_stop') {
                        if (!(await emitStructuredContent())) {
                            return
                        }
                        await emitRemainingText()
                        finished = true
                        req.onFinished(lastStopReason === 'max_tokens' ? 'max_tokens' : 'stop')
                        return
                    }
                    if (type === 'error') {
                        hasError = true
                        finished = true
                        req.onError(getErrorMessage(resp))
                        req.onFinished('error')
                    }
                },
                onError: (error) => {
                    hasError = true
                    req.onError(getErrorMessage(error))
                },
                onStatusCode: req.onStatusCode,
            })
        } catch (error) {
            if (isAbort(req, error)) {
                finished = true
                req.onFinished('aborted')
                return
            }
            hasError = true
            req.onError(getErrorMessage(error))
        }

        if (!finished && hasError) {
            req.onFinished('error')
        }
    }
}
