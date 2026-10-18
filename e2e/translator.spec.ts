/* eslint-disable camelcase */
import { expect, test, type Page } from '@playwright/test'

interface TranslatorTestWindow extends Window {
    translationRequests: string[]
    translationRuns: Array<{
        push(content: string, isFullText?: boolean): void
        error(message: string): void
        finish(reason: string): void
    }>
}

const CONFIG = {
    i18n: 'en',
    languageDetectionEngine: 'local',
    providers: [{ id: 'test', name: 'Test', protocol: 'openai-chat', apiKey: 'test', model: 'test-model' }],
    defaultModel: { providerId: 'test', model: 'test-model' },
    defaultProviderId: 'test',
}

async function openTranslator(page: Page, controlled = false) {
    await page.route(/\/src\/tauri\/index\.tsx$/, (route) =>
        route.fulfill({
            contentType: 'text/javascript',
            body: `
            import { mockIPC, mockWindows } from '/node_modules/@tauri-apps/api/mocks.js';
            mockWindows('translator');
            window.__TAURI__ = {};
            window.translationRequests = [];
            window.translationRuns = [];
            mockIPC((cmd) => {
                if (cmd === 'get_config_content') return ${JSON.stringify(JSON.stringify(CONFIG))};
            }, { shouldMockEvents: true });
            await import('/src/tauri/index.tsx?actual');
        `,
        })
    )
    await page.route(/\/src\/common\/translate\.ts$/, (route) =>
        route.fulfill({
            contentType: 'text/javascript',
            body: `
            export { getTranslationCacheKey, resolveTranslationModel } from '/src/common/translate.ts?actual';
            export async function translate(req) {
                window.translationRequests.push(req.text);
                if (${controlled}) return new Promise(resolve => {
                    window.translationRuns.push({
                        push: (content, isFullText = false) => req.onMessage({ content, isFullText }),
                        error: message => req.onError(message),
                        finish: reason => { req.onFinish(reason); resolve(); }
                    });
                });
                await req.onMessage({ content: 'Translated: ' + req.text, isFullText: true });
                req.onFinish('stop');
            }
        `,
        })
    )
    await page.goto('http://127.0.0.1:3333/src/tauri/index.html')
    await expect(page.locator('textarea')).toBeVisible()
}

interface NativeStream {
    body: Record<string, unknown>
    status(status: number, contentType: string): Promise<void>
    chunk(data: string): Promise<void>
    end(): Promise<void>
}

interface EngineTestWindow extends Window {
    nativeStreams: NativeStream[]
    fallbackRequests: Array<Record<string, unknown>>
    fallbackResponse: { status: number; body: unknown }
}

// Runs the real translate() and protocol engine. Only the native boundary is mocked: the
// desktop streaming command (driven by the test) and the non-streaming fetch.
async function openStructuredTranslator(page: Page) {
    const config = {
        ...CONFIG,
        providerModelOutputControls: [{ providerId: 'test', model: 'test-model', useStructuredOutput: true }],
    }
    await page.route(/\/src\/tauri\/index\.tsx$/, (route) =>
        route.fulfill({
            contentType: 'text/javascript',
            body: `
            import { mockIPC, mockWindows } from '/node_modules/@tauri-apps/api/mocks.js';
            import { emit } from '/node_modules/@tauri-apps/api/event.js';
            mockWindows('translator');
            window.__TAURI__ = {};
            window.nativeStreams = [];
            window.fallbackRequests = [];
            mockIPC((cmd, args) => {
                if (cmd === 'get_config_content') return ${JSON.stringify(JSON.stringify(config))};
                if (cmd === 'fetch_stream') {
                    return new Promise((resolve) => {
                        let status = 200;
                        window.nativeStreams.push({
                            body: JSON.parse(JSON.parse(args.optionsStr).body),
                            status: async (code, contentType) => {
                                status = code;
                                await emit('fetch-stream-status-code', { id: args.id, status: code, contentType });
                            },
                            chunk: (data) => emit('fetch-stream-chunk', { id: args.id, data, done: false, status }),
                            end: async () => {
                                await emit('fetch-stream-chunk', { id: args.id, data: '', done: true, status });
                                resolve('');
                            },
                        });
                    });
                }
            }, { shouldMockEvents: true });
            await import('/src/tauri/index.tsx?actual');
        `,
        })
    )
    await page.route(/\/src\/common\/universal-fetch\.ts$/, (route) =>
        route.fulfill({
            contentType: 'text/javascript',
            body: `
            export function getUniversalFetch() {
                return async (_url, init) => {
                    if (init?.method !== 'POST') return new Response('{}', { status: 404 });
                    window.fallbackRequests.push(JSON.parse(init.body));
                    const { status, body } = window.fallbackResponse;
                    return new Response(JSON.stringify(body), {
                        status,
                        headers: { 'Content-Type': 'application/json' },
                    });
                };
            }
        `,
        })
    )
    await page.goto('http://127.0.0.1:3333/src/tauri/index.html')
    await expect(page.locator('textarea')).toBeVisible()
}

