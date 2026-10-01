import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

async function openUpdater(page: Page, body: string | null) {
    // Exercise the real desktop renderer; only the native IPC boundary is mocked.
    await page.route(/\/src\/tauri\/index\.tsx$/, (route) =>
        route.fulfill({
            contentType: 'text/javascript',
            body: `
                import { mockIPC, mockWindows } from '/node_modules/@tauri-apps/api/mocks.js';
                mockWindows('updater');
                window.__TAURI__ = {};
                mockIPC((cmd) => {
                    if (cmd === 'get_config_content') {
                        return JSON.stringify({ i18n: 'zh-Hans', themeType: 'light' });
                    }
                    if (cmd === 'get_update_result') {
                        return [true, ${JSON.stringify(
                            body === null ? null : { currentVersion: '1.3.0', version: '1.4.0', body }
                        )}];
                    }
                }, { shouldMockEvents: true });
                await import('/src/tauri/index.tsx?actual');
            `,
        })
    )
    await page.goto('http://127.0.0.1:3333/src/tauri/index.html')
    await expect(page.getByRole('button', { name: '关闭' })).toBeVisible()
}

test.describe('updater', () => {
    for (const viewport of [
        { width: 500, height: 500 },
        { width: 320, height: 400 },
    ]) {
        test(`long notes remain reachable at ${viewport.width}×${viewport.height}`, async ({ page }) => {
            await page.setViewportSize(viewport)
            const notes = [
                '# 本次更新',
                '',
                '- 第一条说明包含 **重点**，',
                '  换行后仍属于同一条说明。',
                ...Array.from({ length: 20 }, (_, i) => `- 第 ${i + 2} 条：修复长文本更新说明的显示问题。`),
                '- 最后一条说明。',
            ].join('\n')
            await openUpdater(page, notes)

            const version = page.getByText('有新版本可用！', { exact: true })
            await expect(version).toBeInViewport({ ratio: 1 })
            expect((await version.boundingBox())!.y).toBeGreaterThanOrEqual(90)
            await expect(page.getByRole('heading', { name: '本次更新' })).toBeVisible()
            const items = page.getByRole('listitem')
            await expect(items).toHaveCount(22)
            await expect(items.first()).toHaveText('第一条说明包含 重点， 换行后仍属于同一条说明。')
            await expect(items.first().locator('strong')).toHaveText('重点')

            await items.last().scrollIntoViewIfNeeded()
            await expect(items.last()).toBeInViewport({ ratio: 1 })
            const lastBox = (await items.last().boundingBox())!
            expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(viewport.height - 90)
            await expect(page.getByRole('button', { name: '更新', exact: true })).toBeInViewport({ ratio: 1 })

            await version.scrollIntoViewIfNeeded()
            expect((await version.boundingBox())!.y).toBeGreaterThanOrEqual(90)
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
        })
    }

    test('release 1.3.0 notes show two clean bullets without a repeated version heading', async ({ page }) => {
        await page.setViewportSize({ width: 500, height: 500 })
        await openUpdater(page, readFileSync(path.join(__dirname, '../docs/releases/1.3.0.md'), 'utf8'))
        const items = page.getByRole('listitem')
        await expect(items).toHaveCount(2)
        for (const item of await items.all()) {
            expect(await item.textContent()).not.toMatch(/^[-*■]/)
        }
        await expect(items.first()).toBeInViewport({ ratio: 1 })
        await expect(items.last()).toBeInViewport({ ratio: 1 })
    })

    test('no update still shows the current-version message', async ({ page }) => {
        await page.setViewportSize({ width: 500, height: 500 })
        await openUpdater(page, null)
        await expect(page.getByRole('listitem')).toHaveCount(0)
        await expect(page.getByRole('button', { name: '更新', exact: true })).toHaveCount(0)
        await expect(page.getByText('Congratulations! You are now using the latest version!')).toHaveCount(0)
        await expect(page.getByText(/恭喜/)).toBeInViewport({ ratio: 1 })
    })
})
