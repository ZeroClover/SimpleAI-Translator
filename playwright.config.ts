/**
 * @see {@link https://playwright.dev/docs/chrome-extensions Chrome extensions | Playwright}
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './e2e',
    retries: 0,
    projects: [
        { name: 'desktop', testMatch: 'desktop.spec.ts', use: { browserName: 'chromium' } },
        { name: 'extension', testMatch: 'extension.spec.ts', use: { browserName: 'chromium' } },
        { name: 'updater', testMatch: 'updater.spec.ts', use: { browserName: 'webkit' } },
    ],
    webServer: {
        command: 'pnpm exec vite -c vite.config.tauri.ts --host 127.0.0.1',
        url: 'http://127.0.0.1:3333/src/tauri/index.html',
        reuseExistingServer: !process.env.CI,
    },
})
