import browser from 'webextension-polyfill'
import { defineContentScript } from 'wxt/utils/define-content-script'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root'
import { PREFIX } from '@/common/constants'
import { getClientX, getClientY, type UserEventType } from '@/common/user-event'
import { containerID, popupCardOffset, zIndex } from '../content_script/consts'

type PopupCardModule = typeof import('../content_script/card')

// Runs in every frame of every page, so it only registers listeners. The popup card UI and its
// dependencies are loaded when the user opens the card.
export default defineContentScript({
    matches: ['<all_urls>'],
    allFrames: true,
    matchAboutBlank: true,
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
        // reach the page (see `isolateEvents`).
        const closeUnlessPinned = async () => {
            if (popupCard && !(await isPinned())) {
                closePopupCard()
            }
        }
        document.addEventListener('mousedown', closeUnlessPinned)
        document.addEventListener('touchstart', closeUnlessPinned)
    },
})

let popupCard: { ui: ShadowRootContentScriptUi<() => void>; module: PopupCardModule } | undefined

async function isPinned() {
    const { pinned } = await browser.storage.sync.get('pinned')
    return pinned === true
}

function loadPopupCardModule(): Promise<PopupCardModule> {
    if (import.meta.env.DEV) {
        return import('../content_script/card')
    }
    return import(/* @vite-ignore */ browser.runtime.getURL('/content-card.js'))
}

async function openPopupCard(
    ctx: ContentScriptContext,
    reference: Parameters<PopupCardModule['mountPopupCard']>[1]['reference'],
    text: string
) {
    const pinned = await isPinned()
    if (popupCard && pinned) {
        popupCard.module.setExternalOriginalText(text)
        return
    }
    closePopupCard()
    const module = await loadPopupCardModule()
    const ui = await createShadowRootUi(ctx, {
        name: PREFIX.replace(/^_+/, ''),
        position: 'inline',
        anchor: 'html',
        append: 'last',
        inheritStyles: true,
        isolateEvents: ['mousedown', 'mouseup', 'touchstart', 'touchend'],
        onMount: (container, _shadow, shadowHost) => {
            shadowHost.id = containerID
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
