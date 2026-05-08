import { getLocalDB, HistoryItem } from './db'
import { LangCode } from '../lang'

export interface CreateHistoryItem {
    sourceText: string
    translatedText: string
    fromLang: LangCode
    toLang: LangCode
    providerId: string
    model: string
}

export interface UpdateHistoryPayload {
    translatedText?: string
}

export interface HistoryQueryOptions {
    search?: string
    fromLang?: LangCode
    toLang?: LangCode
    limit?: number
}

export interface IHistoryInternalService {
    create(item: CreateHistoryItem): Promise<HistoryItem>
    update(id: number, payload: UpdateHistoryPayload): Promise<void>
    delete(id: number): Promise<void>
    clear(): Promise<void>
    list(options?: HistoryQueryOptions): Promise<HistoryItem[]>
    get(id: number): Promise<HistoryItem | undefined>
}

class HistoryInternalService implements IHistoryInternalService {
    private get db() {
        return getLocalDB()
    }

    async create(item: CreateHistoryItem): Promise<HistoryItem> {
        const now = Date.now()
        const history: HistoryItem = {
            createdAt: now,
            ...item,
        }
        const id = await this.db.history.add(history)
        history.id = id as number
        return history
    }

    async update(id: number, payload: UpdateHistoryPayload): Promise<void> {
        await this.db.history.update(id, payload)
    }

    async delete(id: number): Promise<void> {
        await this.db.history.delete(id)
    }

    async clear(): Promise<void> {
        await this.db.history.clear()
    }

    async get(id: number): Promise<HistoryItem | undefined> {
        return await this.db.history.get(id)
    }

    async list(options: HistoryQueryOptions = {}): Promise<HistoryItem[]> {
        const { search, fromLang, toLang, limit } = options
        const normalizedSearch = search?.trim().toLowerCase()
        let collection = this.db.history.orderBy('createdAt').reverse()
        if (fromLang) {
            collection = collection.filter((item) => item.fromLang === fromLang)
        }
        if (toLang) {
            collection = collection.filter((item) => item.toLang === toLang)
        }
        if (normalizedSearch) {
            collection = collection.filter((item) => {
                return (
                    item.sourceText.toLowerCase().includes(normalizedSearch) ||
                    item.translatedText.toLowerCase().includes(normalizedSearch) ||
                    item.providerId.toLowerCase().includes(normalizedSearch) ||
                    item.model.toLowerCase().includes(normalizedSearch)
                )
            })
        }
        if (limit !== undefined) {
            collection = collection.limit(limit)
        }
        return await collection.toArray()
    }
}

export const historyInternalService = new HistoryInternalService()
