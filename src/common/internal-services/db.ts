import Dexie, { Table } from 'dexie'
import { LangCode } from '../lang'

export interface HistoryItem {
    id?: number
    createdAt: number
    fromLang: LangCode
    toLang: LangCode
    sourceText: string
    translatedText: string
    providerId: string
    model: string
}

export class LocalDB extends Dexie {
    history!: Table<HistoryItem>

    constructor() {
        super('openai-translator')
        this.version(6)
            .stores({
                vocabulary: null,
                action: null,
                history: '++id, createdAt, fromLang, toLang, providerId, model',
            })
            .upgrade(async (tx) => {
                await tx.table('history').clear()
            })
    }
}

let localDB: LocalDB

export const getLocalDB = () => {
    if (!localDB) {
        localDB = new LocalDB()
    }
    return localDB
}
