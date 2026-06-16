import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, ModalBody, ModalHeader } from 'baseui-sd/modal'
import { Input } from 'baseui-sd/input'
import { Button } from 'baseui-sd/button'
import { createUseStyles } from 'react-jss'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../hooks/useTheme'
import { HistoryItem } from '../internal-services/db'
import { historyService } from '../services/history'
import { useLiveQuery } from 'dexie-react-hooks'
import { Tooltip } from './Tooltip'
import { RxTrash, RxCopy } from 'react-icons/rx'
import { MdReplay } from 'react-icons/md'
import color from 'color'
import toast from 'react-hot-toast/headless'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { isTauri } from '../utils'

interface TranslationHistoryProps {
    isOpen: boolean
    onClose: () => void
    onRestore: (item: HistoryItem) => void
    variant?: 'modal' | 'window'
}

const useStyles = createUseStyles({
    body: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxHeight: '70vh',
        width: 'min(720px, 90vw)',
    },
    controls: {
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: '12px',
        alignItems: 'center',
    },
    historyList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        overflowY: 'auto',
        paddingRight: '4px',
    },
    historyItem: {
        'borderRadius': '14px',
        'padding': '14px 18px',
        'display': 'flex',
        'flexDirection': 'column',
        'gap': '10px',
        'transition': 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        },
    },
    historyMeta: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '12px',
        gap: '8px',
        flexWrap: 'wrap',
    },
    historyText: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
    },
    historyTextLabel: {
        fontSize: '10px',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        fontWeight: 600,
        opacity: 0.7,
    },
    historyTextBlock: {
        fontSize: '14px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
    },
    historyActions: {
        display: 'flex',
        flexDirection: 'row',
        gap: '8px',
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    divider: {
        height: '1px',
        opacity: 0.4,
        borderRadius: '1px',
    },
    empty: {
        fontSize: '14px',
        textAlign: 'center',
        padding: '48px 0',
        opacity: 0.6,
    },
    windowRoot: {
        display: 'flex',
        flexDirection: 'column',
        // Cap to the viewport (height, not minHeight) so the flex:1 windowBody is
        // constrained and its own overflowY:auto scrolls instead of the document.
        // Scrolling the document would show the ugly native macOS WKWebView bar.
        height: '100vh',
        boxSizing: 'border-box',
        gap: '16px',
    },
    windowHeader: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'start',
        padding: '40px 32px 20px 32px',
        gap: '14px',
    },
    windowTitleGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
    },
    windowBody: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 32px 32px 32px',
        boxSizing: 'border-box',
        gap: '16px',
        minHeight: 0,
    },
})

