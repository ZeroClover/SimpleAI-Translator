/* eslint-disable camelcase */
import { describe, expect, it } from 'vitest'
import {
    formatStructuredOutput,
    isStreamingUnsupportedError,
    StructuredOutputBuffer,
    StructuredOutputMode,
} from './interfaces'

const WORD = {
    original_form: 'run',
    language: 'English',
    phonetics: 'rʌn',
    senses: [
        { pos: 'verb', meaning: '跑' },
        { pos: 'noun', meaning: '奔跑' },
    ],
    examples: [{ sentence: 'I run daily.', translation: '我每天跑步。' }],
    etymology: 'Old English rinnan.',
    correction_hint: 'Did you mean "ran"?',
}

const WORD_TEXT = [
    'run',
    '[English] · /rʌn/',
    '[verb] 跑',
    '[noun] 奔跑',
    '例句：',
    '1. I run daily.(我每天跑步。)',
    '词源：',
    'Old English rinnan.',
    '拼写提示：Did you mean "ran"?',
].join('\n')

const PHRASE = {
    options: [
        {
            translation: '你好',
            context_explanation: '问候语',
            phonetics: 'ni hao',
            part_of_speech: 'phrase',
            examples: [{ sentence: 'Hi there.', translation: '你好。' }],
        },
        { translation: '嗨', context_explanation: '非正式问候', phonetics: null, part_of_speech: 'interjection' },
        { translation: '哈喽', context_explanation: '音译', part_of_speech: null },
        { translation: '喂', context_explanation: '第四项' },
    ],
}

const PHRASE_TEXT = [
    '1. 你好 · /ni hao/\n[phrase] 问候语\n例句：\n1. Hi there.(你好。)',
    '2. 嗨\n[interjection] 非正式问候',
    '3. 哈喽\n音译',
].join('\n\n')

// Feeds `source` in pieces and returns every preview the buffer produced.
function stream(mode: StructuredOutputMode, chunks: string[]) {
    const buffer = new StructuredOutputBuffer(mode)
    const previews = chunks.map((chunk) => buffer.push(chunk)).filter((preview): preview is string => !!preview)
    return { buffer, previews }
}

function characters(text: string): string[] {
    // Code units, so surrogate pairs and escapes are split too.
    return text.split('')
}

describe('structured output final formatting', () => {
    it('keeps the word layout for populated fields', () => {
        expect(formatStructuredOutput('word', JSON.stringify(WORD))).toBe(WORD_TEXT)
    })

    it('keeps the short phrase layout and at most three options', () => {
        expect(formatStructuredOutput('short-phrase-to-chinese', JSON.stringify(PHRASE))).toBe(PHRASE_TEXT)
    })

    it('emits the trimmed sentence translation', () => {
        expect(formatStructuredOutput('sentence', '{"translatedText":"  你好 "}')).toBe('你好')
    })

    it.each([
        [{ original_form: 'run', language: 'English', phonetics: 'rʌn' }, 'run\n[English] · /rʌn/'],
        [{ original_form: 'run', language: 'English' }, 'run\n[English]'],
        [{ original_form: 'run', phonetics: 'rʌn' }, 'run\n/rʌn/'],
        [{ original_form: 'run', language: '', phonetics: ' ' }, 'run'],
        [{ phonetics: 'rʌn' }, '/rʌn/'],
    ])('omits empty word language/phonetics parts (%j)', (data, text) => {
        expect(formatStructuredOutput('word', JSON.stringify(data))).toBe(text)
    })

    it('does not depend on property order', () => {
        const reversed = Object.fromEntries(Object.entries(WORD).reverse())
        expect(formatStructuredOutput('word', JSON.stringify(reversed))).toBe(WORD_TEXT)
    })
})

