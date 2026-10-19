/* eslint-disable camelcase */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test'
import { popupCardID, popupCardInnerContainerId } from '../src/browser-extension/content_script/consts'

// Runs the Chromium build from `pnpm build-browser-extension` with its real service worker,
// port bridge and storage. Opening the card sends the same `open-translator` message as the
// context menu item; the native menu click itself is not covered.
const extensionPath = path.join(__dirname, '../dist/browser-extension/chromium')

const PAGE = '<!doctype html><html lang="en"><body><span id="example">Good morning everyone</span></body></html>'

interface Site {
    url: string
    posts: Array<Record<string, unknown>>
}

const test = base.extend<{ context: BrowserContext; site: Site }>({
    context: async ({ headless }, use) => {
        const context = await chromium.launchPersistentContext('', {
            // the 'chromium' channel keeps extensions working in headless mode,
            // where the default chromium-headless-shell binary does not support them
            channel: 'chromium',
            headless,
            args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
        })
        await use(context)
        await context.close()
    },
    // A loopback site serving the test page and an OpenAI-compatible endpoint. The test grants the
    // extension no host permission for it. The current Chromium sends the background request without
    // a preflight; the server still answers one (including the local-network one) and adds CORS
    // headers, so the fixture does not depend on that leniency.
    // eslint-disable-next-line no-empty-pattern -- Playwright reads fixture dependencies from this pattern.
    site: async ({}, use) => {
        const posts: Site['posts'] = []
        const server = http.createServer((req, res) => {
            const cors = {
                'Access-Control-Allow-Origin': req.headers.origin ?? '*',
                'Access-Control-Allow-Methods': 'POST',
                'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? '',
                'Access-Control-Allow-Private-Network': 'true',
            }
            if (req.method === 'OPTIONS') return res.writeHead(204, cors).end()
            if (req.method === 'GET') return res.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGE)
            let body = ''
            req.on('data', (chunk) => (body += chunk))
            req.on('end', () => {
                posts.push(JSON.parse(body))
                const content = JSON.stringify({ translatedText: '大家早上好' })
                const choices = [{ message: { content }, finish_reason: 'stop' }]
                res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }).end(JSON.stringify({ choices }))
            })
        })
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
        await use({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, posts })
        server.closeAllConnections()
        await new Promise((resolve) => server.close(resolve))
    },
})

async function background(context: BrowserContext) {
    return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
}

async function selectExample(page: Page) {
    const box = (await page.locator('#example').boundingBox())!
    await page.mouse.move(box.x, box.y)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width, box.y + box.height)
    await page.mouse.up()
}

// Opens the card for the current selection.
async function openCard(page: Page) {
    const selectionText = await page.evaluate(() => window.getSelection()?.toString())
    await (
        await background(page.context())
    ).evaluate(async (selectionText) => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
        await chrome.tabs.sendMessage(tab.id!, { type: 'open-translator', info: { selectionText } })
    }, selectionText)
    const card = page.locator(`#${popupCardInnerContainerId}`)
    await expect(card).toBeVisible()
    return card
}

test('E13 an explicitly opened card translates through the background and its Select works', async ({
    page,
    context,
    site,
}) => {
    const provider = {
        id: 'p',
        name: 'Local',
        protocol: 'openai-chat',
        apiKey: 'key',
        model: 'gpt-5.5',
        endpoint: `${site.url}v1`,
    }
    await (
        await background(context)
    ).evaluate(
        (provider) =>
            chrome.storage.sync.set({
                i18n: 'en',
                providers: [provider],
                defaultProviderId: provider.id,
                defaultModel: { providerId: provider.id, model: provider.model },
                providerModelOutputControls: [
                    { providerId: provider.id, model: provider.model, useStructuredOutput: true },
                ],
            }),
        provider
    )
    await page.goto(site.url)
    await selectExample(page)
    await expect(page.locator(`#${popupCardID}`)).not.toBeAttached()

    const card = await openCard(page)
    await expect(card.locator('textarea')).toHaveValue('Good morning everyone')
    await card.locator('textarea').press('Enter')
    await expect(card.getByText('大家早上好', { exact: true })).toBeVisible()
    expect(site.posts).toEqual([
        expect.objectContaining({ stream: true, response_format: expect.objectContaining({ type: 'json_schema' }) }),
    ])
    // The logo is served from the extension through web_accessible_resources.
    const logo = card.locator('img').first()
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)

    // The card lives in a shadow root, where a click inside an open Select must not count as outside.
    const targetLanguage = card.getByRole('combobox').nth(1)
    await targetLanguage.click()
    await page.keyboard.type('日')
    await page.getByRole('option', { name: '日本語', exact: true }).click()
    await expect(page.getByRole('option')).toHaveCount(0)
    await expect(card.getByText('日本語', { exact: true })).toBeVisible()
})

test('E14 a pinned card stays open on outside clicks and the close button closes it', async ({
    page,
    context,
    site,
}) => {
    await page.goto(site.url)
    await selectExample(page)
    const card = await openCard(page)
    // An outside click reads `pinned` from storage, so wait until the toggle's write has landed.
    const storedPinned = async () =>
        (await background(context)).evaluate(async () => (await chrome.storage.sync.get('pinned')).pinned)
    await page.getByTestId('titlebar-pin-btn').click()
    await expect.poll(storedPinned).toBe(true)
    await page.mouse.click(5, 5)
    await expect(card).toBeVisible()
    await page.getByTestId('titlebar-pin-btn').click()
    await expect.poll(storedPinned).toBe(false)
    await page.mouse.click(5, 5)
    await expect(card).not.toBeAttached()

    await selectExample(page)
    await openCard(page)
    await page.getByTestId('titlebar-close-btn').click()
    await expect(card).not.toBeAttached()
})