export function TranslationHistory(props: TranslationHistoryProps) {
    const { isOpen, onClose, onRestore, variant = 'modal' } = props
    const isModal = variant !== 'window'
    const isActive = isModal ? isOpen : true
    const { t } = useTranslation()
    const { theme, themeType } = useTheme()
    const styles = useStyles()
    const headerRef = useRef<HTMLDivElement>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const [search, setSearch] = useState('')

    useEffect(() => {
        if (!isActive) {
            return
        }
        const timer = window.setTimeout(() => {
            searchInputRef.current?.focus()
        }, 120)
        return () => {
            window.clearTimeout(timer)
        }
    }, [isActive])

    useEffect(() => {
        if (!isModal) {
            return
        }
        if (isOpen) {
            return
        }
        setSearch('')
    }, [isModal, isOpen])

    useEffect(() => {
        if (variant !== 'window' || !isTauri()) {
            return
        }
        const headerNode = headerRef.current
        if (!headerNode) {
            return
        }
        const shouldIgnore = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) {
                return false
            }
            return target.closest('[data-tauri-drag-ignore="true"]') !== null
        }
        const handlePointerDown = (event: PointerEvent) => {
            if (event.button !== 0 || shouldIgnore(event.target)) {
                return
            }
            event.preventDefault()
            WebviewWindow.getCurrent()
                .startDragging()
                .catch((error) => {
                    console.error('Failed to drag history window', error)
                })
        }
        headerNode.addEventListener('pointerdown', handlePointerDown)
        return () => {
            headerNode.removeEventListener('pointerdown', handlePointerDown)
        }
    }, [variant])

    const historyItems = useLiveQuery(
        () => {
            if (!isActive) {
                return []
            }
            return historyService.list({
                search,
                limit: 200,
            })
        },
        [isActive, search],
        []
    )

    const handleRestore = useCallback(
        (item: HistoryItem) => {
            onRestore(item)
        },
        [onRestore]
    )

    const onDelete = async (item: HistoryItem) => {
        if (item.id === undefined) {
            return
        }
        await historyService.delete(item.id)
    }

    const onClear = async () => {
        if (!historyItems?.length) {
            return
        }
        const confirmed = window.confirm(t('Clear All History?'))
        if (!confirmed) {
            return
        }
        await historyService.clear()
    }

    const formatTimestamp = (timestamp: number) => {
        try {
            return new Intl.DateTimeFormat(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
            }).format(new Date(timestamp))
        } catch {
            return new Date(timestamp).toLocaleString()
        }
    }

    const historyCountLabel = historyItems?.length ? ` (${historyItems.length})` : ''
    const headerTitle = (
        <>
            {t('History')}
            {historyCountLabel}
        </>
    )

    const renderControls = (styleOverride?: React.CSSProperties) => (
        <div className={styles.controls} style={styleOverride} data-tauri-drag-ignore='true'>
            <Input
                inputRef={searchInputRef}
                value={search}
                clearable
                placeholder={t('Search History')}
                size='compact'
                onChange={(e) => setSearch(e.currentTarget.value)}
                onClear={() => setSearch('')}
            />
        </div>
    )

    const bodyContent = (
        <div
            className={styles.body}
            style={{
                maxHeight: isModal ? '70vh' : 'none',
                width: isModal ? 'min(720px, 90vw)' : '100%',
                flex: isModal ? undefined : 1,
                margin: isModal ? undefined : '0 auto',
                maxWidth: isModal ? undefined : '960px',
            }}
        >
            {isModal && isActive ? renderControls() : null}
            <div
                className={styles.historyList}
                style={{
                    flex: isModal ? undefined : 1,
                }}
            >
                {isActive && historyItems && historyItems.length > 0 ? (
                    historyItems.map((item) => {
                        const borderColor = theme.colors.borderOpaque
                        const backgroundColor =
                            themeType === 'dark'
                                ? color(theme.colors.backgroundPrimary).lighten(0.15).alpha(0.85).string()
                                : color(theme.colors.backgroundSecondary).alpha(0.9).string()
                        return (
                            <div
                                key={item.id}
                                className={styles.historyItem}
                                style={{
                                    border: `1px solid ${borderColor}`,
                                    background: backgroundColor,
                                    cursor: 'pointer',
                                }}
                                role='button'
                                tabIndex={0}
                                onClick={() => {
                                    void handleRestore(item)
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault()
                                        void handleRestore(item)
                                    }
                                }}
                            >
                                <div className={styles.historyMeta} style={{ color: theme.colors.contentSecondary }}>
                                    <div>
                                        {formatTimestamp(item.createdAt)}
                                        {item.model ? ` · ${item.model}` : ''}
                                    </div>
                                    <div className={styles.historyActions}>
                                        <Tooltip content={t('Restore')} placement='bottom'>
                                            <Button
                                                size='mini'
                                                kind='secondary'
                                                onClick={(event) => {
                                                    event.stopPropagation()
                                                    void handleRestore(item)
                                                }}
                                                overrides={{
                                                    BaseButton: {
                                                        style: { paddingLeft: '6px', paddingRight: '6px' },
                                                    },
                                                }}
                                            >
                                                <MdReplay size={16} />
                                            </Button>
                                        </Tooltip>
                                        <Tooltip content={t('Copy to clipboard')} placement='bottom'>
                                            <Button
                                                size='mini'
                                                kind='tertiary'
                                                onClick={async (event) => {
                                                    event.stopPropagation()
                                                    try {
                                                        if (!navigator?.clipboard?.writeText) {
                                                            throw new Error('Clipboard API unavailable')
                                                        }
                                                        await navigator.clipboard.writeText(item.translatedText)
                                                        toast(t('Copy to clipboard'), {
                                                            duration: 3000,
                                                            icon: '👏',
                                                        })
                                                    } catch (error) {
                                                        console.error(error)
                                                        toast(t('Copy failed'), {
                                                            duration: 3000,
                                                            icon: '⚠️',
                                                        })
                                                    }
                                                }}
                                                overrides={{
                                                    BaseButton: {
                                                        style: { paddingLeft: '6px', paddingRight: '6px' },
                                                    },
                                                }}
                                            >
                                                <RxCopy size={16} />
                                            </Button>
                                        </Tooltip>
                                        <Tooltip content={t('Delete')} placement='bottom'>
                                            <Button
                                                size='mini'
                                                kind='tertiary'
                                                onClick={(event) => {
                                                    event.stopPropagation()
                                                    void onDelete(item)
                                                }}
                                                overrides={{
                                                    BaseButton: {
                                                        style: { paddingLeft: '6px', paddingRight: '6px' },
                                                    },
                                                }}
                                            >
                                                <RxTrash size={16} />
                                            </Button>
                                        </Tooltip>
                                    </div>
                                </div>
                                <div className={styles.historyText}>
                                    <div
                                        className={styles.historyTextLabel}
                                        style={{ color: theme.colors.contentTertiary }}
                                    >
                                        {t('Original Text')}
                                    </div>
                                    <div
                                        className={styles.historyTextBlock}
                                        style={{ color: theme.colors.contentPrimary }}
                                    >
                                        {item.sourceText}
                                    </div>
                                </div>
                                <div className={styles.divider} style={{ background: theme.colors.borderOpaque }} />
                                <div className={styles.historyText}>
                                    <div
                                        className={styles.historyTextLabel}
                                        style={{ color: theme.colors.contentTertiary }}
                                    >
                                        {t('Translation')}
                                    </div>
                                    <div
                                        className={styles.historyTextBlock}
                                        style={{ color: theme.colors.contentPrimary }}
                                    >
                                        {item.translatedText}
                                    </div>
                                </div>
                            </div>
                        )
                    })
                ) : isActive ? (
                    <div className={styles.empty} style={{ color: theme.colors.contentSecondary }}>
                        {t('No History Yet')}
                    </div>
                ) : null}
            </div>
            <div
                className={styles.historyActions}
                style={{
                    justifyContent: isModal ? 'flex-start' : 'flex-end',
                }}
            >
                <Button size='compact' kind='tertiary' onClick={onClose}>
                    {t('Close')}
                </Button>
                <Button size='compact' kind='secondary' onClick={onClear} disabled={!isActive || !historyItems?.length}>
                    {t('Clear History')}
                </Button>
            </div>
        </div>
    )

    if (!isModal) {
        return (
            <div
                className={styles.windowRoot}
                style={{
                    background: theme.colors.backgroundPrimary,
                    color: theme.colors.contentPrimary,
                }}
            >
                <div
                    ref={headerRef}
                    className={styles.windowHeader}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        zIndex: 999,
                        borderBottom: `1px solid ${theme.colors.borderTransparent}`,
                        background:
                            themeType === 'dark'
                                ? color(theme.colors.backgroundPrimary).alpha(0.92).string()
                                : color(theme.colors.backgroundPrimary).alpha(0.94).string(),
                        backdropFilter: 'blur(10px)',
                    }}
                    data-tauri-drag-region
                >
                    <div className={styles.windowTitleGroup}>
                        <div
                            style={{
                                fontSize: '18px',
                                fontWeight: 600,
                            }}
                        >
                            {headerTitle}
                        </div>
                        <div
                            style={{
                                fontSize: '12px',
                                color: theme.colors.contentSecondary,
                            }}
                        >
                            {t('Browse, search, and restore translation entries.')}
                        </div>
                    </div>
                    {!isModal && renderControls({ width: '100%' })}
                </div>
                <div
                    className={styles.windowBody}
                    style={{
                        background: theme.colors.backgroundPrimary,
                        overflowY: 'auto',
                        // Transparent borders inset the scrollbar below the fixed header
                        // (top) and above the rounded bottom corner: WebKit paints the
                        // bar inside the border box, so its ends aren't clipped (same fix
                        // as the settings window). 170px clears the fixed header.
                        borderTop: '170px solid transparent',
                        borderBottom: '16px solid transparent',
                    }}
                >
                    {bodyContent}
                </div>
            </div>
        )
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            closeable
            animate
            size='default'
            overrides={{
                Dialog: {
                    style: {
                        width: 'auto',
                    },
                },
            }}
        >
            <ModalHeader>{headerTitle}</ModalHeader>
            <ModalBody>{bodyContent}</ModalBody>
        </Modal>
    )
}
