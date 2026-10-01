import { describe, expect, it } from 'vitest'
import {
    ANTHROPIC_MESSAGES_API_PATH,
    normalizeAPIEndpoint,
    OPENAI_AUDIO_SPEECH_API_PATH,
    OPENAI_CHAT_COMPLETIONS_API_PATH,
    OPENAI_RESPONSES_API_PATH,
} from './openai-api-path'

describe('openai-api-path', () => {
    it('normalizes base endpoints', () => {
        expect(normalizeAPIEndpoint('https://api.openai.com', OPENAI_CHAT_COMPLETIONS_API_PATH)).toBe(
            'https://api.openai.com/v1/chat/completions'
        )
        expect(normalizeAPIEndpoint('https://api.example.com/v1', OPENAI_RESPONSES_API_PATH)).toBe(
            'https://api.example.com/v1/responses'
        )
    })

    it('keeps versioned base paths that are not /v1', () => {
        expect(
            normalizeAPIEndpoint(
                'https://generativelanguage.googleapis.com/v1beta/openai',
                OPENAI_CHAT_COMPLETIONS_API_PATH
            )
        ).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
        expect(
            normalizeAPIEndpoint(
                'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
                OPENAI_CHAT_COMPLETIONS_API_PATH
            )
        ).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
        expect(normalizeAPIEndpoint('https://ark.example.com/api/v3', OPENAI_CHAT_COMPLETIONS_API_PATH)).toBe(
            'https://ark.example.com/api/v3/chat/completions'
        )
        expect(normalizeAPIEndpoint('https://api.example.com/anthropic', ANTHROPIC_MESSAGES_API_PATH)).toBe(
            'https://api.example.com/anthropic/v1/messages'
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