async function nativeStreams(page: Page) {
    return page.evaluate(() => (window as unknown as EngineTestWindow).nativeStreams.length)
}

async function historyTexts(page: Page) {
    return page.evaluate(
        () =>
            new Promise<string[]>((resolve, reject) => {
                const open = indexedDB.open('simpleai-translator')
                open.onerror = () => reject(open.error)
                open.onsuccess = () => {
                    const db = open.result
                    if (!db.objectStoreNames.contains('history')) {
                        db.close()
                        resolve([])
                        return
                    }
                    const request = db.transaction('history').objectStore('history').getAll()
                    request.onsuccess = () => {
                        db.close()
                        resolve(request.result.map((item: { translatedText: string }) => item.translatedText))
                    }
                    request.onerror = () => reject(request.error)
                }
            })
    )
}

async function requests(page: Page) {
    return page.evaluate(() => (window as unknown as { translationRequests: string[] }).translationRequests)
}

test('Enter submits, Shift+Enter and composing Enter do not', async ({ page }) => {
    await openTranslator(page)
    const editor = page.locator('textarea')
    await editor.fill('First sentence')
    await editor.press('Shift+Enter')
    await expect(editor).toHaveValue('First sentence\n')
    await editor.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229 })
    expect(await requests(page)).toEqual([])
    await editor.press('Enter')
    await expect(page.getByText('Translated: First sentence', { exact: true })).toBeVisible()
    expect(await requests(page)).toHaveLength(1)
})

test('streaming flushes pending text on finish and replaces full-text results', async ({ page }) => {
    await openTranslator(page, true)
    await page.locator('textarea').fill('Stream test')
    await page.locator('textarea').press('Enter')
    await expect.poll(() => requests(page)).toHaveLength(1)
    await page.evaluate(() => {
        const run = (window as unknown as TranslatorTestWindow).translationRuns[0]
        run.push('first')
        run.push('second')
    })
    await expect(page.getByText('firstsecond', { exact: true })).toBeVisible()
    await page.evaluate(() => {
        const run = (window as unknown as TranslatorTestWindow).translationRuns[0]
        run.push('replacement', true)
        run.push(' tail')
        run.finish('stop')
    })
    await expect(page.getByText('replacement tail', { exact: true })).toBeVisible()
    await page.locator('textarea').press('Enter')
    await expect(page.getByText('replacement tail', { exact: true })).toBeVisible()
    expect(await requests(page)).toHaveLength(1)
})

test('an old stream cannot replace a new result and failed text is not cached', async ({ page }) => {
    await openTranslator(page, true)
    const editor = page.locator('textarea')
    await editor.fill('Old request')
    await editor.press('Enter')
    await expect.poll(() => requests(page)).toHaveLength(1)
    await page.evaluate(() => (window as unknown as TranslatorTestWindow).translationRuns[0].push('old pending'))
    await editor.fill('New request')
    await editor.press('Enter')
    await expect.poll(() => requests(page)).toHaveLength(2)
    await page.evaluate(() => {
        const runs = (window as unknown as TranslatorTestWindow).translationRuns
        runs[0].push('stale')
        runs[0].finish('stop')
        runs[1].push('new partial')
        runs[1].finish('error')
    })
    await expect(page.getByText('new partial', { exact: true })).toBeVisible()
    await expect(page.getByText('old pendingstale', { exact: true })).toHaveCount(0)
    await editor.press('Enter')
    await expect.poll(() => requests(page)).toHaveLength(3)
    await page.evaluate(() => (window as unknown as TranslatorTestWindow).translationRuns[2].finish('stop'))
})

