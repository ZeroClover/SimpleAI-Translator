import { describe, expect, it } from 'vitest'
import {
    ANTHROPIC_MESSAGES_API_PATH,
    getRecommendedOpenAIAPIPath,
    isResponsesCapableOpenAIModel,
    normalizeAPIEndpoint,
    OPENAI_AUDIO_SPEECH_API_PATH,
    OPENAI_CHAT_COMPLETIONS_API_PATH,
    OPENAI_RESPONSES_API_PATH,
} from './openai-api-path'

describe('openai-api-path', () => {
    it('detects responses-capable models', () => {
        expect(isResponsesCapableOpenAIModel('gpt-5-nano')).toBe(true)
        expect(isResponsesCapableOpenAIModel('gpt-4o')).toBe(true)
        expect(isResponsesCapableOpenAIModel('o3-mini')).toBe(true)
        expect(isResponsesCapableOpenAIModel('gpt-4')).toBe(false)
    })

    it('returns recommended api path by model', () => {
        expect(getRecommendedOpenAIAPIPath('gpt-5-nano')).toBe(OPENAI_RESPONSES_API_PATH)
        expect(getRecommendedOpenAIAPIPath('gpt-4')).toBe(OPENAI_CHAT_COMPLETIONS_API_PATH)
        expect(getRecommendedOpenAIAPIPath(undefined)).toBe(OPENAI_CHAT_COMPLETIONS_API_PATH)
    })

    it('normalizes base endpoints', () => {
        expect(normalizeAPIEndpoint('https://api.openai.com', OPENAI_CHAT_COMPLETIONS_API_PATH)).toBe(
            'https://api.openai.com/v1/chat/completions'
        )
        expect(normalizeAPIEndpoint('https://api.example.com/v1', OPENAI_RESPONSES_API_PATH)).toBe(
            'https://api.example.com/v1/responses'
        )
    })

    it('does not duplicate complete endpoint paths', () => {
        expect(
            normalizeAPIEndpoint('https://api.example.com/v1/chat/completions', OPENAI_CHAT_COMPLETIONS_API_PATH)
        ).toBe('https://api.example.com/v1/chat/completions')
        expect(normalizeAPIEndpoint('https://api.example.com/v1/responses', OPENAI_RESPONSES_API_PATH)).toBe(
            'https://api.example.com/v1/responses'
        )
        expect(
            normalizeAPIEndpoint(
                'https://api.anthropic.com/v1/messages',
                ANTHROPIC_MESSAGES_API_PATH,
                'https://api.anthropic.com'
            )
        ).toBe('https://api.anthropic.com/v1/messages')
        expect(normalizeAPIEndpoint('https://api.example.com/v1/audio/speech', OPENAI_AUDIO_SPEECH_API_PATH)).toBe(
            'https://api.example.com/v1/audio/speech'
        )
    })

    it('can retarget a complete endpoint path', () => {
        expect(normalizeAPIEndpoint('https://api.example.com/v1/chat/completions', OPENAI_RESPONSES_API_PATH)).toBe(
            'https://api.example.com/v1/responses'
        )
    })
})
