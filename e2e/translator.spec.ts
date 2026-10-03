import { expect, test, type Page } from '@playwright/test'

interface TranslatorTestWindow extends Window {
    translationRequests: string[]
    translationRuns: Array<{ push(content: string, isFullText?: boolean): void; finish(reason: string): void }>
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
                if (cmd === 'get_config_content') return JSON.stringify({
                    i18n: 'en', languageDetectionEngine: 'local',
                    providers: [{ id: 'test', name: 'Test', protocol: 'openai-chat', apiKey: 'test', model: 'test-model' }],
                    defaultModel: { providerId: 'test', model: 'test-model' },
                    defaultProviderId: 'test'
                });
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
