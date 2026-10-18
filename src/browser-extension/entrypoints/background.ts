/* eslint-disable no-case-declarations */
import browser from 'webextension-polyfill'
import { defineBackground } from 'wxt/utils/define-background'
import { BackgroundEventNames } from '../../common/background/eventnames'
import { BackgroundFetchRequestMessage, BackgroundFetchResponseMessage } from '../../common/background/fetch'
import { historyInternalService } from '../../common/internal-services/history'

export default defineBackground(() => {
    browser.contextMenus?.create(
        {
            id: 'open-translator',
            type: 'normal',
            title: 'SimpleAI Translator',
            contexts: ['page', 'selection'],
        },
        () => {
            // Reading lastError marks the duplicate-id error of a restarted worker as handled.
            void browser.runtime.lastError
        }
    )

    browser.contextMenus?.onClicked.addListener(async function (info) {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
        if (tab.id) {
            void browser.tabs.sendMessage(tab.id, {
                type: 'open-translator',
                info,
            })
        }
    })

    async function fetchWithStream(
        port: browser.Runtime.Port,
        message: BackgroundFetchRequestMessage,
        signal: AbortSignal
    ) {
        if (!message.details) {
            throw new Error('No fetch details')
        }

        const { url, options } = message.details
        let response: Response | null = null

        try {
            response = await fetch(url, { ...options, signal })
        } catch (error) {
            if (error instanceof Error) {
                const { message, name } = error
                port.postMessage({
                    error: { message, name },
                })
            }
            port.disconnect()
            return
        }

        const responseSend: BackgroundFetchResponseMessage = {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            redirected: response.redirected,
            type: response.type,
            url: response.url,
            headers: Array.from(response.headers.entries()),
        }

        // Send the response head first so an empty body still resolves the request.
        port.postMessage(responseSend)
        const reader = response?.body?.getReader()
        if (!reader) {
            port.disconnect()
            return
        }

        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) {
                    break
                }
                port.postMessage({
                    ...responseSend,
                    data: Array.from(value),
                })
            }
        } catch (error) {
            if (error instanceof Error) {
                const { message, name } = error
                port.postMessage({
                    error: { message, name },
                })
            }
        } finally {
            port.disconnect()
            reader.releaseLock()
        }
    }

    browser.runtime.onConnect.addListener(async function (port) {
        switch (port.name) {
            case BackgroundEventNames.fetch:
                const controller = new AbortController()
                const { signal } = controller

                port.onMessage.addListener(function (data) {
                    const message = data as BackgroundFetchRequestMessage
                    switch (message.type) {
                        case 'abort':
                            controller.abort()
                            break
                        case 'open':
                            fetchWithStream(port, message, signal)
                            break
                    }
                })
                return
        }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function callMethod(request: any, service: any): Promise<any> {
        const { method, args } = request
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = (service as any)[method](...args)
        if (result instanceof Promise) {
            const v = await result
            return { result: v }
        }
        return { result }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    browser.runtime.onMessage.addListener(async (request: any) => {
        switch (request.type) {
            case BackgroundEventNames.historyService:
                return await callMethod(request, historyInternalService)
            case 'openOptionsPage':
                browser.runtime.openOptionsPage()
                return
        }
    })
})
