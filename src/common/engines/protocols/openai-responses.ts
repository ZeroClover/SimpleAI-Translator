import { ProviderConfig } from '../../types'
import { normalizeAPIEndpoint, OPENAI_RESPONSES_API_PATH } from '../../openai-api-path'
import { fetchSSE } from '../../utils'
import { IEngine, IMessageRequest, IModel } from '../interfaces'
import { listModels as listOpenAIModels } from './openai-chat'

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1'

function getHeaders(providerConfig: ProviderConfig): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${providerConfig.apiKey}`,
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
        const err = error as {
            error?: { message?: string }
            message?: string
            response?: { error?: { message?: string } }
        }
        return err.response?.error?.message ?? err.error?.message ?? err.message ?? 'Unknown error'
    }
    return 'Unknown error'
}

function isAbort(req: IMessageRequest, error: unknown): boolean {
    return req.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
}

export async function listModels(providerConfig: ProviderConfig): Promise<string[]> {
    return listOpenAIModels(providerConfig)
}

export class OpenAIResponsesEngine implements IEngine {
    constructor(private readonly providerConfig: ProviderConfig) {}

    async listModels(): Promise<IModel[]> {
        return (await listModels(this.providerConfig)).map((id) => ({ id, name: id }))
    }

    async sendMessage(req: IMessageRequest): Promise<void> {
        const url = normalizeAPIEndpoint(this.providerConfig.endpoint, OPENAI_RESPONSES_API_PATH, DEFAULT_ENDPOINT)
        let finished = false
        let hasError = false

        try {
            await fetchSSE(url, {
                method: 'POST',
                headers: getHeaders(this.providerConfig),
                body: JSON.stringify({
                    model: this.providerConfig.model,
                    input: req.commandPrompt,
                    instructions: req.rolePrompt || undefined,
                    stream: true,
                }),
                signal: req.signal,
                onMessage: async (message) => {
                    if (finished) return
                    const resp = JSON.parse(message)
                    const type = resp?.type

                    if (type === 'response.output_text.delta') {
                        const delta = resp?.delta
                        if (delta) {
                            await req.onMessage({ content: delta, role: 'assistant' })
                        }
                        return
                    }
                    if (type === 'response.completed') {
                        finished = true
                        req.onFinished('stop')
                        return
                    }
                    if (type === 'response.failed' || type === 'response.incomplete' || type === 'error') {
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
