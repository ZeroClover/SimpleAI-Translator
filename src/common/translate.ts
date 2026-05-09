/* eslint-disable camelcase */
import { v4 as uuidv4 } from 'uuid'
import { getLangConfig, getLangName, LangCode } from '../common/lang'
import { codeBlock, oneLine, oneLineTrim } from 'common-tags'
import { getEngine } from './engines'
import { StructuredOutputMode, StructuredOutputRequest } from './engines/interfaces'
import { getSettings } from './utils'

export type APIModel =
    | 'gpt-3.5-turbo-1106'
    | 'gpt-3.5-turbo'
    | 'gpt-3.5-turbo-0301'
    | 'gpt-3.5-turbo-0613'
    | 'gpt-3.5-turbo-16k'
    | 'gpt-3.5-turbo-16k-0613'
    | 'gpt-4'
    | 'gpt-4-0314'
    | 'gpt-4-0613'
    | 'gpt-4-32k'
    | 'gpt-4-32k-0314'
    | 'gpt-4-32k-0613'
    | string

export interface TranslateQuery {
    text: string
    detectFrom: LangCode
    detectTo: LangCode
    providerId?: string
    model?: string
    onMessage: (message: { content: string; role: string; isWordMode: boolean; isFullText?: boolean }) => Promise<void>
    onError: (error: string) => void
    onFinish: (reason: string) => void
    onStatusCode?: (statusCode: number) => void
    signal: AbortSignal
}

export interface TranslateResult {
    text?: string
    from?: string
    to?: string
    error?: string
}

export interface TranslationCacheKeyInput {
    providerId?: string
    model?: string
    sourceLang: LangCode
    targetLang: LangCode
    text: string
    useStructuredOutput?: boolean
    useStrictSchema?: boolean
    translationFlag: number
}

export const isAWord = (langCode: string, text: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Segmenter } = Intl as any
    if (!Segmenter) {
        return false
    }
    const segmenter = new Segmenter(langCode, { granularity: 'word' })
    const iterator = segmenter.segment(text)[Symbol.iterator]()
    return iterator.next().value?.segment === text
}

export class QuoteProcessor {
    private quote: string
    public quoteStart: string
    public quoteEnd: string
    private prevQuoteStartBuffer: string
    private prevQuoteEndBuffer: string

    constructor() {
        this.quote = uuidv4().replace(/-/g, '').slice(0, 4)
        this.quoteStart = `<${this.quote}>`
        this.quoteEnd = `</${this.quote}>`
        this.prevQuoteStartBuffer = ''
        this.prevQuoteEndBuffer = ''
    }

    public processText(text: string): string {
        const deltas = text.split('')
        const targetPieces = deltas.map((delta) => this.processTextDelta(delta))
        return targetPieces.join('')
    }

