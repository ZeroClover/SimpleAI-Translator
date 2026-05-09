import { ProviderConfig } from '../../types'
import { getUniversalFetch } from '../../universal-fetch'
import { fetchSSE } from '../../utils'
import { normalizeAPIEndpoint, OPENAI_CHAT_COMPLETIONS_API_PATH } from '../../openai-api-path'
import { formatStructuredOutput, IEngine, IMessageRequest, IModel, StructuredOutputRequest } from '../interfaces'
import { ThinkingFilter } from '../thinking-filter'

/* eslint-disable camelcase */

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1'
const MODELS_PATH = '/v1/models'

function getHeaders(providerConfig: ProviderConfig): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${providerConfig.apiKey}`,
        ...providerConfig.extraHeaders,
    }
}

function getPrompt(req: IMessageRequest): string {
    return req.rolePrompt ? `${req.rolePrompt}\n\n${req.commandPrompt}` : req.commandPrompt
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message
    }
    if (typeof error === 'string') {
        return error
    }
    if (typeof error === 'object' && error !== null) {
        const err = error as { error?: { message?: string }; message?: string; detail?: string }
        return err.error?.message ?? err.message ?? err.detail ?? 'Unknown error'
    }
    return 'Unknown error'
}

function isAbort(req: IMessageRequest, error: unknown): boolean {
    return req.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
}

function getResponseFormat(structuredOutput: StructuredOutputRequest | undefined) {
    if (!structuredOutput) {
        return undefined
    }
    if (!structuredOutput.strict) {
        return { type: 'json_object' }
    }
    return {
        type: 'json_schema',
        json_schema: {
            name: structuredOutput.schemaName,
            strict: true,
            schema: structuredOutput.schema,
        },
    }
}

function getReasoningEffort(providerConfig: ProviderConfig) {
    if (providerConfig.thinkingEnabled !== true) {
        return undefined
    }
    return providerConfig.openaiReasoningEffort ?? 'medium'
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

export class OpenAIChatEngine implements IEngine {
    constructor(private readonly providerConfig: ProviderConfig) {}

    async listModels(): Promise<IModel[]> {
        return (await listModels(this.providerConfig)).map((id) => ({ id, name: id }))
    }

    async sendMessage(req: IMessageRequest): Promise<void> {
        const url = normalizeAPIEndpoint(
            this.providerConfig.endpoint,
            OPENAI_CHAT_COMPLETIONS_API_PATH,
            DEFAULT_ENDPOINT
        )
        let finished = false
        let hasError = false
        let structuredContent = ''
        let structuredContentEmitted = false
        const thinkingFilter = new ThinkingFilter()

        const emitStructuredContent = async () => {
            if (!req.structuredOutput || structuredContentEmitted) {
                return
            }
            structuredContentEmitted = true
            structuredContent += thinkingFilter.finish()
            await req.onMessage({
                content: formatStructuredOutput(req.structuredOutput.mode, structuredContent),
                role: 'assistant',
                isFullText: true,
            })
        }

        const emitText = async (content: string, role = 'assistant') => {
            const filtered = thinkingFilter.push(content)
            if (filtered) {
                await req.onMessage({ content: filtered, role })
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
            const responseFormat = getResponseFormat(req.structuredOutput)
            const reasoningEffort = getReasoningEffort(this.providerConfig)
            await fetchSSE(url, {
                method: 'POST',
                headers: getHeaders(this.providerConfig),
                body: JSON.stringify({
                    model: this.providerConfig.model,
                    messages: [{ role: 'user', content: getPrompt(req) }],
                    stream: true,
                    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
                    ...(responseFormat ? { response_format: responseFormat } : {}),
                }),
                signal: req.signal,
                onMessage: async (message) => {
                    if (finished) return
                    if (message.trim() === '[DONE]') {
                        await emitStructuredContent()
                        await emitRemainingText()
                        finished = true
                        req.onFinished('stop')
                        return
                    }

                    const resp = JSON.parse(message)
                    const choices = resp?.choices
                    if (!Array.isArray(choices) || choices.length === 0) {
                        return
                    }
                    const choice = choices[0]
                    const refusal = choice?.message?.refusal ?? choice?.delta?.refusal
                    if (refusal) {
                        hasError = true
                        finished = true
                        req.onError(typeof refusal === 'string' ? refusal : 'The model refused to answer.')
                        req.onFinished('error')
                        return
                    }
                    const finishReason = choice?.finish_reason
                    if (finishReason) {
                        await emitStructuredContent()
                        await emitRemainingText()
                        finished = true
                        req.onFinished(finishReason)
                        return
                    }
                    const content = choice?.delta?.content
                    if (content) {
                        if (req.structuredOutput) {
                            structuredContent += thinkingFilter.push(content)
                            return
                        }
                        await emitText(content, choice?.delta?.role ?? 'assistant')
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
