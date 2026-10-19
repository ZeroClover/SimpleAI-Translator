import { expect, type BrowserContext, type Page } from '@playwright/test'

export type Config = Record<string, unknown>

export interface NativeRequest {
    url: string
    method: string
    headers: [string, string][]
    body: string | null
}

// Boots the real desktop renderer with only the native IPC boundary replaced. The `fetch`
// command parks each request until the test answers it and streams the body through the real
// Channel; events are routed between the windows of one context like the native event bus.
const BOOTSTRAP = (label: string) => `
    import { mockIPC, mockWindows } from '/node_modules/@tauri-apps/api/mocks.js';
    mockWindows(${JSON.stringify(label)});
    window.__TAURI__ = {};
    const internals = window.__TAURI_INTERNALS__;
    const listeners = new Map();
    window.deliverEvent = ({ event, payload }) =>
        (listeners.get(event) ?? []).forEach((handler) => internals.runCallback(handler, { event, payload }));
    const native = (window.native = { fetches: [], cancelled: [] });
    native.reply = (n, status, headers) => native.fetches[n].resolve({ status, statusText: '', headers });
    native.send = (n, message) => {
        const fetch = native.fetches[n];
        internals.runCallback(fetch.channel.id, { index: fetch.sent++, message });
    };
    mockIPC((cmd, args) => {
        switch (cmd) {
            case 'get_config_content': return window.readConfig();
            case 'update_config': return window.updateConfig(args.setJson).then(() => null);
            case 'plugin:event|listen':
                listeners.set(args.event, [...(listeners.get(args.event) ?? []), args.handler]);
                return args.handler;
            case 'plugin:event|unlisten':
                listeners.set(args.event, (listeners.get(args.event) ?? []).filter((id) => id !== args.eventId));
                return null;
            case 'plugin:event|emit':
                window.deliverEvent(args);
                return window.broadcastEvent(args);
            case 'fetch':
                return new Promise((resolve) =>
                    native.fetches.push({ ...args.request, channel: args.onBody, sent: 0, resolve })
                );
            case 'fetch_cancel':
                native.cancelled.push(native.fetches.findIndex((fetch) => fetch.id === args.id));
                return null;
            case 'plugin:autostart|is_enabled': return false;
        }
        return null;
    });
    await import('/src/tauri/index.tsx?actual');
`

// One config file per browser context, shared by its windows: like the native update_config
// command, an update merges the written keys into the file.
export async function desktop(context: BrowserContext, config: Config = {}) {
    let file = config
    await context.exposeFunction('readConfig', () => JSON.stringify(file))
    await context.exposeFunction('updateConfig', (setJson: string) => {
        file = { ...file, ...JSON.parse(setJson) }
    })
    await context.exposeBinding('broadcastEvent', async ({ page }, event) => {
        for (const other of context.pages()) {
            if (other !== page) await other.evaluate((e) => window.deliverEvent?.(e), event)
        }
    })
    return {
        async open(label = 'translator', page?: Page) {
            page ??= await context.newPage()
            await page.route(/\/src\/tauri\/index\.tsx$/, (route) =>
                route.fulfill({ contentType: 'text/javascript', body: BOOTSTRAP(label) })
            )
            await page.goto('http://127.0.0.1:3333/src/tauri/index.html')
            return page
        },
    }
}

// The n-th (0-based) native fetch, once the renderer has sent it.
export async function nativeFetch(page: Page, n: number) {
    await expect.poll(() => page.evaluate(() => window.native.fetches.length)).toBeGreaterThan(n)
    const request = await page.evaluate((n) => {
        const { url, method, headers, body } = window.native.fetches[n]
        return { url, method, headers, body }
    }, n)
    return { ...request, json: request.body ? JSON.parse(request.body) : undefined }
}

export function fetchCount(page: Page) {
    return page.evaluate(() => window.native.fetches.length)
}

export function cancelledFetches(page: Page) {
    return page.evaluate(() => window.native.cancelled)
}

// Answers the n-th fetch with a response head, then sends each chunk (text, or raw bytes) as a
// Channel message and ends the body unless `end` is false.
export async function reply(
    page: Page,
    n: number,
    { status = 200, type = 'text/event-stream', chunks = [] as Array<string | number[]>, end = true } = {}
) {
    await nativeFetch(page, n)
    await page.evaluate(
        ({ n, status, type, chunks, end }) => {
            if (status) window.native.reply(n, status, [['content-type', type]])
            for (const chunk of chunks) {
                const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)
                window.native.send(n, bytes.buffer)
            }
            if (end) window.native.send(n, { done: true })
        },
        { n, status, type, chunks, end }
    )
}

// Further body chunks for a fetch already answered by `reply(..., { end: false })`.
export function send(page: Page, n: number, chunks: Array<string | number[]>, end = false) {
    return reply(page, n, { status: 0, chunks, end })
}

export const sse = (...events: unknown[]) =>
    events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join('')

export const chatDelta = (content: string) => ({ choices: [{ delta: { content } }] })

// Translated texts stored in the real history database.
export function historyTexts(page: Page) {
    return page.evaluate(
        () =>
            new Promise<string[]>((resolve, reject) => {
                const open = indexedDB.open('simpleai-translator')
                open.onerror = () => reject(open.error)
                open.onsuccess = () => {
                    const db = open.result
                    if (!db.objectStoreNames.contains('history')) return resolve([])
                    const request = db.transaction('history').objectStore('history').getAll()
                    request.onsuccess = () => resolve(request.result.map((item) => item.translatedText))
                    request.onerror = () => reject(request.error)
                }
            })
    )
}

declare global {
    interface Window {
        readConfig(): Promise<string>
        updateConfig(setJson: string): Promise<void>
        broadcastEvent(event: unknown): Promise<void>
        deliverEvent(event: unknown): void
        native: {
            fetches: Array<NativeRequest & { id: string; sent: number }>
            cancelled: number[]
            reply(n: number, status: number, headers: [string, string][]): void
            send(n: number, message: ArrayBuffer | { done: true }): void
        }
    }
}
