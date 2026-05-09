import path from 'node:path'
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
