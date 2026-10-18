/* eslint-disable camelcase */
import { defineConfig } from 'wxt'

export default defineConfig({
    srcDir: 'src',
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
    vite: () => ({
        build: {
            target: 'chrome105',
            rolldownOptions: {
                // Chromium refuses a content script that contains a Unicode noncharacter such as
                // U+FFFF, which the minifier otherwise writes out from `String.fromCharCode(65535)`.
                output: { charset: 'ascii' },
            },
        },
    }),
    manifest: ({ browser }) => ({
        name: 'SimpleAI Translator',
        description: 'Translate text with OpenAI-compatible and Anthropic-compatible LLM providers.',
        // WXT only discovers icons whose file names carry a size.
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
        // Images the popup card shows inside web pages (the logo and the settings background).
        // WXT names the content script's assets after the entrypoint and Rolldown may add a
        // number on a name clash, so match by extension rather than by exact name.
        web_accessible_resources: [
            {
                resources: ['assets/*.png', 'assets/*.jpg'],
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
})
