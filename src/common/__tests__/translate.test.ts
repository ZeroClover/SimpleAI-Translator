import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getEngine } from '../engines'
import { IEngine } from '../engines/interfaces'
import { ProviderConfig } from '../types'
import { getSettings } from '../utils'
import { QuoteProcessor, TranslateQuery, translate } from '../translate'

vi.mock('../engines', () => ({ getEngine: vi.fn() }))
vi.mock('../utils', () => ({ getSettings: vi.fn() }))

const provider: ProviderConfig = {
    id: 'provider-1',
    name: 'Provider',
    protocol: 'openai-chat',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
}

function createTranslateQuery(overrides: Partial<TranslateQuery> = {}) {
    const controller = new AbortController()
    return {
        text: 'hello world',
        detectFrom: 'en',
        detectTo: 'zh-Hans',
        signal: controller.signal,
        onMessage: vi.fn().mockResolvedValue(undefined),
        onError: vi.fn(),
        onFinish: vi.fn(),
        onStatusCode: vi.fn(),
        ...overrides,
    } as TranslateQuery
}

function createMockEngine(sendMessage: IEngine['sendMessage']): IEngine {
    return {
        listModels: vi.fn().mockResolvedValue([]),
        sendMessage,
    }
}

describe('translate', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(getSettings).mockResolvedValue({
            providers: [provider],
            defaultProviderId: provider.id,
        } as Awaited<ReturnType<typeof getSettings>>)
    })

    it('streams ordinary sentence translation through the default provider', async () => {
        const sendMessage = vi.fn(async (req) => {
            expect(req.commandPrompt).toContain('hello world')
            await req.onMessage({ content: '你好', role: 'assistant' })
            req.onFinished('stop')
        })
        vi.mocked(getEngine).mockReturnValue(createMockEngine(sendMessage))
        const query = createTranslateQuery()

        await translate(query)

        expect(getEngine).toHaveBeenCalledWith(provider)
        expect(query.onMessage).toHaveBeenCalledWith({ content: '你好', role: 'assistant', isWordMode: false })
        expect(query.onFinish).toHaveBeenCalledWith('stop')
    })

    it('overrides the provider model without changing the provider config', async () => {
        const sendMessage = vi.fn(async (req) => {
            await req.onMessage({ content: '你好', role: 'assistant' })
            req.onFinished('stop')
        })
        vi.mocked(getEngine).mockReturnValue(createMockEngine(sendMessage))
        const query = createTranslateQuery({ model: 'gpt-4o' })

        await translate(query)

        expect(getEngine).toHaveBeenCalledWith({
            ...provider,
            model: 'gpt-4o',
        })
    })

    it('uses word mode for a single word', async () => {
        const sendMessage = vi.fn(async (req) => {
            expect(req.commandPrompt).toContain('单词是：hello')
            await req.onMessage({ content: '你好', role: 'assistant' })
            req.onFinished('stop')
        })
        vi.mocked(getEngine).mockReturnValue(createMockEngine(sendMessage))
        const query = createTranslateQuery({ text: 'hello' })

        await translate(query)

        expect(query.onMessage).toHaveBeenCalledWith({ content: '你好', role: 'assistant', isWordMode: true })
    })

    it('finishes as aborted when the request is aborted', async () => {
        const controller = new AbortController()
        controller.abort()
        const sendMessage = vi.fn(async () => {
            throw new DOMException('Aborted', 'AbortError')
        })
        vi.mocked(getEngine).mockReturnValue(createMockEngine(sendMessage))
        const query = createTranslateQuery({ signal: controller.signal })

        await translate(query)

        expect(query.onError).not.toHaveBeenCalled()
        expect(query.onFinish).toHaveBeenCalledWith('aborted')
    })

    it('reports engine errors', async () => {
        const sendMessage = vi.fn(async () => {
            throw new Error('network down')
        })
        vi.mocked(getEngine).mockReturnValue(createMockEngine(sendMessage))
        const query = createTranslateQuery()

        await translate(query)

        expect(query.onError).toHaveBeenCalledWith('network down')
        expect(query.onFinish).toHaveBeenCalledWith('error')
    })
})

