import { IHistoryInternalService, historyInternalService } from '../internal-services/history'
import { isTauri } from '../utils'
import { backgroundHistoryService } from '../background/services/history'

export const historyService: IHistoryInternalService = isTauri() ? historyInternalService : backgroundHistoryService