test('restoring the same history does not swallow the next submission', async ({ page }) => {
    await openTranslator(page)
    const editor = page.locator('textarea')
    await editor.fill('First sentence')
    await editor.press('Enter')
    await expect(page.getByText('Translated: First sentence', { exact: true })).toBeVisible()
    await page.evaluate(async (eventModule) => {
        // The history window emits the same event when the user restores an entry.
        const { emit } = await import(eventModule)
        await emit('history:restore', {
            fromLang: 'en',
            toLang: 'zh-Hans',
            sourceText: 'First sentence',
            translatedText: 'Translated: First sentence',
            providerId: 'test',
            model: 'test-model',
        })
    }, '/node_modules/@tauri-apps/api/event.js')
    await editor.fill('Second sentence')
    await editor.press('Enter')
    await expect(page.getByText('Translated: Second sentence', { exact: true })).toBeVisible()
    expect(await requests(page)).toEqual(['First sentence', 'Second sentence'])
    await editor.press('Enter')
    await expect(page.getByText('Translated', { exact: true })).toBeVisible()
    expect(await requests(page)).toHaveLength(2)
})

test('full-text previews replace each other and a final empty snapshot clears them without caching', async ({
    page,
}) => {
    await openTranslator(page, true)
    const editor = page.locator('textarea')
    await editor.fill('Empty result')
    await editor.press('Enter')
    await expect.poll(() => requests(page)).toHaveLength(1)
    await page.evaluate(() => {
        const run = (window as unknown as TranslatorTestWindow).translationRuns[0]
        run.push('预览', true)
        run.push('预览更新', true)
    })
    await expect(page.getByText('预览更新', { exact: true })).toBeVisible()
    await expect(page.getByText('预览预览更新')).toHaveCount(0)
    await page.evaluate(() => {
        const run = (window as unknown as TranslatorTestWindow).translationRuns[0]
        run.push('', true)
        run.finish('stop')
    })
    await expect(page.getByText('预览更新')).toHaveCount(0)
    await editor.press('Enter')
    await expect.poll(() => requests(page)).toHaveLength(2)
    await page.evaluate(() => (window as unknown as TranslatorTestWindow).translationRuns[1].finish('stop'))
    expect(await historyTexts(page)).toEqual([])
})

test('a failed request keeps its preview and error but is not cached or saved', async ({ page }) => {
    await openTranslator(page, true)
    const editor = page.locator('textarea')
    await editor.fill('Failing request')
    await editor.press('Enter')
    await expect.poll(() => requests(page)).toHaveLength(1)
    await page.evaluate(() => {
        const run = (window as unknown as TranslatorTestWindow).translationRuns[0]
        run.push('部分译文', true)
        run.error('Structured output is missing translatedText.')
        run.finish('error')
    })
    await expect(page.getByText('部分译文', { exact: true })).toBeVisible()
    await expect(page.getByText('Structured output is missing translatedText.', { exact: true })).toBeVisible()
    await editor.press('Enter')
    await expect.poll(() => requests(page)).toHaveLength(2)
    await page.evaluate(() => (window as unknown as TranslatorTestWindow).translationRuns[1].finish('error'))
    expect(await historyTexts(page)).toEqual([])
})

