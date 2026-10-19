import browser from 'webextension-polyfill'
import { defineContentScript } from 'wxt/utils/define-content-script'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root'
import type { ReferenceElement } from '@floating-ui/dom'
import { getClientX, getClientY, type UserEventType } from '@/common/user-event'
import { containerID, popupCardOffset, zIndex } from '@/browser-extension/content_script/consts'

// WXT imports this module in Node to read the options above `main`, so everything that touches
// the browser (i18n, React, the card itself) is loaded inside `main`.
export default defineContentScript({
    matches: ['<all_urls>'],
    allFrames: true,
    matchAboutBlank: true,
    cssInjectionMode: 'ui',
    main(ctx) {
        let lastMouseEvent: UserEventType | undefined
        const rememberMouseEvent = (event: UserEventType) => {
            lastMouseEvent = event
        }
        document.addEventListener('mouseup', rememberMouseEvent)
        document.addEventListener('touchend', rememberMouseEvent)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        browser.runtime.onMessage.addListener((request: any) => {
            if (request.type !== 'open-translator' || window !== window.top) {
                return
            }
            const x = lastMouseEvent ? getClientX(lastMouseEvent) : 0
            const y = lastMouseEvent ? getClientY(lastMouseEvent) : 0
            void openPopupCard(
                ctx,
                { getBoundingClientRect: () => new DOMRect(x, y, popupCardOffset, popupCardOffset) },
                request.info.selectionText ?? ''
            )
        })

        // A click outside the card closes it unless it is pinned; clicks inside the card do not
        // reach the page (see `isolateEvents`). Without a card there is nothing to read or close.
        const closeUnlessPinned = async () => {
            if (popupCard && !(await isPinned())) {
                closePopupCard()
            }
        }
        document.addEventListener('mousedown', closeUnlessPinned)
        document.addEventListener('touchstart', closeUnlessPinned)
    },
})

type PopupCardModule = typeof import('@/browser-extension/content_script/card')

let popupCard: { ui: ShadowRootContentScriptUi<() => void>; module: PopupCardModule } | undefined

async function isPinned() {
    const { pinned } = await browser.storage.sync.get('pinned')
    return pinned === true
}

async function openPopupCard(ctx: ContentScriptContext, reference: ReferenceElement, text: string) {
    const pinned = await isPinned()
    if (popupCard && pinned) {
        popupCard.module.setExternalOriginalText(text)
        return
    }
    closePopupCard()
    const module = await import('@/browser-extension/content_script/card')
    const ui = await createShadowRootUi(ctx, {
        name: 'zeroclover-simpleai-translator',
        position: 'inline',
        anchor: 'html',
        append: 'last',
        inheritStyles: true,
        isolateEvents: ['mousedown', 'mouseup', 'touchstart', 'touchend'],
        onMount: (container, _shadow, shadowHost) => {
            // The custom element name cannot carry the `__` prefix; the DOM ids inside it do.
            container.id = containerID
            shadowHost.style.zIndex = zIndex
            return module.mountPopupCard(container, { reference, text, pinned, onClose: closePopupCard })
        },
        onRemove: (unmount) => unmount?.(),
    })
    ui.mount()
    popupCard = { ui, module }
}

function closePopupCard() {
    if (!popupCard) {
        return
    }
    speechSynthesis.cancel()
    popupCard.ui.remove()
    popupCard = undefined
}
