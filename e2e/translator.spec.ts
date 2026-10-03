import { expect, test, type Page } from '@playwright/test'

async function openTranslator(page: Page) {
    await page.route(/\/src\/tauri\/index\.tsx$/, (route) =>
        route.fulfill({
            contentType: 'text/javascript',
            body: `
            import { mockIPC, mockWindows } from '/node_modules/@tauri-apps/api/mocks.js';
            mockWindows('translator');
            window.__TAURI__ = {};
            window.translationRequests = [];
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