    private processTextDelta(textDelta: string): string {
        if (textDelta === '') {
            return ''
        }
        if (textDelta.trim() === this.quoteEnd) {
            return ''
        }
        let result = textDelta
        // process quote start
        let quoteStartBuffer = this.prevQuoteStartBuffer
        // console.debug('\n\n')
        // console.debug('---- process quote start -----')
        // console.debug('textDelta', textDelta)
        // console.debug('this.quoteStartbuffer', this.quoteStartBuffer)
        // console.debug('start loop:')
        let startIdx = 0
        for (let i = 0; i < textDelta.length; i++) {
            const char = textDelta[i]
            // console.debug(`---- i: ${i} startIdx: ${startIdx} ----`)
            // console.debug('char', char)
            // console.debug('quoteStartBuffer', quoteStartBuffer)
            // console.debug('result', result)
            if (char === this.quoteStart[quoteStartBuffer.length]) {
                if (this.prevQuoteStartBuffer.length > 0) {
                    if (i === startIdx) {
                        quoteStartBuffer += char
                        result = textDelta.slice(i + 1)
                        startIdx += 1
                    } else {
                        result = this.prevQuoteStartBuffer + textDelta
                        quoteStartBuffer = ''
                        break
                    }
                } else {
                    quoteStartBuffer += char
                    result = textDelta.slice(i + 1)
                }
            } else {
                if (quoteStartBuffer.length === this.quoteStart.length) {
                    quoteStartBuffer = ''
                    break
                }
                if (quoteStartBuffer.length > 0) {
                    result = this.prevQuoteStartBuffer + textDelta
                    quoteStartBuffer = ''
                    break
                }
            }
        }
        // console.debug('end loop!')
        this.prevQuoteStartBuffer = quoteStartBuffer
        // console.debug('result', result)
        // console.debug('this.quoteStartBuffer', this.quoteStartBuffer)
        // console.debug('---- end of process quote start -----')
        textDelta = result
        // process quote end
        let quoteEndBuffer = this.prevQuoteEndBuffer
        // console.debug('\n\n')
        // console.debug('---- start process quote end -----')
        // console.debug('textDelta', textDelta)
        // console.debug('this.quoteEndBuffer', this.quoteEndBuffer)
        // console.debug('start loop:')
        let endIdx = 0
        for (let i = 0; i < textDelta.length; i++) {
            const char = textDelta[i]
            // console.debug(`---- i: ${i}, endIdx: ${endIdx} ----`)
            // console.debug('char', char)
            // console.debug('quoteEndBuffer', quoteEndBuffer)
            // console.debug('result', result)
            if (char === this.quoteEnd[quoteEndBuffer.length]) {
                if (this.prevQuoteEndBuffer.length > 0) {
                    if (i === endIdx) {
                        quoteEndBuffer += char
                        result = textDelta.slice(i + 1)
                        endIdx += 1
                    } else {
                        result = this.prevQuoteEndBuffer + textDelta
                        quoteEndBuffer = ''
                        break
                    }
                } else {
                    quoteEndBuffer += char
                    result = textDelta.slice(0, textDelta.length - quoteEndBuffer.length)
                }
            } else {
                if (quoteEndBuffer.length === this.quoteEnd.length) {
                    quoteEndBuffer = ''
                    break
                }
                if (quoteEndBuffer.length > 0) {
                    result = this.prevQuoteEndBuffer + textDelta
                    quoteEndBuffer = ''
                    break
                }
            }
        }
        // console.debug('end loop!')
        this.prevQuoteEndBuffer = quoteEndBuffer
        // console.debug('totally result', result)
        // console.debug('this.quoteEndBuffer', this.quoteEndBuffer)
        // console.debug('---- end of process quote end -----')
        return result
    }
}

const chineseLangCodes = ['zh-Hans', 'zh-Hant', 'lzh', 'yue', 'jdbhw', 'xdbhw']

export function getStructuredOutputMode(
    sourceLangCode: LangCode,
    targetLangCode: LangCode,
    text: string
): StructuredOutputMode {
    if (isAWord(sourceLangCode, text.trim())) {
        return 'word'
    }
    if (text.length < 5 && chineseLangCodes.indexOf(targetLangCode) >= 0) {
        return 'short-phrase-to-chinese'
    }
    return 'sentence'
}

export function getTranslationCacheKey(input: TranslationCacheKeyInput): string {
    const structuredOutputMode = input.useStructuredOutput
        ? getStructuredOutputMode(input.sourceLang, input.targetLang, input.text)
        : 'off'
    return `translate:${input.providerId ?? ''}:${input.model ?? ''}:${input.sourceLang}:${input.targetLang}:${
        input.text
    }:structured=${input.useStructuredOutput ?? false}:strict=${
        input.useStrictSchema ?? true
    }:mode=${structuredOutputMode}:${input.translationFlag}`
}

const wordTranslationSchema = {
    type: 'object',
    properties: {
        original_form: { type: 'string' },
        language: { type: 'string' },
        phonetics: { type: ['string', 'null'] },
        senses: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    pos: { type: 'string' },
                    meaning: { type: 'string' },
                },
                required: ['pos', 'meaning'],
                additionalProperties: false,
            },
        },
        examples: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    sentence: { type: 'string' },
                    translation: { type: 'string' },
                },
                required: ['sentence', 'translation'],
                additionalProperties: false,
            },
        },
        etymology: { type: ['string', 'null'] },
        correction_hint: { type: ['string', 'null'] },
    },
    required: ['original_form', 'language', 'phonetics', 'senses', 'examples', 'etymology', 'correction_hint'],
    additionalProperties: false,
}

