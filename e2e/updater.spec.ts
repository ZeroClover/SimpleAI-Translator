import { expect, test, type Page } from '@playwright/test'

// Boots the real updater window with only the native IPC boundary mocked. `body` is the release
// notes of an available update; without it no check has run yet, so the window checks itself and
// the native side finds no update.
async function openUpdater(page: Page, body?: string) {
    const result = body === undefined ? [false, null] : [true, { currentVersion: '1.0.0', version: '1.1.0', body }]
    await page.route(/\/src\/tauri\/index\.tsx$/, (route) =>
        route.fulfill({
            contentType: 'text/javascript',
            body: `
                import { mockIPC, mockWindows } from '/node_modules/@tauri-apps/api/mocks.js';
                mockWindows('updater');
                window.__TAURI__ = {};
                mockIPC((cmd) => {
                    if (cmd === 'get_config_content') return JSON.stringify({ i18n: 'zh-Hans', themeType: 'light' });
                    if (cmd === 'get_update_result') return ${JSON.stringify(result)};
                }, { shouldMockEvents: true });
                const { emit, listen } = await import('/node_modules/@tauri-apps/api/event.js');
                await listen('check-update-event', () => emit('check-update-result-event', null));
                await import('/src/tauri/index.tsx?actual');
            `,
        })
    )
    await page.goto('http://127.0.0.1:3333/src/tauri/index.html')
    await expect(page.getByRole('button', { name: '关闭' })).toBeVisible()
}

test('E15 long release notes stay readable and the actions reachable in a narrow window', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 400 })
    const items = Array.from({ length: 20 }, (_, i) => `- 第 ${i + 1} 条：修复长文本更新说明的显示问题。`)
    await openUpdater(page, ['# 本次更新', '', ...items, '- 最后一条说明。'].join('\n'))

    await expect(page.getByText('有新版本可用！', { exact: true })).toBeInViewport({ ratio: 1 })
    const last = page.getByRole('listitem').last()
    await last.scrollIntoViewIfNeeded()
    await expect(last).toHaveText('最后一条说明。')
    await expect(last).toBeInViewport({ ratio: 1 })
    const update = page.getByRole('button', { name: '更新', exact: true })
    await expect(update).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('button', { name: '关闭' })).toBeInViewport({ ratio: 1 })
    // The fixed action bar does not cover the end of the notes.
    const [lastBox, updateBox] = [(await last.boundingBox())!, (await update.boundingBox())!]
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(updateBox.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
})

test('E16 a first check that finds no update shows the current-version status', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 500 })
    await openUpdater(page)
    await expect(page.getByText(/恭喜/)).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('button', { name: '更新', exact: true })).toHaveCount(0)
})
