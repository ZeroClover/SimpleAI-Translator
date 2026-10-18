import React from 'react'
import { createRoot } from 'react-dom/client'
import { create } from 'jss'
import preset from 'jss-preset-default'
import { JssProvider, createGenerateId } from 'react-jss'
import { Client as Styletron } from 'styletron-engine-atomic'
import { type ReferenceElement } from '@floating-ui/dom'
import '@/common/i18n'
import { PREFIX } from '@/common/constants'
import { Translator } from '@/common/components/Translator'
import { GlobalSuspense } from '@/common/components/GlobalSuspense'
import { setExternalOriginalText } from '@/common/store'
import { popupCardID } from './consts'
import InnerContainer from './InnerContainer'
import TitleBar from './TitleBar'

const generateId = createGenerateId()

export interface PopupCardOptions {
    reference: ReferenceElement
    text: string
    pinned: boolean
    onClose: () => void
}

// Renders the popup card into `container` (inside the content script's shadow root) and returns
// a function that unmounts it.
export function mountPopupCard(container: HTMLElement, { reference, text, pinned, onClose }: PopupCardOptions) {
    const $popupCard = document.createElement('div')
    $popupCard.id = popupCardID
    container.appendChild($popupCard)

    const engine = new Styletron({
        container,
        prefix: `${PREFIX}-styletron-`,
    })
    const jss = create().setup({
        ...preset(),
        insertionPoint: container,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__IS_OT_BROWSER_EXTENSION_CONTENT_SCRIPT__ = true
    const root = createRoot($popupCard)
    root.render(
        <React.StrictMode>
            <GlobalSuspense>
                <JssProvider jss={jss} generateId={generateId} classNamePrefix='__zeroclover-simpleai-translator-jss-'>
                    <InnerContainer reference={reference}>
                        <TitleBar pinned={pinned} onClose={onClose} engine={engine} />
                        <Translator engine={engine} autoFocus={false} showSettingsIcon showLogo={false} />
                    </InnerContainer>
                </JssProvider>
            </GlobalSuspense>
        </React.StrictMode>
    )
    setExternalOriginalText(text)
    return () => root.unmount()
}

export { setExternalOriginalText }
