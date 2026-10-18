/* eslint-disable camelcase */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'wxt'

// The popup card UI is built as an ES module next to the popup and options pages, so the content
// script that runs in every frame stays small and imports it only when the card opens.
const POPUP_CARD_ENTRY = 'content-card'

export default defineConfig({
    srcDir: 'src',
    entrypointsDir: 'browser-extension/entrypoints',
    publicDir: 'public',
    outDir: 'dist/browser-extension',
    outDirTemplate: '{{browser}}',
    modules: ['@wxt-dev/module-react'],
    imports: false,
    manifestVersion: 3,
    zip: {
        artifactTemplate: '{{browser}}.zip',
        zipSources: false,
    },
    vite: ({ browser }) => ({
        // Relative asset URLs resolve against the module that references them, so the popup card
        // loads its images from the extension rather than from the page it is shown on.
        base: './',
        build: {
            target: 'chrome105',
            // Preload links would be added to the host page when the card runs in a content script.
            modulePreload: false,
            assetsInlineLimit: browser === 'firefox' ? 1024 * 1024 : undefined,
        },
    }),
    manifest: ({ browser }) => ({
        name: 'SimpleAI Translator',
        description: 'Translate text with OpenAI-compatible and Anthropic-compatible LLM providers.',
        icons: {
            '16': 'icon.png',
            '32': 'icon.png',
            '48': 'icon.png',
            '128': 'icon.png',
        },
        action: {
            default_icon: 'icon.png',
        },
        permissions: ['storage', 'contextMenus'],
        host_permissions: [
            'https://api.openai.com/*',
            'https://api.anthropic.com/*',
            '*://speech.platform.bing.com/*',
            'https://edge.microsoft.com/*',
            'https://api-edge.cognitive.microsofttranslator.com/*',
            'https://fanyi.baidu.com/*',
            'https://translate.google.com/*',
        ],
        optional_host_permissions: ['http://*/*', 'https://*/*'],
        web_accessible_resources: [
            {
                resources: [`${POPUP_CARD_ENTRY}.js`, 'chunks/*', 'assets/*'],
                matches: ['<all_urls>'],
            },
        ],
        ...(browser === 'firefox'
            ? {
                  browser_specific_settings: {
                      gecko: {
                          id: 'openaitranslator@gmail.com',
                      },
                  },
              }
            : {}),
    }),
    hooks: {
        'vite:build:extendConfig': (entrypoints, config) => {
            const rollupOptions = config.build?.rollupOptions
            const input = rollupOptions?.input
            if (entrypoints.some((entrypoint) => entrypoint.name === 'popup') && input && !Array.isArray(input)) {
                ;(input as Record<string, string>)[POPUP_CARD_ENTRY] = fileURLToPath(
                    new URL('./src/browser-extension/content_script/card.tsx', import.meta.url)
                )
                // HTML builds drop entry exports; the content script imports the card's exports.
                rollupOptions.preserveEntrySignatures = 'exports-only'
            }
        },
    },
})