describe('structured output validation', () => {
    it.each([
        ['sentence', '{"translatedText":"你好"', /JSON/],
        ['sentence', '', /JSON/],
        ['sentence', 'null', 'Structured output is not a JSON object.'],
        ['sentence', '["你好"]', 'Structured output is not a JSON object.'],
        ['word', '"run"', 'Structured output is not a JSON object.'],
        ['sentence', '{"translatedText":123}', 'Structured output is missing translatedText.'],
        ['sentence', '{"translatedText":"  "}', 'Structured output is missing translatedText.'],
        ['sentence', '{"unexpected":"x"}', 'Structured output is missing translatedText.'],
        ['short-phrase-to-chinese', '{"options":{}}', 'Structured output is missing translation options.'],
        ['short-phrase-to-chinese', '{"options":[]}', 'Structured output is missing translation options.'],
    ] as const)('rejects %s output %s', (mode, raw, error) => {
        expect(() => formatStructuredOutput(mode, raw)).toThrow(error)
    })

    it('skips unusable non-core word values instead of failing', () => {
        const raw = JSON.stringify({
            original_form: 'run',
            language: null,
            phonetics: [],
            senses: [null, 'verb', { pos: 1, meaning: '跑' }, { pos: 'noun', meaning: null }],
            examples: { sentence: 'x' },
            etymology: 7,
            extra: { anything: true },
        })
        expect(formatStructuredOutput('word', raw)).toBe('run\n跑\n[noun]')
    })

    it('accepts a word object with missing fields', () => {
        expect(formatStructuredOutput('word', '{}')).toBe('')
        expect(formatStructuredOutput('word', '{"original_form":"run","unknown":1}')).toBe('run')
    })

    it('skips unusable short phrase members', () => {
        const raw = JSON.stringify({
            options: [
                null,
                3,
                { translation: 123, context_explanation: '问候语' },
                { translation: '嗨', examples: 'x' },
            ],
        })
        expect(formatStructuredOutput('short-phrase-to-chinese', raw)).toBe('1. 问候语\n\n2. 嗨')
    })

    it('yields an empty result when no option is renderable', () => {
        expect(formatStructuredOutput('short-phrase-to-chinese', '{"options":[null,{},{"translation":1}]}')).toBe('')
    })
})