const shortPhraseToChineseSchema = {
    type: 'object',
    properties: {
        options: {
            type: 'array',
            maxItems: 3,
            items: {
                type: 'object',
                properties: {
                    translation: { type: 'string' },
                    context_explanation: { type: 'string' },
                    phonetics: { type: ['string', 'null'] },
                    part_of_speech: { type: ['string', 'null'] },
                    examples: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                sentence: { type: 'string' },
                                translation: { type: 'string' },
                            },
                            required: ['sentence', 'translation'],
                            additionalProperties: false,
                        },
                    },
                },
                required: ['translation', 'context_explanation', 'phonetics', 'part_of_speech', 'examples'],
                additionalProperties: false,
            },
        },
    },
    required: ['options'],
    additionalProperties: false,
}

const sentenceTranslationSchema = {
    type: 'object',
    properties: {
        translatedText: { type: 'string' },
    },
    required: ['translatedText'],
    additionalProperties: false,
}

function getStructuredOutputRequest(mode: StructuredOutputMode, strict: boolean): StructuredOutputRequest {
    switch (mode) {
        case 'word':
            return {
                mode,
                schemaName: 'word_translation',
                schema: wordTranslationSchema,
                strict,
            }
        case 'short-phrase-to-chinese':
            return {
                mode,
                schemaName: 'short_phrase_to_chinese_translation',
                schema: shortPhraseToChineseSchema,
                strict,
            }
        case 'sentence':
            return {
                mode,
                schemaName: 'sentence_translation',
                schema: sentenceTranslationSchema,
                strict,
            }
    }
}

function getStructuredOutputPrompt(mode: StructuredOutputMode, schema: Record<string, unknown>): string {
    const schemaText = JSON.stringify(schema, null, 2)
    const modeInstruction =
        mode === 'sentence'
            ? 'Return only a JSON object matching the schema. The object must contain only translatedText.'
            : 'Return only a JSON object matching the schema. Use null for unavailable nullable fields.'
    return codeBlock`
        Structured output schema:
        ${schemaText}

        ${modeInstruction}
    `
}