describe('QuoteProcessor', () => {
    it('should return the string without quote', () => {
        const quoteProcessor = new QuoteProcessor()
        const deltas = [
            ...quoteProcessor.quoteStart.split(''),
            'T',
            'h',
            'i',
            's',
            ' ',
            'i',
            's',
            ' ',
            'a',
            ' ',
            't',
            'e',
            's',
            't',
            '.',
            ...quoteProcessor.quoteEnd.split(''),
        ]

        let targetText = ''
        for (const delta of deltas) {
            targetText += quoteProcessor.processText(delta)
        }

        expect(targetText).toEqual('This is a test.')
    })

    it('should return the string without quote', () => {
        const quoteProcessor = new QuoteProcessor()
        const deltas = [
            ...quoteProcessor.quoteStart.split(''),
            'T',
            'h',
            'i',
            's',
            ' ',
            'i',
            's',
            ' ',
            'a',
            ' ',
            't',
            'e',
            's',
            't',
            '.',
            '(',
            ')' + quoteProcessor.quoteEnd.split('')[0],
            ...quoteProcessor.quoteEnd.split('').slice(1),
        ]

        let targetText = ''
        for (const delta of deltas) {
            targetText += quoteProcessor.processText(delta)
        }

        expect(targetText).toEqual('This is a test.()')
    })

    it('should return the string without quote', () => {
        const quoteProcessor = new QuoteProcessor()
        const text = 'This is a test.'
        const targetText = quoteProcessor.processText(quoteProcessor.quoteStart + text + quoteProcessor.quoteEnd)
        expect(targetText).toEqual(text)
    })

    it('should return the string without quote', () => {
        const quoteProcessor = new QuoteProcessor()
        const text = 'This is a test.'
        const targetText = quoteProcessor.processText(
            `${quoteProcessor.quoteStart}This${quoteProcessor.quoteStart} is ${quoteProcessor.quoteEnd}a${quoteProcessor.quoteStart} test.${quoteProcessor.quoteEnd}`
        )
        expect(targetText).toEqual(text)
    })

    it('should return the same string if no quote exists', () => {
        const quoteProcessor = new QuoteProcessor()
        const deltas = [
            '<X',
            '1',
            '2',
            'Y>',
            'T',
            'h',
            'i',
            's',
            ' ',
            'i',
            's',
            ' ',
            'a',
            ' ',
            't',
            'e',
            's',
            't',
            '.',
            '</',
            'X',
            '1',
            '2',
            'Y>',
        ]
        let targetText = ''
        for (const delta of deltas) {
            targetText += quoteProcessor.processText(delta)
        }

        expect(targetText).toEqual('<X12Y>This is a test.</X12Y>')
    })

    it('should return the same string if no quote exists', () => {
        const quoteProcessor = new QuoteProcessor()
        const text = '<X12Y>This is a test.</X12Y>'
        const targetText = quoteProcessor.processText(text)
        expect(targetText).toEqual(text)
    })

    it('should return the same string if no quote exists', () => {
        const quoteProcessor = new QuoteProcessor()
        const text = `This is${quoteProcessor.quoteStart.slice(0, quoteProcessor.quoteStart.length - 1)} a test.`
        const targetText = quoteProcessor.processText(text)
        expect(targetText).toEqual(text)
    })

    it('do not remove the sub part of quote', () => {
        const quoteProcessor = new QuoteProcessor()
        const text = `This is${quoteProcessor.quoteStart.slice(0, quoteProcessor.quoteStart.length - 1)} a test.`
        const targetText = quoteProcessor.processText(quoteProcessor.quoteStart + text + quoteProcessor.quoteEnd)
        expect(targetText).toEqual(text)
    })

    it('do not remove the sub part of quote', () => {
        const quoteProcessor = new QuoteProcessor()
        const text = `This is${quoteProcessor.quoteEnd.slice(0, quoteProcessor.quoteEnd.length - 1)} a test.`
        const targetText = quoteProcessor.processText(quoteProcessor.quoteStart + text + quoteProcessor.quoteEnd)
        expect(targetText).toEqual(text)
    })

    it('do not remove the sub part of quote', () => {
        const quoteProcessor = new QuoteProcessor()
        const text = `This is${quoteProcessor.quoteStart.slice(
            0,
            quoteProcessor.quoteStart.length - 1
        )} a${quoteProcessor.quoteStart.slice(
            0,
            quoteProcessor.quoteStart.length - 2
        )} te${quoteProcessor.quoteEnd.slice(0, quoteProcessor.quoteEnd.length - 1)}st${quoteProcessor.quoteEnd.slice(
            0,
            quoteProcessor.quoteEnd.length - 2
        )}.`
        const targetText = quoteProcessor.processText(quoteProcessor.quoteStart + text + quoteProcessor.quoteEnd)
        expect(targetText).toEqual(text)
    })
})
