import { IHistoryInternalService } from '../internal-services/history'

export const BackgroundEventNames = {
    fetch: 'fetch',
    actionService: 'actionService',
    historyService: 'historyService',
    getItem: 'getItem',
    setItem: 'setItem',
    removeItem: 'removeItem',
}

export type BackgroundHistoryServiceMethodNames = keyof IHistoryInternalService
