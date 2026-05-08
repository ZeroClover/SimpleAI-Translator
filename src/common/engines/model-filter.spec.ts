import { describe, expect, it } from 'vitest'

import { filterChatModels, filterTTSModels } from './model-filter'

describe('model-filter', () => {
    it('filters standard OpenAI non-chat models while preserving order', () => {
        expect(
            filterChatModels([
                'gpt-4o',
                'gpt-4o-mini',
                'gpt-4o-realtime-preview',
                'text-embedding-3-small',
                'whisper-1',
                'tts-1',
                'dall-e-3',
                'omni-moderation-latest',
                'o3-mini',
            ])
        ).toEqual(['gpt-4o', 'gpt-4o-mini', 'o3-mini'])
    })

    it('keeps unknown future chat model prefixes', () => {
        expect(filterChatModels(['sonoma-translator-2099'])).toEqual(['sonoma-translator-2099'])
    })

    it('filters chat models case-insensitively', () => {
        expect(filterChatModels(['Whisper-Large-V3', 'TTS-1-HD', 'GPT-4O'])).toEqual(['GPT-4O'])
    })

    it('allows only supported TTS model ids by default', () => {
        expect(
            filterTTSModels([
                'gpt-4o',
                'gpt-4o-mini',
                'tts-1',
                'tts-1-hd',
                'gpt-4o-mini-tts',
                'gpt-4o-mini-tts-2025-12-15',
                'gpt-4o-tts',
                'whisper-1',
                'text-embedding-3-small',
            ])
        ).toEqual(['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'])
    })
})
