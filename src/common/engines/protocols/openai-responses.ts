import { ProviderConfig, ThinkingControl } from '../../types'
import { normalizeAPIEndpoint, OPENAI_RESPONSES_API_PATH } from '../../openai-api-path'
import {
    EngineSession,
    IEngine,
    IMessageRequest,
    IModel,
    sendProtocolRequest,
    StructuredOutputRequest,
} from '../interfaces'
import { getReasoningEffort, listModels as listOpenAIModels } from './openai-chat'

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1'
type EngineProviderConfig = ProviderConfig & ThinkingControl

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

function getTextFormat(structuredOutput: StructuredOutputRequest | undefined) {
    if (!structuredOutput) {
        return undefined
    }
    if (!structuredOutput.strict) {
        return { type: 'json_object' }
    }
    return {
        type: 'json_schema',
        name: structuredOutput.schemaName,
        strict: true,
        schema: structuredOutput.schema,
    }
}

interface ResponsesOutputItem {
    type?: unknown
    content?: Array<{ type?: unknown; refusal?: unknown; text?: unknown }>
}

function getOutputContents(output: unknown) {
    return (Array.isArray(output) ? (output as ResponsesOutputItem[]) : []).flatMap((item) =>
        Array.isArray(item?.content) ? item.content : []
    )
}

// Refusal text from a completed response, or null when the model did not refuse.
function getCompletedRefusal(response: unknown): string | null {
    const output = (response as { output?: unknown } | undefined)?.output
    for (const content of getOutputContents(output)) {
        if (content?.type === 'refusal') {
            return typeof content.refusal === 'string' ? content.refusal : ''
        }
    }
    return null
}

// Only `output_text` parts of message items are translation text.
function getOutputText(output: unknown[]): string {
    return (output as ResponsesOutputItem[])
        .filter((item) => item?.type === 'message' && Array.isArray(item.content))
        .flatMap((item) => item.content ?? [])
        .filter((content) => content?.type === 'output_text' && typeof content.text === 'string')
        .map((content) => content.text)
        .join('')
}

export async function listModels(providerConfig: ProviderConfig): Promise<string[]> {
    return listOpenAIModels(providerConfig)
}

export class OpenAIResponsesEngine implements IEngine {
    constructor(private readonly providerConfig: EngineProviderConfig) {}

    async listModels(): Promise<IModel[]> {
        return (await listModels(this.providerConfig)).map((id) => ({ id, name: id }))
    }

    async sendMessage(req: IMessageRequest): Promise<void> {
        const session = new EngineSession(req, getErrorMessage)
        let refusalContent = ''

        const textFormat = getTextFormat(req.structuredOutput)
        const reasoningEffort = getReasoningEffort(this.providerConfig)
        await sendProtocolRequest(session, {
            url: normalizeAPIEndpoint(this.providerConfig.endpoint, OPENAI_RESPONSES_API_PATH, DEFAULT_ENDPOINT),
            headers: getHeaders(this.providerConfig),
            body: {
                model: this.providerConfig.model,
                input: req.commandPrompt,
                instructions: req.rolePrompt || undefined,
                ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
                ...(textFormat ? { text: { format: textFormat } } : {}),
                // Translations are one-shot; do not keep them in OpenAI's response store.
                store: false,
            },
            onEvent: async (message) => {
                // Some gateways append [DONE] after the terminal event.
                if (message.trim() === '[DONE]') {
                    return
                }
                const resp = JSON.parse(message)
                const type = resp?.type
                if (
                    typeof type === 'string' &&
                    /^response\.(?:output_item|content_part|output_text|refusal|reasoning)/.test(type)
                ) {
                    session.markContent()
                }
                if (type === 'error' || type === 'response.failed') {
                    session.streamFailed(resp)
                    return
                }
                if (type === 'response.refusal.delta') {
                    refusalContent += typeof resp.delta === 'string' ? resp.delta : ''
                    return
                }
                if (type === 'response.output_text.delta') {
                    const delta = resp?.delta
                    if (delta) {
                        await session.text(delta)
                    }
                    return
                }
                if (type === 'response.completed') {
                    const refusal = refusalContent || getCompletedRefusal(resp?.response)
                    if (refusal) {
                        session.fail(refusal)
                        return
                    }
                    await session.complete('stop')
                    return
                }
                if (type === 'response.incomplete') {
                    if (refusalContent) {
                        session.fail(refusalContent)
                    } else if (resp?.response?.incomplete_details?.reason === 'max_output_tokens') {
                        await session.complete('max_tokens')
                    } else {
                        session.failWith(resp)
                    }
                }
            },
            onResponse: async (data) => {
                const resp = data as {
                    status?: unknown
                    error?: unknown
                    incomplete_details?: { reason?: unknown } | null
                    output?: unknown
                }
                if (resp?.error) {
                    session.failWith(resp)
                    return
                }
                if (!Array.isArray(resp?.output)) {
                    session.fail('The response does not contain Responses output.')
                    return
                }
                const refusal = getCompletedRefusal(resp)
                if (refusal !== null) {
                    session.fail(refusal || 'The model refused to answer.')
                    return
                }
                const text = getOutputText(resp.output)
                if (resp.status === 'completed') {
                    await session.completeResponse(text, 'stop')
                    return
                }
                const reason = resp.incomplete_details?.reason
                if (resp.status === 'incomplete' && reason === 'max_output_tokens') {
                    await session.completeResponse(text, 'max_tokens')
                    return
                }
                session.fail(
                    resp.status === 'incomplete' && typeof reason === 'string'
                        ? `The response is incomplete (${reason}).`
                        : `The response finished with status: ${String(resp.status ?? 'unknown')}.`
                )
            },
            // Some compatible endpoints close the stream without a terminal event.
            onEnd: async () => {
                if (refusalContent) {
                    session.fail(refusalContent)
                    return
                }
                await session.complete('stop')
            },
        })
    }
}
