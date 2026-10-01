/**
 * @see {@link https://playwright.dev/docs/chrome-extensions Chrome extensions | Playwright}
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './e2e',
    retries: 2,
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
        { name: 'updater-webkit', testMatch: 'updater.spec.ts', use: { browserName: 'webkit' } },
    ],
    webServer: {
        command: 'pnpm exec vite -c vite.config.tauri.ts --host 127.0.0.1',
        url: 'http://127.0.0.1:3333/src/tauri/index.html',
        reuseExistingServer: !process.env.CI,
    },
})
