import { ProviderConfig, ThinkingControl } from '../types'
import { AnthropicEngine } from './protocols/anthropic'
import { OpenAIChatEngine } from './protocols/openai-chat'
import { OpenAIResponsesEngine } from './protocols/openai-responses'
import { IEngine } from './interfaces'

export type EngineProviderConfig = ProviderConfig & ThinkingControl

export function getEngine(providerConfig: EngineProviderConfig): IEngine {
    switch (providerConfig.protocol) {
        case 'openai-chat':
            return new OpenAIChatEngine(providerConfig)
        case 'openai-responses':
            return new OpenAIResponsesEngine(providerConfig)
        case 'anthropic':
            return new AnthropicEngine(providerConfig)
    }
}
