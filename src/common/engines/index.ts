import { ProviderConfig } from '../types'
import { AnthropicEngine } from './protocols/anthropic'
import { OpenAIChatEngine } from './protocols/openai-chat'
import { OpenAIResponsesEngine } from './protocols/openai-responses'
import { IEngine } from './interfaces'

export function getEngine(providerConfig: ProviderConfig): IEngine {
    switch (providerConfig.protocol) {
        case 'openai-chat':
            return new OpenAIChatEngine(providerConfig)
        case 'openai-responses':
            return new OpenAIResponsesEngine(providerConfig)
        case 'anthropic':
            return new AnthropicEngine(providerConfig)
    }
}