test('structured output previews readable text and saves only the validated result', async ({ page }) => {
    await openStructuredTranslator(page)
    const editor = page.locator('textarea')
    await editor.fill('Good morning everyone')
    await editor.press('Enter')
    await expect.poll(() => nativeStreams(page)).toBe(1)
    await page.evaluate(async () => {
        const s = (window as unknown as EngineTestWindow).nativeStreams[0]
        await s.status(200, 'text/event-stream; charset=utf-8')
        await s.chunk('data: {"choices":[{"delta":{"content":"{\\"translatedText\\":\\"大家"}}]}\n\n')
    })
    await expect(page.getByText('大家', { exact: true })).toBeVisible()
    await expect(page.getByText('translatedText')).toHaveCount(0)
    await page.evaluate(async () => {
        const s = (window as unknown as EngineTestWindow).nativeStreams[0]
        await s.chunk('data: {"choices":[{"delta":{"content":"早上好\\"}"},"finish_reason":"stop"}]}\n\n')
        await s.end()
    })
    await expect(page.getByText('大家早上好', { exact: true })).toBeVisible()
    await expect.poll(() => historyTexts(page)).toEqual(['大家早上好'])
    const [first] = await page.evaluate(() => (window as unknown as EngineTestWindow).nativeStreams.map((s) => s.body))
    expect(first).toMatchObject({ stream: true, response_format: { type: 'json_schema' } })
    await editor.press('Enter')
    await expect(page.getByText('大家早上好', { exact: true })).toBeVisible()
    expect(await nativeStreams(page)).toBe(1)
})

test('structured output falls back once when the endpoint rejects streaming', async ({ page }) => {
    await openStructuredTranslator(page)
    await page.evaluate(() => {
        ;(window as unknown as EngineTestWindow).fallbackResponse = {
            status: 200,
            body: {
                choices: [{ message: { content: '{"translatedText":"回退译文"}' }, finish_reason: 'stop' }],
            },
        }
    })
    const editor = page.locator('textarea')
    await editor.fill('Fallback request text')
    await editor.press('Enter')
    await expect.poll(() => nativeStreams(page)).toBe(1)
    await page.evaluate(async () => {
        const s = (window as unknown as EngineTestWindow).nativeStreams[0]
        await s.status(400, 'application/json')
        await s.chunk('{"error":{"message":"Unsupported value","param":"stream",')
        await s.chunk('"code":"unsupported_value"}}')
        await s.end()
    })
    await expect(page.getByText('回退译文', { exact: true })).toBeVisible()
    await expect(page.getByText('Unsupported value')).toHaveCount(0)
    const [streamBody, fallbackBody] = await page.evaluate(() => {
        const w = window as unknown as EngineTestWindow
        return [w.nativeStreams[0].body, ...w.fallbackRequests]
    })
    expect(fallbackBody).toEqual({ ...streamBody, stream: false })
    expect(await page.evaluate(() => (window as unknown as EngineTestWindow).fallbackRequests.length)).toBe(1)
    await expect.poll(() => historyTexts(page)).toEqual(['回退译文'])
})

test('structured output shows a validation error and keeps the preview unsaved', async ({ page }) => {
    await openStructuredTranslator(page)
    const editor = page.locator('textarea')
    await editor.fill('Truncated request text')
    await editor.press('Enter')
    await expect.poll(() => nativeStreams(page)).toBe(1)
    await page.evaluate(async () => {
        const s = (window as unknown as EngineTestWindow).nativeStreams[0]
        await s.status(200, 'text/event-stream')
        await s.chunk('data: {"choices":[{"delta":{"content":"{\\"translatedText\\":\\"半截"}}]}\n\n')
        await s.end()
    })
    await expect(page.getByText('半截', { exact: true })).toBeVisible()
    await expect(page.getByText(/JSON/)).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as EngineTestWindow).fallbackRequests.length)).toBe(0)
    expect(await historyTexts(page)).toEqual([])
    await editor.press('Enter')
    await expect.poll(() => nativeStreams(page)).toBe(2)
})

test('stopping structured output keeps the partial preview', async ({ page }) => {
    await openStructuredTranslator(page)
    const editor = page.locator('textarea')
    await editor.fill('Stop this request')
    await editor.press('Enter')
    await expect.poll(() => nativeStreams(page)).toBe(1)
    await page.evaluate(async () => {
        const s = (window as unknown as EngineTestWindow).nativeStreams[0]
        await s.status(200, 'text/event-stream')
        await s.chunk('data: {"choices":[{"delta":{"content":"{\\"translatedText\\":\\"停止前"}}]}\n\n')
    })
    await expect(page.getByText('停止前', { exact: true })).toBeVisible()
    await page.locator('div:has(> svg > path[d^="M2 3C2 2.44772"])').click()
    await expect(page.getByText('停止前', { exact: true })).toBeVisible()
    await expect(page.getByText(/JSON/)).toHaveCount(0)
    expect(await historyTexts(page)).toEqual([])
})