export async function translate(query: TranslateQuery) {
    let rolePrompt = ''
    let commandPrompt = ''
    let contentPrompt = query.text
    let isWordMode = false

    const sourceLangCode = query.detectFrom
    const targetLangCode = query.detectTo
    const sourceLangName = getLangName(sourceLangCode)
    const targetLangName = getLangName(targetLangCode)
    const toChinese = chineseLangCodes.indexOf(targetLangCode) >= 0
    const targetLangConfig = getLangConfig(targetLangCode)
    const sourceLangConfig = getLangConfig(sourceLangCode)
    let structuredOutputMode = getStructuredOutputMode(sourceLangCode, targetLangCode, query.text)
    rolePrompt = targetLangConfig.rolePrompt
    commandPrompt = targetLangConfig.genCommandPrompt(sourceLangConfig)

    if (query.text.length < 5 && toChinese) {
        structuredOutputMode = 'short-phrase-to-chinese'
        // 当用户的默认语言为中文时，查询中文词组（不超过5个字），展示多种翻译结果，并阐述适用语境。
        rolePrompt = codeBlock`
                    ${oneLineTrim`
                    你是一个翻译引擎，
                    请将给到的文本翻译成${targetLangName}。
                    请列出3种（如果有）最常用翻译结果：单词或短语，
                    并列出对应的适用语境（用中文阐述）、音标或转写、词性、双语示例。
                    按照下面格式用中文阐述：`}
                        ${oneLineTrim`
                        <序号><单词或短语> · /<${targetLangConfig.phoneticNotation}>/
                        `}
                        [<词性缩写>] <适用语境（用中文阐述）>
                        例句：<例句>(例句翻译)
                    `
        commandPrompt = ''
    }
    if (isAWord(sourceLangCode, query.text.trim())) {
        isWordMode = true
        structuredOutputMode = 'word'
        if (toChinese) {
            // 单词模式，可以更详细的翻译结果，包括：音标、词性、含义、双语示例。
            rolePrompt = codeBlock`
                        ${oneLineTrim`
                        你是一个翻译引擎，请翻译给出的文本，只需要翻译不需要解释。
                        当且仅当文本只有一个单词时，
                        请给出单词原始形态（如果有）、
                        单词的语种、
                        ${targetLangConfig.phoneticNotation && '对应的音标或转写、'}
                        所有含义（含词性）、
                        双语示例，至少三条例句。
                        如果你认为单词拼写错误，请提示我最可能的正确拼写，
                        否则请严格按照下面格式给到翻译结果：
                        `}
                            <单词>
                            [<语种>]· / ${targetLangConfig.phoneticNotation && `<${targetLangConfig.phoneticNotation}>`}
                            [<词性缩写>] <中文含义>]
                            例句：
                            <序号><例句>(例句翻译)
                            词源：
                            <词源>
                        `
            commandPrompt = '好的，我明白了，请给我这个单词。'
            contentPrompt = `单词是：${query.text}`
        } else {
            const isSameLanguage = sourceLangCode === targetLangCode
            rolePrompt = codeBlock`${oneLine`
                            You are a professional translation engine.
                            Please translate the text into ${targetLangName} without explanation.
                            When the text has only one word,
                            please act as a professional
                            ${sourceLangName}-${targetLangName} dictionary,
                            and list the original form of the word (if any),
                            the language of the word,
                            ${
                                targetLangConfig.phoneticNotation &&
                                'the corresponding phonetic notation or transcription, '
                            }
                            all senses with parts of speech,
                            ${isSameLanguage ? '' : 'bilingual '}
                            sentence examples (at least 3) and etymology.
                            If you think there is a spelling mistake,
                            please tell me the most possible correct word
                            otherwise reply in the following format:
                            `}
<word> (<original form>)
${oneLine`
[<language>]· /
${targetLangConfig.phoneticNotation && `<${targetLangConfig.phoneticNotation}>`}
`}
${oneLine`
[<part of speech>]
${isSameLanguage ? '' : '<translated meaning> / '}
<meaning in source language>
`}
Examples:
<index>. <sentence>(<sentence translation>)
Etymology:
<etymology>`
            commandPrompt = 'I understand. Please give me the word.'
            contentPrompt = `The word is: ${query.text}`
        }
    }
    if (contentPrompt) {
        commandPrompt = `Only reply the result and nothing else. ${commandPrompt}:\n\n${contentPrompt.trimEnd()}`
    }

    const settings = await getSettings()
    const structuredOutput = settings.useStructuredOutput
        ? getStructuredOutputRequest(structuredOutputMode, settings.useStrictSchema ?? true)
        : undefined
    if (structuredOutput) {
        rolePrompt = `${rolePrompt}\n\n${getStructuredOutputPrompt(structuredOutput.mode, structuredOutput.schema)}`
    }
    const providerId = query.providerId ?? settings.defaultModel?.providerId ?? settings.defaultProviderId
    const providerConfig = settings.providers.find((provider) => provider.id === providerId)
    if (!providerConfig) {
        query.onError('No LLM Provider configured. Please add a provider in settings.')
        query.onFinish('error')
        return
    }
    const model = query.model ?? settings.defaultModel?.model ?? providerConfig.model
    if (!model) {
        query.onError('No model selected. Please select a model in settings.')
        query.onFinish('error')
        return
    }
    const modelThinking =
        settings.defaultModel?.providerId === providerConfig.id && settings.defaultModel.model === model
            ? {
                  thinkingEnabled: settings.defaultModel.thinkingEnabled,
                  openaiReasoningEffort: settings.defaultModel.openaiReasoningEffort,
                  anthropicThinkingEffort: settings.defaultModel.anthropicThinkingEffort,
              }
            : {}

    try {
        const engine = getEngine({
            ...providerConfig,
            model,
            ...modelThinking,
        })
        await engine.sendMessage({
            signal: query.signal,
            rolePrompt,
            commandPrompt,
            structuredOutput,
            onMessage: async (message) => {
                await query.onMessage({ ...message, isWordMode })
            },
            onFinished: (reason) => {
                query.onFinish(reason)
            },
            onError: (error) => {
                query.onError(error)
            },
            onStatusCode: (statusCode) => {
                query.onStatusCode?.(statusCode)
            },
        })
    } catch (error) {
        if (query.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
            query.onFinish('aborted')
            return
        }
        query.onError(error instanceof Error ? error.message : String(error))
        query.onFinish('error')
    }
}
