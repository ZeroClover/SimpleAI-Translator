/* eslint-disable camelcase */
import { expect, test, type Page } from '@playwright/test'

interface TranslatorTestWindow extends Window {
    translationRequests: string[]
    translationRuns: Array<{
        signal: AbortSignal
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

// The desktop config file lives on the test side, so it survives page reloads. Like the native
// update_config command, an update merges the set keys into the file.
async function mockConfigFile(page: Page, config: Record<string, unknown>) {
    const file = { content: JSON.stringify(config), writes: 0 }
    await page.exposeFunction('readConfigFile', () => file.content)
    await page.exposeFunction('updateConfigFile', (setJson: string) => {
        file.writes++
        file.content = JSON.stringify({ ...JSON.parse(file.content), ...JSON.parse(setJson) })
    })
    return {
        read: () => JSON.parse(file.content) as Record<string, unknown>,
        writes: () => file.writes,
        write: (next: Record<string, unknown>) => {
            file.content = JSON.stringify(next)
        },
    }
}

const CONFIG_FILE_IPC = `
    if (cmd === 'get_config_content') return window.readConfigFile();
    if (cmd === 'update_config') return window.updateConfigFile(args.setJson).then(() => null);
`

async function openTranslator(page: Page, { controlled = false, config = CONFIG as Record<string, unknown> } = {}) {
    const configFile = await mockConfigFile(page, config)
    await page.route(/\/src\/tauri\/index\.tsx$/, (route) =>
        route.fulfill({
            contentType: 'text/javascript',
            body: `
            import { mockIPC, mockWindows } from '/node_modules/@tauri-apps/api/mocks.js';
            mockWindows('translator');
            window.__TAURI__ = {};
            window.translationRequests = [];
            window.translationRuns = [];
            window.autostartEnabled = false;
            mockIPC((cmd, args) => {
                ${CONFIG_FILE_IPC}
                if (cmd === 'plugin:autostart|is_enabled') return window.autostartEnabled;
                if (cmd === 'plugin:autostart|enable') window.autostartEnabled = true;
                if (cmd === 'plugin:autostart|disable') window.autostartEnabled = false;
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
                        signal: req.signal,
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
    return configFile
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

// Runs the real translate() and protocol engine. Only the transport boundary is mocked: a
// streaming request returns a Response whose head and body the test drives, and the
// non-streaming fallback request returns `fallbackResponse`.
async function openEngineTranslator(page: Page, config: Record<string, unknown>) {
    await mockConfigFile(page, config)
    await page.route(/\/src\/tauri\/index\.tsx$/, (route) =>
        route.fulfill({
            contentType: 'text/javascript',
            body: `
            import { mockIPC, mockWindows } from '/node_modules/@tauri-apps/api/mocks.js';
            mockWindows('translator');
            window.__TAURI__ = {};
            window.nativeStreams = [];
            window.fallbackRequests = [];
            mockIPC((cmd, args) => {
                ${CONFIG_FILE_IPC}
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
                    const body = JSON.parse(init.body);
                    if (body.stream) {
                        return new Promise((resolve, reject) => {
                            let controller;
                            const stream = new ReadableStream({ start: (value) => { controller = value; } });
                            init.signal?.addEventListener('abort', () => {
                                const error = new DOMException('Aborted', 'AbortError');
                                reject(error);
                                controller.error(error);
                            });
                            const encoder = new TextEncoder();
                            window.nativeStreams.push({
                                body,
                                status: async (status, contentType) =>
                                    resolve(new Response(stream, { status, headers: { 'Content-Type': contentType } })),
                                chunk: async (data) => controller.enqueue(encoder.encode(data)),
                                end: async () => controller.close(),
                            });
                        });
                    }
                    window.fallbackRequests.push(body);
                    const { status, body: responseBody } = window.fallbackResponse;
                    return new Response(JSON.stringify(responseBody), {
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

function openStructuredTranslator(page: Page) {
    return openEngineTranslator(page, {
        ...CONFIG,
        providerModelOutputControls: [{ providerId: 'test', model: 'test-model', useStructuredOutput: true }],
    })
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
    await openTranslator(page, { controlled: true })
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
    await openTranslator(page, { controlled: true })
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
    await openTranslator(page, { controlled: true })
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
    await openTranslator(page, { controlled: true })
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
    await page.locator('div:has(> svg > path[d^="M12 2C12.5523 2 13 2.44772"])').click()
    await expect(page.getByText('停止前', { exact: true })).toBeVisible()
    await expect(page.getByText(/JSON/)).toHaveCount(0)
    expect(await historyTexts(page)).toEqual([])
})

function markdownToggle(page: Page) {
    return page.getByRole('button', { name: 'Markdown rendering' })
}

// The result toolbar: [Markdown] spacer [Retry] [Speak] [Copy].
function resultToolbar(page: Page) {
    return markdownToggle(page).locator('xpath=../..')
}

function runPush(page: Page, content: string, isFullText = false, index = 0) {
    return page.evaluate(
        ([content, isFullText, index]) =>
            (window as unknown as TranslatorTestWindow).translationRuns[index].push(content, isFullText),
        [content, isFullText, index] as const
    )
}

function runError(page: Page, message: string, index = 0) {
    return page.evaluate(
        ([message, index]) => (window as unknown as TranslatorTestWindow).translationRuns[index].error(message),
        [message, index] as const
    )
}

function runFinish(page: Page, reason: string, index = 0) {
    return page.evaluate(
        ([reason, index]) => (window as unknown as TranslatorTestWindow).translationRuns[index].finish(reason),
        [reason, index] as const
    )
}

function runAborted(page: Page, index = 0) {
    return page.evaluate(
        (index) => (window as unknown as TranslatorTestWindow).translationRuns[index].signal.aborted,
        index
    )
}

async function copyResult(page: Page) {
    await resultToolbar(page).locator(':scope > div').last().click()
    return page.evaluate(async () => {
        const [item] = await navigator.clipboard.read()
        return { types: item.types, text: await navigator.clipboard.readText() }
    })
}

async function restoreHistory(page: Page, item: Record<string, unknown>) {
    await page.evaluate(
        async ([eventModule, item]) => {
            const { emit } = await import(eventModule)
            await emit('history:restore', item)
        },
        ['/node_modules/@tauri-apps/api/event.js', item] as const
    )
}

test('the Markdown toggle switches a streaming result without touching the request', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await openTranslator(page, { controlled: true })
    const toggle = markdownToggle(page)
    const editor = page.locator('textarea')
    await editor.fill('Markdown stream')
    await editor.press('Enter')
    await expect.poll(() => requests(page)).toHaveLength(1)
    await expect(toggle).toHaveCount(0)

    await runPush(page, '# Heading\n\nSome **bo')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByText('# Heading', { exact: true })).toBeVisible()
    await expect(page.locator('h1')).toHaveCount(0)
    expect(await copyResult(page)).toEqual({ types: ['text/plain'], text: '# Heading\n\nSome **bo' })

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle).toBeFocused()
    await expect(page.locator('h1')).toHaveText('Heading')
    await expect(page.locator('p', { hasText: 'Some **bo' })).toBeVisible()
    expect(await copyResult(page)).toEqual({ types: ['text/plain'], text: '# Heading\n\nSome **bo' })

    await runPush(page, 'ld** text\n\n```\nconst a')
    await expect(page.locator('strong')).toHaveText('bold')
    await expect(page.locator('pre code')).toContainText('const a')
    await toggle.press('Space')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByText('```', { exact: true }).first()).toBeVisible()
    await toggle.press('Enter')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle).toBeFocused()
    await expect(editor).toHaveValue('Markdown stream')

    await runPush(page, ' = 1\n```')
    await expect(page.locator('pre code')).toContainText('const a = 1')
    await runPush(page, '# Replaced\n\n*done*', true)
    await runPush(page, ' tail')
    await runFinish(page, 'stop')
    await expect(page.locator('h1')).toHaveText('Replaced')
    await expect(page.locator('em')).toHaveText('done')
    await expect(page.locator('pre')).toHaveCount(0)
    expect(await requests(page)).toHaveLength(1)
    expect(await runAborted(page)).toBe(false)
    await expect.poll(() => historyTexts(page)).toEqual(['# Replaced\n\n*done* tail'])

    await toggle.click()
    await expect(page.getByText('# Replaced', { exact: true })).toBeVisible()
    await expect(page.getByText('*done* tail', { exact: true })).toBeVisible()
    expect(await copyResult(page)).toEqual({ types: ['text/plain'], text: '# Replaced\n\n*done* tail' })
    expect(await requests(page)).toHaveLength(1)
    expect(await historyTexts(page)).toEqual(['# Replaced\n\n*done* tail'])
})

test('copying the result writes the original text in both display modes', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await openTranslator(page, { controlled: true })
    const original =
        '## Title  \n\n**Bold** and _em_\nnext line   with  spaces\n\n```js\n  if (a)  {\n\treturn\n  }\n```\n'
    const editor = page.locator('textarea')
    await editor.fill('Copy source')
    await editor.press('Enter')
    await expect.poll(() => requests(page)).toHaveLength(1)
    await runPush(page, original, true)
    await runFinish(page, 'stop')
    await expect(markdownToggle(page)).toHaveAttribute('aria-pressed', 'false')
    expect(await copyResult(page)).toEqual({ types: ['text/plain'], text: original })
    await markdownToggle(page).click()
    await expect(page.locator('h2')).toHaveText('Title')
    await expect(page.locator('pre code')).toContainText('if (a)  {')
    expect(await copyResult(page)).toEqual({ types: ['text/plain'], text: original })
})

test('stopped and failed results stay switchable and copyable without being saved', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await openTranslator(page, { controlled: true })
    const toggle = markdownToggle(page)
    const editor = page.locator('textarea')
    await editor.fill('Stop me')
    await editor.press('Enter')
    await expect.poll(() => requests(page)).toHaveLength(1)
    await runPush(page, 'Stopped **partial')
    await expect(page.getByText('Stopped **partial', { exact: true })).toBeVisible()
    await page.locator('div:has(> svg > path[d^="M12 2C12.5523 2 13 2.44772"])').click()
    await expect(page.getByText('Stopped', { exact: true })).toBeVisible()
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('p', { hasText: 'Stopped **partial' })).toBeVisible()
    expect(await copyResult(page)).toEqual({ types: ['text/plain'], text: 'Stopped **partial' })

    await editor.fill('Fail me')
    await editor.press('Enter')
    await expect.poll(() => requests(page)).toHaveLength(2)
    await runPush(page, 'Failed *partial* text', false, 1)
    await runError(page, 'Upstream failed.', 1)
    await runFinish(page, 'error', 1)
    await expect(page.getByText('Upstream failed.', { exact: true })).toBeVisible()
    await expect(page.locator('em')).toHaveText('partial')
    await toggle.click()
    await expect(page.getByText('Failed *partial* text', { exact: true })).toBeVisible()
    expect(await copyResult(page)).toEqual({ types: ['text/plain'], text: 'Failed *partial* text' })
    expect(await historyTexts(page)).toEqual([])
    expect(await requests(page)).toHaveLength(2)

    await editor.press('Enter')
    await expect.poll(() => requests(page)).toHaveLength(3)
    await runFinish(page, 'stop', 2)
})

test('the Markdown preference persists and survives saving other settings', async ({ page }) => {
    const configFile = await openTranslator(page)
    const editor = page.locator('textarea')
    await editor.fill('**Persist me**')
    await editor.press('Enter')
    await expect(page.getByText('Translated: **Persist me**', { exact: true })).toBeVisible()
    await markdownToggle(page).click()
    await expect(page.locator('strong')).toHaveText('Persist me')
    await expect.poll(() => configFile.read().renderMarkdown).toBe(true)

    await page.reload()
    await editor.fill('**Persist me**')
    await editor.press('Enter')
    await expect(markdownToggle(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('strong')).toHaveText('Persist me')
    await markdownToggle(page).click()
    await expect.poll(() => configFile.read().renderMarkdown).toBe(false)

    await page.reload()
    await editor.fill('**Persist me**')
    await editor.press('Enter')
    await expect(markdownToggle(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByText('Translated: **Persist me**', { exact: true })).toBeVisible()
    await markdownToggle(page).click()
    await expect.poll(() => configFile.read().renderMarkdown).toBe(true)
    const requestCount = (await requests(page)).length

    await page.locator('button:has(svg path[d^="M262.29 192.31a64"])').click()
    await expect(page.getByText('Font size', { exact: true })).toBeVisible()
    await expect(page.getByText(/Markdown/)).toHaveCount(0)
    // Another window turns Markdown off while this settings form still holds the old value.
    configFile.write({ ...configFile.read(), renderMarkdown: false })
    await page.locator('input[value="15"]').fill('18')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => configFile.read()).toMatchObject({ fontSize: 18, renderMarkdown: false })

    // The blur-save path keeps the stored value too, and the new theme applies at once.
    const labelColor = () => page.getByText('Font size', { exact: true }).evaluate((el) => getComputedStyle(el).color)
    const lightColor = await labelColor()
    configFile.write({ ...configFile.read(), renderMarkdown: true })
    await page.getByText('Follow the System', { exact: true }).click()
    await page.getByRole('option', { name: 'Dark' }).click()
    await page.getByText('Font size', { exact: true }).click()
    await expect.poll(() => configFile.read()).toMatchObject({ themeType: 'dark', renderMarkdown: true })
    await expect.poll(labelColor).not.toBe(lightColor)

    await page.getByText('Go back', { exact: true }).click()
    await expect(markdownToggle(page)).toHaveAttribute('aria-pressed', 'true')
    expect(await requests(page)).toHaveLength(requestCount)
})

test('the Markdown toggle and model switch keep settings saved by another window', async ({ page }) => {
    const provider = { ...CONFIG.providers[0], modelOptions: ['test-model', 'model-b'] }
    const configFile = await openTranslator(page, { config: { ...CONFIG, providers: [provider] } })
    const editor = page.locator('textarea')
    await editor.fill('**Keep newer**')
    await editor.press('Enter')
    await expect(page.getByText('Translated: **Keep newer**', { exact: true })).toBeVisible()

    // Another window saves a new API key and font size while this translator holds the old settings.
    const newerProvider = { ...provider, apiKey: 'newer-key' }
    configFile.write({ ...configFile.read(), providers: [newerProvider], fontSize: 18 })

    await markdownToggle(page).click()
    await expect
        .poll(() => configFile.read())
        .toMatchObject({
            providers: [newerProvider],
            fontSize: 18,
            renderMarkdown: true,
        })

    await page.getByText('test-model', { exact: true }).click()
    await page.getByRole('option', { name: 'model-b' }).click()
    await expect
        .poll(() => configFile.read())
        .toMatchObject({
            providers: [newerProvider],
            defaultProviderId: 'test',
            defaultModel: { providerId: 'test', model: 'model-b' },
            fontSize: 18,
            renderMarkdown: true,
        })
})

// The message element of each visible toast with this text.
function toastMessages(page: Page, text: string) {
    return page.locator('[role=status] [role=status]', { hasText: text })
}

function openSettings(page: Page) {
    return page.locator('button:has(svg path[d^="M262.29 192.31a64"])').click()
}

test('the settings panel saves only the fields it changed', async ({ page }) => {
    const provider = { ...CONFIG.providers[0], modelOptions: ['test-model', 'model-b'] }
    const configFile = await openTranslator(page, { config: { ...CONFIG, providers: [provider] } })
    await openSettings(page)
    await expect(page.getByText('Font size', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Save' }).click()
    await expect(toastMessages(page, 'Saved')).toHaveCount(1)
    expect(configFile.writes()).toBe(0)

    // The translator window switches the model while this settings form holds the old selection.
    configFile.write({ ...configFile.read(), defaultModel: { providerId: 'test', model: 'model-b' } })
    await page.locator('input[value="15"]').fill('18')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect
        .poll(() => configFile.read())
        .toMatchObject({ fontSize: 18, defaultModel: { providerId: 'test', model: 'model-b' } })
    expect(configFile.writes()).toBe(1)
})

const SPEECH_PROVIDER = { id: 'speech', name: 'Speech', protocol: 'openai-chat', apiKey: 'speech', model: 'gpt-5' }
const OPENAI_TTS = { provider: 'openai', openai: { providerId: 'speech', model: 'gpt-4o-mini-tts', voice: 'coral' } }

function providerRow(page: Page, name: string) {
    return page.getByText(name, { exact: true }).locator('xpath=ancestor::div[.//button][1]')
}

test('deleting the Provider linked to OpenAI TTS switches TTS to Edge in the same save', async ({ page }) => {
    const configFile = await openTranslator(page, {
        config: { ...CONFIG, providers: [...CONFIG.providers, SPEECH_PROVIDER], tts: OPENAI_TTS },
    })
    await openSettings(page)
    await providerRow(page, 'Speech').getByRole('button').last().click()

    await expect(page.getByText('The Provider linked to OpenAI TTS was deleted. Switched to Edge TTS.')).toBeVisible()
    await expect.poll(() => configFile.read().tts).toEqual({ ...OPENAI_TTS, provider: 'edge' })
    expect(configFile.read().providers).toEqual([{ ...CONFIG.providers[0], modelOptions: [] }])
    expect(configFile.writes()).toBe(1)
})

test('switching the Provider linked to OpenAI TTS to Anthropic switches TTS to Edge', async ({ page }) => {
    const configFile = await openTranslator(page, {
        config: { ...CONFIG, providers: [...CONFIG.providers, SPEECH_PROVIDER], tts: OPENAI_TTS },
    })
    await openSettings(page)
    await providerRow(page, 'Speech').getByRole('button', { name: 'Edit' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByText('OpenAI Chat Completions', { exact: true }).click()
    await page.getByRole('option', { name: 'Anthropic Messages' }).click()
    await dialog.getByRole('button', { name: 'Save' }).click()

    await expect(
        page.getByText(
            'The Provider linked to OpenAI TTS uses the Anthropic protocol, which does not support speech. Switched to Edge TTS.'
        )
    ).toBeVisible()
    await expect.poll(() => configFile.read().tts).toEqual({ ...OPENAI_TTS, provider: 'edge' })
})

test('deleting a Provider keeps TTS settings saved by another window', async ({ page }) => {
    const configFile = await openTranslator(page, {
        config: { ...CONFIG, providers: [...CONFIG.providers, SPEECH_PROVIDER], tts: OPENAI_TTS },
    })
    await openSettings(page)
    // Another window switches to system TTS while this settings form still links OpenAI TTS to Speech.
    configFile.write({ ...configFile.read(), tts: { provider: 'system' } })
    await providerRow(page, 'Speech').getByRole('button').last().click()

    await expect.poll(() => (configFile.read().providers as unknown[]).length).toBe(1)
    expect(configFile.read().tts).toEqual({ provider: 'system' })
    await expect(page.getByText(/Switched to Edge TTS/)).toHaveCount(0)
})

test('the history window shows its copy notification', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await openTranslator(page)
    await page.locator('textarea').fill('History entry')
    await page.locator('textarea').press('Enter')
    await expect.poll(() => historyTexts(page)).toEqual(['Translated: History entry'])

    await page.unroute(/\/src\/tauri\/index\.tsx$/)
    await page.route(/\/src\/tauri\/index\.tsx$/, (route) =>
        route.fulfill({
            contentType: 'text/javascript',
            body: `
            import { mockIPC, mockWindows } from '/node_modules/@tauri-apps/api/mocks.js';
            mockWindows('history');
            window.__TAURI__ = {};
            mockIPC((cmd, args) => {
                ${CONFIG_FILE_IPC}
            }, { shouldMockEvents: true });
            await import('/src/tauri/index.tsx?actual');
        `,
        })
    )
    await page.reload()
    const item = page.locator('[role=button]', { hasText: 'Translated: History entry' })
    await item.locator('button').nth(1).click()

    await expect(toastMessages(page, 'Copy to clipboard')).toHaveCount(1)
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Translated: History entry')
})

test('settings toggles persist their new value on click', async ({ page }) => {
    const configFile = await openTranslator(page)
    await page.locator('button:has(svg path[d^="M262.29 192.31a64"])').click()
    const toggle = (label: string) =>
        page
            .getByText(label, { exact: true })
            .locator('xpath=ancestor::*[.//input[@type="checkbox"]][1]')
            .getByRole('checkbox')

    const fixedPosition = toggle('Fixed Position')
    await expect(fixedPosition).not.toBeChecked()
    expect(configFile.read().restorePreviousPosition).toBeUndefined()
    await fixedPosition.locator('xpath=ancestor::label[1]').click()
    await expect.poll(() => configFile.read().restorePreviousPosition).toBe(true)

    // Run at startup is backed by the OS autostart registration, which the blur save must update too.
    const runAtStartup = toggle('Run at startup')
    await expect(runAtStartup).not.toBeChecked()
    await runAtStartup.locator('xpath=ancestor::label[1]').click()
    await expect.poll(() => configFile.read().runAtStartup).toBe(true)
    await expect(runAtStartup).toBeChecked()
    expect(await page.evaluate(() => (window as unknown as { autostartEnabled: boolean }).autostartEnabled)).toBe(true)
})

test('cache hits, history restores and retries follow the current Markdown preference', async ({ page }) => {
    const configFile = await openTranslator(page, {
        config: {
            ...CONFIG,
            providers: [{ ...CONFIG.providers[0], modelOptions: ['test-model', 'model-b'] }],
        },
    })
    const toggle = markdownToggle(page)
    const editor = page.locator('textarea')
    await editor.fill('**Cache me**')
    await editor.press('Enter')
    await expect(page.getByText('Translated: **Cache me**', { exact: true })).toBeVisible()
    await toggle.click()
    await expect(page.locator('strong')).toHaveText('Cache me')
    await editor.fill('Other')
    await editor.press('Enter')
    await expect(page.getByText('Translated: Other', { exact: true })).toBeVisible()
    await editor.fill('**Cache me**')
    await editor.press('Enter')
    await expect(page.locator('strong')).toHaveText('Cache me')
    expect(await requests(page)).toEqual(['**Cache me**', 'Other'])
    const savedHistory = ['Translated: **Cache me**', 'Translated: Other', 'Translated: **Cache me**']
    await expect.poll(() => historyTexts(page)).toEqual(savedHistory)

    // Default model A, restore an entry made with model B, then switch Markdown.
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await restoreHistory(page, {
        fromLang: 'en',
        toLang: 'zh-Hans',
        sourceText: 'Restored source',
        translatedText: '**Restored B**',
        providerId: 'test',
        model: 'model-b',
    })
    await expect(page.getByText('**Restored B**', { exact: true })).toBeVisible()
    await expect(page.getByText('Provider: Test · Model: model-b', { exact: true })).toBeVisible()
    await toggle.click()
    await expect(page.locator('strong')).toHaveText('Restored B')
    await expect(page.getByText('Provider: Test · Model: model-b', { exact: true })).toBeVisible()
    await expect(editor).toHaveValue('Restored source')
    await expect.poll(() => configFile.read().renderMarkdown).toBe(true)
    expect(configFile.read().defaultModel).toEqual({ providerId: 'test', model: 'test-model' })
    await toggle.click()
    await expect(page.getByText('**Restored B**', { exact: true })).toBeVisible()
    await expect(page.getByText('Provider: Test · Model: model-b', { exact: true })).toBeVisible()
    expect(await requests(page)).toHaveLength(2)
    expect(await historyTexts(page)).toEqual(savedHistory)

    // Retrying still re-requests with the restored model, and switching models still translates.
    await resultToolbar(page).locator(':scope > div').nth(2).click()
    await expect(page.getByText('Translated: Restored source', { exact: true })).toBeVisible()
    expect(await requests(page)).toEqual(['**Cache me**', 'Other', 'Restored source'])
    await page.getByText('model-b', { exact: true }).click()
    await page.getByRole('option', { name: 'test-model' }).click()
    await expect(page.getByText('Provider: Test · Model: test-model', { exact: true })).toBeVisible()
    await expect.poll(() => requests(page)).toHaveLength(4)
})

test('the result toolbar stays usable in the narrowest window', async ({ page }) => {
    await page.setViewportSize({ width: 540, height: 600 })
    await openTranslator(page, { controlled: true, config: { ...CONFIG, renderMarkdown: true, themeType: 'dark' } })
    const toggle = markdownToggle(page)
    const editor = page.locator('textarea')
    await editor.fill('Narrow window')
    await editor.press('Enter')
    await expect.poll(() => requests(page)).toHaveLength(1)
    const longContent = `> quoted\n\n- one\n  - nested ${'a'.repeat(300)}\n\n\`\`\`\n${'const value = 1; '.repeat(
        40
    )}\n\`\`\``
    await runPush(page, longContent)
    await runFinish(page, 'stop')
    await expect(page.locator('pre')).toBeVisible()
    const noOverflow = () =>
        page.evaluate(() => {
            const pre = document.querySelector('pre')!
            return {
                page: document.documentElement.scrollWidth <= window.innerWidth,
                preScrolls: pre.scrollWidth > pre.clientWidth,
                preFits: pre.getBoundingClientRect().right <= window.innerWidth,
            }
        })
    expect(await noOverflow()).toEqual({ page: true, preScrolls: true, preFits: true })

    const box = (await toggle.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(28)
    expect(box.height).toBeGreaterThanOrEqual(28)
    const copyBox = (await resultToolbar(page).locator(':scope > div').last().boundingBox())!
    expect(copyBox.x).toBeGreaterThan(box.x)
    expect(copyBox.x + copyBox.width).toBeLessThanOrEqual(540)

    const borderColor = () => toggle.evaluate((el) => getComputedStyle(el).borderColor)
    await expect.poll(borderColor).not.toBe('rgba(0, 0, 0, 0)')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await page.mouse.move(0, 0)
    await expect.poll(borderColor).toBe('rgba(0, 0, 0, 0)')
    await toggle.click()

    // Markdown follows the result area's language direction.
    await restoreHistory(page, {
        fromLang: 'ar',
        toLang: 'en',
        sourceText: 'مرحبا',
        translatedText: `> مرحبا بالعالم\n\n${longContent}`,
        providerId: 'test',
        model: 'test-model',
    })
    await expect(page.locator('blockquote').first()).toContainText('مرحبا بالعالم')
    expect(
        await page
            .locator('blockquote')
            .first()
            .evaluate((el) => getComputedStyle(el).direction)
    ).toBe('rtl')
    expect(await noOverflow()).toEqual({ page: true, preScrolls: true, preFits: true })
    expect(await requests(page)).toHaveLength(1)
})

for (const structured of [false, true]) {
    for (const markdown of [false, true]) {
        test(`structured output ${structured ? 'on' : 'off'} with Markdown ${markdown ? 'on' : 'off'}`, async ({
            page,
        }) => {
            await openEngineTranslator(page, {
                ...CONFIG,
                renderMarkdown: markdown,
                providerModelOutputControls: structured
                    ? [{ providerId: 'test', model: 'test-model', useStructuredOutput: true }]
                    : [],
            })
            const readable = '**粗体** 文本'
            const content = structured ? JSON.stringify({ translatedText: readable }) : readable
            const editor = page.locator('textarea')
            await editor.fill('Format this text please')
            await editor.press('Enter')
            await expect.poll(() => nativeStreams(page)).toBe(1)
            await page.evaluate(
                async (data) => {
                    const s = (window as unknown as EngineTestWindow).nativeStreams[0]
                    await s.status(200, 'text/event-stream')
                    await s.chunk(`data: ${data}\n\n`)
                    await s.end()
                },
                JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] })
            )
            const rendered = page.locator('strong', { hasText: '粗体' })
            const plain = page.getByText(readable, { exact: true })
            await expect(markdown ? rendered : plain).toBeVisible()
            await expect(page.getByText('translatedText')).toHaveCount(0)
            await expect.poll(() => historyTexts(page)).toEqual([readable])
            await markdownToggle(page).click()
            await expect(markdown ? plain : rendered).toBeVisible()
            const [body] = await page.evaluate(() =>
                (window as unknown as EngineTestWindow).nativeStreams.map((s) => s.body)
            )
            expect('response_format' in body).toBe(structured)
            expect(await nativeStreams(page)).toBe(1)
            expect(await historyTexts(page)).toEqual([readable])
        })
    }
}
