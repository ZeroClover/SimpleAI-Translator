export interface IModel {
    id: string
    name: string
    description?: string
}

export interface IMessage {
    role: string
    content: string
}

export type StructuredOutputMode = 'word' | 'short-phrase-to-chinese' | 'sentence'

export interface StructuredOutputRequest {
    mode: StructuredOutputMode
    schemaName: string
    schema: Record<string, unknown>
    strict: boolean
}

export interface IMessageRequest {
    // System-channel instruction: role, task, constraints, anti-injection clauses,
    // and any structured-output schema prompt. Adapters map it to the system message
    // (openai-chat), the top-level `system` parameter (anthropic), or `instructions`
    // (openai-responses). Never carries the source text.
    rolePrompt: string
    // Untrusted user data: the source text wrapped in a per-request random boundary.
    // Adapters map it to the user message / `input`. Never placed in the system channel.
    commandPrompt: string
    structuredOutput?: StructuredOutputRequest
    modelOverride?: string
    onMessage: (message: { content: string; role: string; isFullText?: boolean }) => Promise<void>
    onError: (error: string) => void
    onFinished: (reason: string) => void
    onStatusCode?: (statusCode: number) => void
    signal: AbortSignal
}

export interface IEngine {
    listModels(): Promise<IModel[]>
    sendMessage(req: IMessageRequest): Promise<void>
}

function readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function formatExamples(value: unknown): string {
    if (!Array.isArray(value)) {
        return ''
    }
    return value
        .map((item, index) => {
            const example = item as { sentence?: unknown; translation?: unknown }
            const sentence = readString(example.sentence)
            const translation = readString(example.translation)
            if (!sentence && !translation) {
                return ''
            }
            return `${index + 1}. ${sentence ?? ''}${translation ? `(${translation})` : ''}`
        })
        .filter(Boolean)
        .join('\n')
}

export function formatStructuredOutput(mode: StructuredOutputMode, rawContent: string): string {
    const data = JSON.parse(rawContent)

    if (mode === 'sentence') {
        const translatedText = readString(data?.translatedText)
        if (!translatedText) {
            throw new Error('Structured output is missing translatedText.')
        }
        return translatedText
    }

    if (mode === 'short-phrase-to-chinese') {
        const options = Array.isArray(data?.options) ? data.options : []
        if (options.length === 0) {
            throw new Error('Structured output is missing translation options.')
        }
        return options
            .slice(0, 3)
            .map((item: unknown, index: number) => {
                const option = item as {
                    translation?: unknown
                    context_explanation?: unknown
                    phonetics?: unknown
                    part_of_speech?: unknown
                    examples?: unknown
                }
                const translation = readString(option.translation) ?? ''
                const phonetics = readString(option.phonetics)
                const partOfSpeech = readString(option.part_of_speech)
                const context = readString(option.context_explanation)
                const examples = formatExamples(option.examples)
                return [
                    `${index + 1}. ${translation}${phonetics ? ` · /${phonetics}/` : ''}`,
                    partOfSpeech ? `[${partOfSpeech}] ${context ?? ''}` : context,
                    examples ? `例句：\n${examples}` : '',
                ]
                    .filter(Boolean)
                    .join('\n')
            })
            .join('\n\n')
    }

    const senses = Array.isArray(data?.senses)
        ? data.senses
              .map((item: unknown) => {
                  const sense = item as { pos?: unknown; meaning?: unknown }
                  const pos = readString(sense.pos)
                  const meaning = readString(sense.meaning)
                  if (!pos && !meaning) {
                      return ''
                  }
                  return `[${pos ?? ''}] ${meaning ?? ''}`.trim()
              })
              .filter(Boolean)
              .join('\n')
        : ''
    const examples = formatExamples(data?.examples)
    const lines = [
        readString(data?.original_form) ?? '',
        `[${readString(data?.language) ?? ''}]${
            readString(data?.phonetics) ? ` · /${readString(data?.phonetics)}/` : ''
        }`,
        senses,
        examples ? `例句：\n${examples}` : '',
        readString(data?.etymology) ? `词源：\n${readString(data?.etymology)}` : '',
        readString(data?.correction_hint) ? `拼写提示：${readString(data?.correction_hint)}` : '',
    ]
    return lines.filter(Boolean).join('\n')
}
