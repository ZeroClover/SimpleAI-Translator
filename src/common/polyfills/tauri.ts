/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Channel } from '@tauri-apps/api/core'
import { IBrowser, ISettings } from '../types'
import { commands, type ProxyConfig } from '@/tauri/bindings'

async function getSettings(): Promise<Record<string, any>> {
    const settings = await commands.getConfigContent()
    return JSON.parse(settings)
}

// The native side merges each update into config.json under one lock, so saves from different
// windows never overwrite each other's keys.
async function updateSettings(items: Record<string, any>): Promise<void> {
    const result = await commands.updateConfig(JSON.stringify(items))
    if (result.status === 'error') {
        throw new Error(result.error)
    }
}

class BrowserStorageSync {
    async get(keys: string[]): Promise<Record<string, any>> {
        const settings = await getSettings()
        return keys.reduce((acc, key) => {
            return {
                ...acc,
                [key]: settings[key],
            }
        }, {})
    }

    // JSON serialization drops undefined values, so they leave stored keys untouched.
    async set(items: Record<string, any>): Promise<void> {
        await updateSettings(items)
    }
}

class BrowserStorage {
    sync: BrowserStorageSync

    constructor() {
        this.sync = new BrowserStorageSync()
    }
}

class BrowserRuntimeOnMessage {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    addListener(_callback: (message: any, sender: any, sendResponse: any) => void): void {}
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    removeListener(_callback: (message: any, sender: any, sendResponse: any) => void): void {}
}

class BrowserRuntime {
    onMessage: BrowserRuntimeOnMessage

    constructor() {
        this.onMessage = new BrowserRuntimeOnMessage()
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    sendMessage(_message: any): void {}

    getURL(path: string): string {
        return path
    }
}

class BrowserI18n {
    detectLanguage(_text: string): Promise<{ languages: { language: string; percentage: number }[] }> {
        return new Promise((resolve) => {
            resolve({
                languages: [],
            })
        })
    }
}

class Browser implements IBrowser {
    storage: BrowserStorage
    runtime: BrowserRuntime
    i18n: BrowserI18n

    constructor() {
        this.storage = new BrowserStorage()
        this.runtime = new BrowserRuntime()
        this.i18n = new BrowserI18n()
    }
}

export const tauriBrowser = new Browser()

function toProxyConfig(proxy: NonNullable<ISettings['proxy']>): ProxyConfig {
    return {
        enabled: proxy.enabled ?? null,
        protocol: proxy.protocol ?? null,
        server: proxy.server ?? null,
        port: proxy.port ?? null,
        basicAuth: proxy.basicAuth
            ? { username: proxy.basicAuth.username ?? null, password: proxy.basicAuth.password ?? null }
            : null,
        noProxy: proxy.noProxy ?? null,
    }
}

// Status codes whose responses must not carry a body.
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304])

/**
 * A `fetch` backed by the native `fetch` command. Requests use the stored proxy settings unless
 * `init.proxy` overrides them. Aborting `init.signal` or cancelling the body stops the native
 * request and closes its connection.
 */
export async function tauriFetch(
    input: string,
    init: RequestInit & { proxy?: ISettings['proxy'] } = {}
): Promise<Response> {
    const { signal } = init
    signal?.throwIfAborted()
    const id = crypto.randomUUID()
    const body = init.body === undefined || init.body === null ? null : await new Response(init.body).text()
    let controller!: ReadableStreamDefaultController<Uint8Array>
    let finished = false
    const finish = () => {
        finished = true
        signal?.removeEventListener('abort', abort)
    }
    const cancel = () => {
        if (!finished) {
            finish()
            void commands.fetchCancel(id)
        }
    }
    const stream = new ReadableStream<Uint8Array>({
        start(streamController) {
            controller = streamController
        },
        cancel,
    })
    let rejectResponse: (reason: unknown) => void = () => {}
    function abort() {
        rejectResponse(signal?.reason)
        controller.error(signal?.reason)
        cancel()
    }
    signal?.addEventListener('abort', abort, { once: true })

    const onBody = new Channel<unknown>((message) => {
        if (finished) {
            return
        }
        // Body chunks arrive as an ArrayBuffer; the end of the body as `{ done: true }` or `{ error }`.
        const { done, error } = message as { done?: true; error?: string }
        if (error !== undefined) {
            finish()
            controller.error(new TypeError(error))
        } else if (done) {
            finish()
            controller.close()
        } else {
            controller.enqueue(new Uint8Array(message as ArrayBuffer))
        }
    })

    return new Promise<Response>((resolve, reject) => {
        rejectResponse = reject
        commands
            .fetch(
                {
                    id,
                    method: init.method ?? 'GET',
                    url: input,
                    headers: Array.from(new Headers(init.headers).entries()),
                    body,
                    proxy: init.proxy ? toProxyConfig(init.proxy) : null,
                },
                onBody
            )
            .then((result) => {
                if (result.status === 'error') {
                    finish()
                    reject(signal?.aborted ? signal.reason : new TypeError(result.error))
                    return
                }
                const { status, statusText, headers } = result.data
                resolve(new Response(NULL_BODY_STATUSES.has(status) ? null : stream, { status, statusText, headers }))
            }, reject)
    })
}
