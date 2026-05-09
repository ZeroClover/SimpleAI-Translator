import { ProviderConfig } from '../../types'
import { getUniversalFetch } from '../../universal-fetch'
import { ANTHROPIC_MESSAGES_API_PATH, normalizeAPIEndpoint } from '../../openai-api-path'
import { fetchSSE } from '../../utils'
import { formatStructuredOutput, IEngine, IMessageRequest, IModel, StructuredOutputRequest } from '../interfaces'

/* eslint-disable camelcase */

const DEFAULT_ENDPOINT = 'https://api.anthropic.com'
const MODELS_PATH = '/v1/models'

function getHeaders(providerConfig: ProviderConfig): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': providerConfig.apiKey,
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
    constructor(private readonly providerConfig: ProviderConfig) {}

    async listModels(): Promise<IModel[]> {
        return (await listModels(this.providerConfig)).map((id) => ({ id, name: id }))
    }

    async sendMessage(req: IMessageRequest): Promise<void> {
        const url = normalizeAPIEndpoint(this.providerConfig.endpoint, ANTHROPIC_MESSAGES_API_PATH, DEFAULT_ENDPOINT)
        let finished = false
        let hasError = false
        let structuredContent = ''
        let structuredContentEmitted = false

        const emitStructuredContent = async () => {
            if (!req.structuredOutput || structuredContentEmitted) {
                return
            }
            structuredContentEmitted = true
            await req.onMessage({
                content: formatStructuredOutput(req.structuredOutput.mode, structuredContent),
                role: 'assistant',
                isFullText: true,
            })
        }

        try {
            const outputConfig = getOutputConfig(req.structuredOutput)
            await fetchSSE(url, {
                method: 'POST',
                headers: getHeaders(this.providerConfig),
                body: JSON.stringify({
                    model: this.providerConfig.model,
                    ['max_tokens']: 4096,
                    messages: [{ role: 'user', content: getPrompt(req) }],
                    ...(outputConfig ? { output_config: outputConfig } : {}),
                    stream: true,
                }),
                signal: req.signal,
                onMessage: async (message) => {
                    if (finished) return
                    const resp = JSON.parse(message)
                    const type = resp?.type
                    const stopReason = resp?.delta?.stop_reason ?? resp?.message?.stop_reason ?? resp?.stop_reason
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
                                structuredContent += text
                                return
                            }
                            await req.onMessage({ content: text, role: 'assistant' })
                        }
                        return
                    }
                    if (type === 'message_stop') {
                        await emitStructuredContent()
                        finished = true
                        req.onFinished('stop')
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
