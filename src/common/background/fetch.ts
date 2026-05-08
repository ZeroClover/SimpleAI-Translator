import { isFirefox } from '../utils'
import { BackgroundEventNames } from './eventnames'
import { ReadableStream as ReadableStreamPolyfill } from 'web-streams-polyfill/ponyfill'

export interface BackgroundFetchRequestMessage {
    type: 'open' | 'abort'
    details?: { url: string; options: RequestInit }
}

export interface BackgroundFetchResponseMessage
    extends Pick<Response, 'ok' | 'status' | 'statusText' | 'redirected' | 'type' | 'url'> {
    error?: { message: string; name: string }
    status: number
    data?: number[]
}

export function getHostPermissionOrigin(input: string): string | undefined {
    try {
        const url = new URL(input)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return undefined
        }
        return `${url.origin}/*`
    } catch {
        return undefined
    }
}

async function ensureHostPermission(input: string) {
    const origin = getHostPermissionOrigin(input)
    if (!origin) {
        return
    }

    const browser = (await import('webextension-polyfill')).default
    const permissions = browser.permissions
    if (!permissions) {
        return
    }

    const granted = await permissions.contains({ origins: [origin] })
    if (granted) {
        return
    }

    const accepted = await permissions.request({ origins: [origin] })
    if (!accepted) {
        throw new DOMException(`Host permission denied for ${origin}`, 'NotAllowedError')
    }
}

function createResponse(stream: ReadableStream, init: BackgroundFetchResponseMessage): Response {
    return new Response(stream, {
        status: init.status,
        statusText: init.statusText,
    })
}

export async function backgroundFetch(input: string, options: RequestInit) {
    return new Promise<Response>((resolve, reject) => {
        ;(async () => {
            const { signal, ...fetchOptions } = options
            if (signal?.aborted) {
                reject(new DOMException('Aborted', 'AbortError'))
                return
            }

            try {
                await ensureHostPermission(input)
            } catch (error) {
                reject(error)
                return
            }

            const ReadableStream = isFirefox()
                ? (ReadableStreamPolyfill as typeof window.ReadableStream)
                : window.ReadableStream
            let resolved = false
            const browser = (await import('webextension-polyfill')).default
            const port = browser.runtime.connect({ name: BackgroundEventNames.fetch })
            const message: BackgroundFetchRequestMessage = {
                type: 'open',
                details: { url: input, options: fetchOptions },
            }

            const readableStream = new ReadableStream({
                start(controller) {
                    port.onMessage.addListener((msg: BackgroundFetchResponseMessage) => {
                        const { data, error, ...restResp } = msg
                        if (error) {
                            const e = new Error()
                            e.message = error.message
                            e.name = error.name
                            if (!resolved) {
                                reject(e)
                                resolved = true
                                return
                            }
                            controller.error(e)
                            return
                        }
                        if (!resolved) {
                            resolve(createResponse(readableStream, restResp))
                            resolved = true
                        }
                        if (data) {
                            controller.enqueue(new Uint8Array(data))
                        }
                    })

                    port.onDisconnect.addListener(() => {
                        signal?.removeEventListener('abort', handleAbort)
                        try {
                            controller.close()
                        } catch (e) {
                            // may throw if controller is errored
                        }
                    })

                    port.postMessage(message)
                },
            })

            function handleAbort() {
                port.postMessage({ type: 'abort' })
            }
            signal?.addEventListener('abort', handleAbort)
        })()
    })
}
