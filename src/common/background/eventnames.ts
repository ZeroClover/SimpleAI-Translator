import { IHistoryInternalService } from '../internal-services/history'

export const BackgroundEventNames = {
    fetch: 'fetch',
    historyService: 'historyService',
}

export type BackgroundHistoryServiceMethodNames = keyof IHistoryInternalService
