import path from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { getOptionsPageUrl, getPopupPageUrl, openTranslatorWithSelectedText, selectExampleText } from './common'
import { containerID, popupCardID, popupCardInnerContainerId } from '../src/browser-extension/content_script/consts'

test('selecting text should not open popup card automatically', async ({ page }) => {
    await page.goto(`file:${path.join(__dirname, 'test.html')}`)
    await selectExampleText(page)

    const container = page.locator(`#${containerID}`)
    await expect(container.locator(`#${popupCardID}`)).not.toBeAttached()
})

test('popup card should be visible after explicit open', async ({ page }) => {
    await page.goto(`file:${path.join(__dirname, 'test.html')}`)
    await openTranslatorWithSelectedText(page)

    const container = page.locator(`#${containerID}`)
    const popupCard = container.locator(`#${popupCardID}`)
    await expect(popupCard).toBeAttached()
    await expect(page.locator(`#${popupCardInnerContainerId}`)).toBeVisible()
})

test('popup page should be opened', async ({ page, extensionId }) => {
    await page.goto(getPopupPageUrl(extensionId))
    await expect(page.getByTestId('popup-container')).toBeVisible()
})

test('options page should be opened', async ({ page, extensionId }) => {
    await page.goto(getOptionsPageUrl(extensionId))
    await expect(page.getByTestId('settings-container')).toBeVisible()
})

// Counts `chrome.storage.sync.get` calls made by the content script, which runs in an isolated
// world that page scripts cannot see.
async function countContentScriptStorageReads(page: Page) {
    const client = await page.context().newCDPSession(page)
    const contexts: Array<{ id: number; origin: string; auxData?: { type?: string } }> = []
    client.on('Runtime.executionContextCreated', ({ context }) => contexts.push(context))
    await client.send('Runtime.enable')
    await expect
        .poll(() => contexts.some((c) => c.auxData?.type === 'isolated' && c.origin.startsWith('chrome-extension://')))
        .toBe(true)
    const contextId = contexts.find(
        (c) => c.auxData?.type === 'isolated' && c.origin.startsWith('chrome-extension://')
    )!.id
    const evaluate = async (expression: string) =>
        (await client.send('Runtime.evaluate', { expression, contextId, returnByValue: true })).result.value
    await evaluate(`
        globalThis.storageReads = 0;
        const get = chrome.storage.sync.get.bind(chrome.storage.sync);
        chrome.storage.sync.get = (...args) => { globalThis.storageReads++; return get(...args) };
    `)
    return () => evaluate('globalThis.storageReads')
}

test('clicking a page without an open card does not read settings', async ({ page }) => {
    await page.goto(`file:${path.join(__dirname, 'test.html')}`)
    const storageReads = await countContentScriptStorageReads(page)

    await page.mouse.click(5, 5)
    await page.mouse.click(10, 10)
    expect(await storageReads()).toBe(0)

    await openTranslatorWithSelectedText(page)
    await expect(page.locator(`#${popupCardInnerContainerId}`)).toBeVisible()
    const readsWhenOpening = await storageReads()
    await page.mouse.click(5, 5)
    await expect.poll(storageReads).toBeGreaterThan(readsWhenOpening)
    await expect(page.locator(`#${popupCardInnerContainerId}`)).not.toBeAttached()
})