describe('structured output previews', () => {
    it('shows an open sentence string before its closing quote', () => {
        const buffer = new StructuredOutputBuffer('sentence')
        expect(buffer.push('{"translatedText":"你')).toBe('你')
        expect(buffer.push('好"}')).toBe('你好')
        expect(buffer.finish()).toBe('你好')
    })

    it('shows word fields as they arrive and replaces the layout when earlier fields arrive later', () => {
        const buffer = new StructuredOutputBuffer('word')
        expect(buffer.push('{"etymology":"Old English')).toBe('词源：\nOld English')
        expect(buffer.push(' rinnan.","original_form":"ru')).toBe('ru\n词源：\nOld English rinnan.')
        expect(buffer.push('n","senses":[{"pos":"verb","meaning":"跑"},{"po')).toBe(
            'run\n[verb] 跑\n词源：\nOld English rinnan.'
        )
        expect(buffer.push('s":"noun"}]}')).toBe('run\n[verb] 跑\n[noun]\n词源：\nOld English rinnan.')
    })

    it('shows the first short phrase option while later options are arriving', () => {
        const json = JSON.stringify(PHRASE)
        const cut = json.indexOf('"translation":"嗨') + 5
        const buffer = new StructuredOutputBuffer('short-phrase-to-chinese')
        const preview = buffer.push(json.slice(0, cut))
        expect(preview).toBe('1. 你好 · /ni hao/\n[phrase] 问候语\n例句：\n1. Hi there.(你好。)')
        buffer.push(json.slice(cut))
        expect(buffer.finish()).toBe(PHRASE_TEXT)
    })

    it.each<[StructuredOutputMode, unknown]>([
        ['sentence', { translatedText: 'Say "hi" \\ path\\to 😀 中文\n下一行', extra: [1, { a: '}' }] }],
        ['word', WORD],
        ['short-phrase-to-chinese', PHRASE],
    ])('never leaks JSON while %s output is split at every character', (mode, data) => {
        const json = JSON.stringify(data)
            // Escape non-ASCII so Unicode escapes and surrogate pairs are split too.
            .replace(/[\u007f-￿]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
        const { buffer, previews } = stream(mode, characters(json))
        expect(previews.length).toBeGreaterThan(1)
        for (const preview of previews) {
            expect(preview).not.toMatch(/\\u|[{}]|"(?:translatedText|options|original_form)"/)
            expect(preview).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
        }
        expect(new Set(previews).size).toBe(previews.length)
        expect(buffer.finish()).toBe(formatStructuredOutput(mode, json))
    })

    it('holds back a trailing high surrogate the tolerant parser returns', () => {
        const buffer = new StructuredOutputBuffer('sentence')
        expect(buffer.push('{"translatedText":"a')).toBe('a')
        expect(buffer.push('\\uD83D')).toBeUndefined()
        expect(buffer.push('\\uDE00')).toBe('a😀')
    })

    it('keeps the previous preview while an escape is incomplete', () => {
        const buffer = new StructuredOutputBuffer('sentence')
        expect(buffer.push('{"translatedText":"a')).toBe('a')
        expect(buffer.push('\\')).toBeUndefined()
        expect(buffer.push('u4f')).toBeUndefined()
        expect(buffer.push('60\\"')).toBe('a你"')
    })

    it('ignores thinking tags and text that is not a JSON object', () => {
        const buffer = new StructuredOutputBuffer('sentence')
        expect(buffer.push('<thinking>{"translatedText":"leak"}')).toBeUndefined()
        expect(buffer.push('</thin')).toBeUndefined()
        expect(buffer.push('king>{"translatedText":"ok"}')).toBe('ok')
        expect(buffer.finish()).toBe('ok')
        expect(stream('sentence', ['Sure! ', '{"translatedText":"x"}']).previews).toEqual([])
    })

    it('does not let a tolerant preview pass final validation', () => {
        const buffer = new StructuredOutputBuffer('sentence')
        expect(buffer.push('{"translatedText":"你好')).toBe('你好')
        expect(() => buffer.finish()).toThrow(/JSON/)
    })

    it('does not repeat an unchanged preview', () => {
        const { previews } = stream('sentence', ['{"translatedText":"你好"', ' ', '\n', '}'])
        expect(previews).toEqual(['你好'])
    })
})

describe('streaming capability rejection', () => {
    it.each([
        { error: { message: 'Unsupported value', param: 'stream', code: 'unsupported_value' } },
        { error: { message: 'x', param: 'stream', type: 'unsupported_parameter' } },
        { error: { message: 'Streaming is not supported with response_format json_schema' } },
        { error: { message: "Unsupported value: 'stream' does not support true with this model." } },
        { error: { message: 'This model does not support streaming.' } },
        { error: { message: 'Streaming with structured outputs is not supported for this endpoint.' } },
        { type: 'error', error: { type: 'invalid_request_error', message: 'Streaming is not available.' } },
        { type: 'response.failed', response: { error: { message: 'The stream parameter is not supported.' } } },
        'streaming is not supported',
    ])('accepts explicit evidence %j', (error) => {
        expect(isStreamingUnsupportedError(error)).toBe(true)
    })

    it.each([
        { error: { message: 'Invalid stream payload' } },
        { error: { message: 'response_format json_schema is not supported by this model' } },
        { error: { message: 'Unknown schema' } },
        { error: { message: 'stream must be a boolean' } },
        { error: { message: 'Upstream stream closed unexpectedly' } },
        { error: { message: 'stream_options is not supported' } },
        { error: { message: 'Invalid API key', param: 'stream', code: 'invalid_api_key' } },
        { error: { message: 'Rate limit exceeded' } },
        { message: 'network down' },
        null,
        undefined,
    ])('rejects ambiguous or unrelated errors %j', (error) => {
        expect(isStreamingUnsupportedError(error)).toBe(false)
    })
})
