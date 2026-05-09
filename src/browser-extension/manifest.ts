/* eslint-disable camelcase */
import { version } from '../../package.json'

export function getManifest(browser: 'firefox' | 'chromium') {
    const manifest: chrome.runtime.Manifest = {
        manifest_version: 3,

        name: 'SimpleAI Translator',
        description: 'Translate text with OpenAI-compatible and Anthropic-compatible LLM providers.',
        version: version,

        icons: {
            '16': 'icon.png',
            '32': 'icon.png',
            '48': 'icon.png',
            '128': 'icon.png',
        },

        options_ui: {
            page: 'src/browser-extension/options/index.html',
            open_in_tab: true,
        },

        action: {
            default_icon: 'icon.png',
            default_popup: 'src/browser-extension/popup/index.html',
        },

        content_scripts: [
            {
                matches: ['<all_urls>'],
                all_frames: true,
                match_about_blank: true,
                js: ['src/browser-extension/content_script/index.tsx'],
            },
        ],

        background: {
            service_worker: 'src/browser-extension/background/index.ts',
        },

        permissions: ['storage', 'contextMenus'],

        host_permissions: [
            'https://api.openai.com/*',
            'https://api.anthropic.com/*',
            'https://chat.openai.com/*',
            'https://*.ingest.sentry.io/*',
            '*://speech.platform.bing.com/*',
            'https://edge.microsoft.com/*',
            'https://api-edge.cognitive.microsofttranslator.com/*',
            'https://fanyi.baidu.com/*',
            'https://translate.google.com/*',
            'https://*.googletagmanager.com/*',
            'https://*.google-analytics.com/*',
        ],
        optional_host_permissions: ['http://*/*', 'https://*/*'],
    }

    if (browser === 'firefox') {
        manifest.browser_specific_settings = {
            gecko: {
                id: 'openaitranslator@gmail.com',
            },
        }
        manifest.background = {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            scripts: ['src/browser-extension/background/index.ts'],
        }
    }
    return manifest
}
