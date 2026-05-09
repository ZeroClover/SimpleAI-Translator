import '../enable-dev-hmr'
import * as utils from '@/common/utils'
import React from 'react'
import { popupCardID, popupCardOffset } from './consts'
import { Translator } from '@/common/components/Translator'
import { getContainer, queryPopupCardElement } from './utils'
import { create } from 'jss'
import preset from 'jss-preset-default'
import { JssProvider, createGenerateId } from 'react-jss'
import { Client as Styletron } from 'styletron-engine-atomic'
import { createRoot, Root } from 'react-dom/client'
import '@/common/i18n.js'
import { PREFIX } from '@/common/constants'
import { getClientX, getClientY, UserEventType } from '@/common/user-event'
import { GlobalSuspense } from '@/common/components/GlobalSuspense'
import { type ReferenceElement } from '@floating-ui/dom'
import InnerContainer from './InnerContainer'
import TitleBar from './TitleBar'
import { setExternalOriginalText } from '@/common/store'

let root: Root | null = null
const generateId = createGenerateId()

async function removeContainer() {
    const $container = await getContainer()
    $container.remove()
}

async function hidePopupCard() {
    const $popupCard: HTMLDivElement | null = await queryPopupCardElement()
    if (!$popupCard) {
        return
    }
    speechSynthesis.cancel()
    if (root) {
        root.unmount()
        root = null
    }
    removeContainer()
}

async function createPopupCard() {
    const $popupCard = document.createElement('div')
    $popupCard.id = popupCardID
    const $container = await getContainer()
    $container.shadowRoot?.querySelector('div')?.appendChild($popupCard)
    if ($container.shadowRoot) {
        const shadowRoot = $container.shadowRoot
        if (import.meta.hot) {
            const { addViteStyleTarget } = await import('@samrum/vite-plugin-web-extension/client')
            await addViteStyleTarget(shadowRoot)
        } else {
            const browser = await utils.getBrowser()
            import.meta.PLUGIN_WEB_EXT_CHUNK_CSS_PATHS?.forEach((cssPath) => {
                const styleEl = document.createElement('link')
                styleEl.setAttribute('rel', 'stylesheet')
                styleEl.setAttribute('href', browser.runtime.getURL(cssPath))
                shadowRoot.appendChild(styleEl)
            })
        }
    }
    return $popupCard
}

async function showPopupCard(reference: ReferenceElement, text: string, autoFocus: boolean | undefined = false) {
    const settings = await utils.getSettings()
    let $popupCard = await queryPopupCardElement()
    if ($popupCard && settings.pinned) {
        setExternalOriginalText(text)
        return
    } else {
        $popupCard = await createPopupCard()
    }

    const engine = new Styletron({
        container: $popupCard.parentElement ?? undefined,
        prefix: `${PREFIX}-styletron-`,
    })
    const jss = create().setup({
        ...preset(),
        insertionPoint: $popupCard.parentElement ?? undefined,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__IS_OT_BROWSER_EXTENSION_CONTENT_SCRIPT__ = true
    const isUserscript = utils.isUserscript()
    const JSS = JssProvider
    root = createRoot($popupCard)
    root.render(
        <React.StrictMode>
            <GlobalSuspense>
                <JSS jss={jss} generateId={generateId} classNamePrefix='__zeroclover-simpleai-translator-jss-'>
                    <InnerContainer reference={reference}>
                        <TitleBar pinned={settings.pinned} onClose={hidePopupCard} engine={engine} />
                        <Translator
                            engine={engine}
                            autoFocus={autoFocus}
                            showSettingsIcon
                            defaultShowSettings={isUserscript}
                            showLogo={false}
                        />
                    </InnerContainer>
                </JSS>
            </GlobalSuspense>
        </React.StrictMode>
    )
    setExternalOriginalText(text)
}

async function main() {
    const browser = await utils.getBrowser()
    let lastMouseEvent: UserEventType | undefined

    const mouseUpHandler = (event: UserEventType) => {
        lastMouseEvent = event
    }

    document.addEventListener('mouseup', mouseUpHandler)
    document.addEventListener('touchend', mouseUpHandler)

    browser.runtime.onMessage.addListener(function (request) {
        if (request.type === 'open-translator') {
            if (window !== window.top) return
            const text = request.info.selectionText ?? ''
            const x = lastMouseEvent ? getClientX(lastMouseEvent) : 0
            const y = lastMouseEvent ? getClientY(lastMouseEvent) : 0
            showPopupCard({ getBoundingClientRect: () => new DOMRect(x, y, popupCardOffset, popupCardOffset) }, text)
        }
    })

    const mouseDownHandler = async () => {
        const settings = await utils.getSettings()
        if (!settings.pinned) {
            hidePopupCard()
        }
    }
    document.addEventListener('mousedown', mouseDownHandler)
    document.addEventListener('touchstart', mouseDownHandler)
}

if (utils.isFirefox()) {
    // workaround for `"then" is read-only` error caused by dexie in firefox
    const nativeP = crypto.subtle.digest('SHA-512', new Uint8Array([0]))
    Object.defineProperty(Object.getPrototypeOf(nativeP), 'then', {
        get: () => Promise.prototype.then,
        set: () => {
            // do nothing
        },
    })
}

main()
