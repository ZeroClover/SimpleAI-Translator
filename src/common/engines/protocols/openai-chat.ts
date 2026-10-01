import { ProviderConfig, ReasoningEffort, ThinkingControl } from '../../types'
import { getUniversalFetch } from '../../universal-fetch'
import { fetchSSE } from '../../utils'
import { normalizeAPIEndpoint, OPENAI_CHAT_COMPLETIONS_API_PATH } from '../../openai-api-path'
import { formatStructuredOutput, IEngine, IMessageRequest, IModel, StructuredOutputRequest } from '../interfaces'
import { ThinkingFilter } from '../thinking-filter'

/* eslint-disable camelcase */

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1'
const MODELS_PATH = '/v1/models'
type EngineProviderConfig = ProviderConfig & ThinkingControl

function getHeaders(providerConfig: ProviderConfig): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${providerConfig.apiKey}`,
        ...providerConfig.extraHeaders,
    }
}

function getMessages(req: IMessageRequest): Array<{ role: string; content: string }> {
    // Instructions go in the system role; the untrusted source data goes in the user role.
    const messages: Array<{ role: string; content: string }> = []
    if (req.rolePrompt) {
        messages.push({ role: 'system', content: req.rolePrompt })
    }
    messages.push({ role: 'user', content: req.commandPrompt })
    return messages
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

// Lowest reasoning effort a model family accepts. GPT-5.5+ and Gemini 3 reason at
// their default level when the field is omitted, so "thinking off" has to send
// this explicitly. Families not listed here keep the field omitted.
function getLowestReasoningEffort(model: string): 'none' | 'minimal' | 'low' | undefined {
    // Strip gateway prefixes such as `openai/`, `google/`, or `models/`.
    const id = model.toLowerCase().replace(/^.*\//, '')
    if (/^gpt-5(?:-mini|-nano)?(?:-\d{4}-\d{2}-\d{2})?$/.test(id)) {
        return 'minimal'
    }
    if (/^gpt-[56]/.test(id) && /-(?:pro|codex|chat)(?:$|-)/.test(id)) {
        return undefined
    }
    if (/^gpt-6(?:-astra|\.[1-9])/.test(id)) {
        return 'low'
    }
    if (/^gpt-(?:5\.\d+|6)(?:$|-)/.test(id)) {
        return 'none'
    }
    if (/^gemini-3/.test(id) && !id.includes('flash-lite')) {
        return 'low'
    }
    return undefined
}

export function getReasoningEffort(
    providerConfig: EngineProviderConfig
): ReasoningEffort | 'none' | 'minimal' | undefined {
    if (providerConfig.thinkingEnabled !== true) {
        return getLowestReasoningEffort(providerConfig.model)
    }
    return providerConfig.reasoningEffort ?? 'medium'
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
    constructor(private readonly providerConfig: EngineProviderConfig) {}

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
        // Refusals stream as `delta.refusal` fragments; report the whole text once the stream ends.
        let refused = false
        let refusal = ''
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

        const finish = async (reason: string) => {
            if (refused) {
                hasError = true
                finished = true
                req.onError(refusal || 'The model refused to answer.')
                req.onFinished('error')
                return
            }
            if (!(await emitStructuredContent())) {
                return
            }
            await emitRemainingText()
            finished = true
            req.onFinished(reason)
        }

        try {
            const responseFormat = getResponseFormat(req.structuredOutput)
            const reasoningEffort = getReasoningEffort(this.providerConfig)
            await fetchSSE(url, {
                method: 'POST',
                headers: getHeaders(this.providerConfig),
                body: JSON.stringify({
                    model: this.providerConfig.model,
                    messages: getMessages(req),
                    stream: true,
                    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
                    ...(responseFormat ? { response_format: responseFormat } : {}),
                }),
                signal: req.signal,
                onMessage: async (message) => {
                    if (finished) return
                    if (message.trim() === '[DONE]') {
                        await finish('stop')
                        return
                    }

                    const resp = JSON.parse(message)
                    const choices = resp?.choices
                    if (!Array.isArray(choices) || choices.length === 0) {
                        return
                    }
                    const choice = choices[0]
                    const refusalPart = choice?.message?.refusal ?? choice?.delta?.refusal
                    if (refusalPart) {
                        refused = true
                        if (typeof refusalPart === 'string') {
                            refusal += refusalPart
                        }
                    }
                    // Some providers send the last content delta and finish_reason in one chunk.
                    const content = choice?.delta?.content
                    if (content && !refused) {
                        if (req.structuredOutput) {
                            structuredContent += thinkingFilter.push(content)
                        } else {
                            await emitText(content, choice?.delta?.role ?? 'assistant')
                        }
                    }
                    const finishReason = choice?.finish_reason
                    if (finishReason) {
                        await finish(finishReason)
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

        if (finished) {
            return
        }
        if (hasError) {
            req.onFinished('error')
            return
        }
        // Some compatible endpoints close the stream without [DONE] or finish_reason.
        await finish('stop')
    }
}
