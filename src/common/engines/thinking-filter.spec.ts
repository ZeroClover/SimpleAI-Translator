import { describe, expect, it } from 'vitest'
import { ThinkingFilter } from './thinking-filter'

function filterChunks(chunks: string[]): string {
    const filter = new ThinkingFilter()
    return chunks.map((chunk) => filter.push(chunk)).join('') + filter.finish()
}

describe('ThinkingFilter', () => {
    it('filters thinking tags split across chunks', () => {
        expect(filterChunks(['<thi', 'nking>hidden</thinking>text'])).toBe('text')
    })

    it('drops an unclosed thinking block at stream end', () => {
        expect(filterChunks(['visible', '<thinking>hidden'])).toBe('visible')
    })

    it('filters repeated thinking blocks', () => {
        expect(filterChunks(['<thinking>A</thinking>text<thinking>B</thinking>more'])).toBe('textmore')
    })

    it('matches tag case and whitespace variants', () => {
        expect(filterChunks(['< Thinking >hidden</ THINKING >text'])).toBe('text')
    })

    it('treats nested thinking tags as one hidden block', () => {
        expect(filterChunks(['<thinking>A<thinking>B</thinking>C</thinking>text'])).toBe('text')
    })

    it('passes normal text without thinking tags', () => {
        expect(filterChunks(['plain ', 'text <not-thinking>ok'])).toBe('plain text <not-thinking>ok')
    })
})
