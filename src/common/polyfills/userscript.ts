/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { IBrowser } from '../types'

class BrowserStorageSync {
    async get(keys: string[]): Promise<Record<string, any>> {
        const result: Record<string, any> = {}
        for (const key of keys) {
            result[key] = await GM.getValue(key, null)
        }
        return result
    }

    async set(items: Record<string, any>): Promise<void> {
        await Promise.all(
            Object.entries(items)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => GM.setValue(key, value))
        )
    }

    async remove(keys: string[]): Promise<void> {
        await Promise.all(keys.map((key) => GM.deleteValue(key)))
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
        return GM_getResourceURL(path)
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

export const userscriptBrowser = new Browser()

function parseResponseHeaders(rawHeaders: string): Headers {
    const headers = new Headers()
    for (const line of rawHeaders.split(/\r?\n/)) {
        const separator = line.indexOf(':')
        if (separator <= 0) {
            continue
        }
        try {
            headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim())
        } catch {
            // Skip header lines the Headers API rejects.
        }
    }
    return headers
}

export async function userscriptFetch(url: string, { body, headers, method, signal }: RequestInit): Promise<Response> {
    // eslint-disable-next-line camelcase
    const isSupportStreaming = (GM_xmlhttpRequest as any)?.RESPONSE_TYPE_STREAM === 'stream' ? true : false
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'))
            return
        }
        let settled = false
        const settle = (r: Tampermonkey.Response<any>, responseBody: BodyInit | null) => {
            if (settled) {
                return
            }
            settled = true
            try {
                resolve(
                    new Response(responseBody, {
                        status: r.status,
                        statusText: r.statusText,
                        headers: parseResponseHeaders(r.responseHeaders ?? ''),
                    })
                )
            } catch (error) {
                reject(error)
            }
        }
        const fail = (error: Error) => {
            if (!settled) {
                settled = true
                reject(error)
            }
        }
        const handle = GM_xmlhttpRequest({
            url,
            data: body as string,
            headers: headers as any,
            method: method as any,
            responseType: (isSupportStreaming ? 'stream' : 'text') as any,
            onreadystatechange: (r) => {
                if (isSupportStreaming) {
                    if (r.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
                        settle(r, r.response as ReadableStream<Uint8Array>)
                    }
                } else if (r.readyState === XMLHttpRequest.DONE) {
                    settle(r, r.responseText ?? r.response)
                }
            },
            onerror: () => fail(new Error('The userscript request failed.')),
            onabort: () => fail(new DOMException('Aborted', 'AbortError')),
        })
        signal?.addEventListener('abort', () => {
            handle.abort()
            fail(new DOMException('Aborted', 'AbortError'))
        })
    })
}
