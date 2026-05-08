import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast/headless'
import { Client as Styletron } from 'styletron-engine-atomic'
import { Provider as StyletronProvider } from 'styletron-react'
import { BaseProvider } from 'baseui-sd'
import { Textarea } from 'baseui-sd/textarea'
import { createUseStyles } from 'react-jss'
import { IoSettingsOutline } from 'react-icons/io5'
import { TiArrowBack } from 'react-icons/ti'
import { TbArrowsExchange } from 'react-icons/tb'
import { MdHistory } from 'react-icons/md'
import { detectLang, getLangConfig, sourceLanguages, targetLanguages, LangCode } from '../lang'
import { translate } from '../translate'
import { Select, Value, Option } from 'baseui-sd/select'
import { RxEraser, RxEnter, RxReload, RxStop } from 'react-icons/rx'
import { clsx } from 'clsx'
import { Button } from 'baseui-sd/button'
import { ErrorBoundary } from 'react-error-boundary'
import { ErrorFallback } from '../components/ErrorFallback'
import { defaultAPIURL, isDesktopApp, isTauri, isBrowserExtensionContentScript, isMacOS } from '../utils'
import { InnerSettings } from './Settings'
import { containerID, popupCardInnerContainerId } from '../../browser-extension/content_script/consts'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import IpLocationNotification from '../components/IpLocationNotification'
import { HighlightInTextarea } from '../highlight-in-textarea'
import { LRUCache } from 'lru-cache'
import { ISettings, IThemedStyleProps } from '../types'
import { useTheme } from '../hooks/useTheme'
import { Tooltip } from './Tooltip'
import { useSettings } from '../hooks/useSettings'
import { Action, HistoryItem } from '../internal-services/db'
import { CopyButton } from './CopyButton'
import { historyService } from '../services/history'
import { TranslationHistory } from './TranslationHistory'
import { IoIosRocket } from 'react-icons/io'
import _ from 'underscore'
import { GlobalSuspense } from './GlobalSuspense'
import { useLazyEffect } from '../usehooks'
import LogoWithText, { type LogoWithTextRef } from './LogoWithText'
import Toaster from './Toaster'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useDeepCompareCallback } from 'use-deep-compare'
import { useTranslatorStore } from '../store'
import { SpeakerIcon } from './SpeakerIcon'
import color from 'color'
import { useAtom } from 'jotai'
import { showSettingsAtom } from '../store/setting'

const cache = new LRUCache({
    max: 500,
    maxSize: 5000,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sizeCalculation: (_value, _key) => {
        return 1
    },
})

function genLangOptions(langs: [LangCode, string][]): Value {
    return langs.reduce((acc, [id, label]) => {
        return [
            ...acc,
            {
                id,
                label,
            } as Option,
        ]
    }, [] as Value)
}
const sourceLangOptions = genLangOptions(sourceLanguages)
const targetLangOptions = genLangOptions(targetLanguages)

const useStyles = createUseStyles({
    'popupCard': {
        height: '100%',
        boxSizing: 'border-box',
    },
    'footer': (props: IThemedStyleProps) => ({
        boxSizing: 'border-box',
        color: props.theme.colors.contentSecondary,
        position: 'fixed',
        width: '100%',
        height: '42px',
        left: '0',
        bottom: '0',
        paddingLeft: '14px',
        paddingRight: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: `1px solid ${props.themeType === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
        transition: 'background 0.3s ease',
    }),
    'footerActions': {
        marginLeft: 'auto',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '8px',
    },
    'poweredBy': (props: IThemedStyleProps) => ({
        fontSize: props.theme.sizing.scale300,
        color: props.theme.colors.contentInverseTertiary,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '4px',
    }),
    'brand': {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '3px',
    },
    'popupCardHeaderContainer': (props: IThemedStyleProps) =>
        props.isDesktopApp
            ? {
                  'position': 'fixed',
                  'backdropFilter': 'blur(20px)',
                  'WebkitBackdropFilter': 'blur(20px)',
                  'zIndex': 1,
                  'left': 0,
                  'top': 0,
                  'width': '100%',
                  'boxSizing': 'border-box',
                  'padding': isMacOS ? '30px 16px 10px' : '10px 16px',
                  'background': props.themeType === 'dark' ? 'rgba(31, 31, 31, 0.65)' : 'rgba(255, 255, 255, 0.65)',
                  'display': 'flex',
                  'flexDirection': 'row',
                  'flexFlow': 'row nowrap',
                  'cursor': 'move',
                  'alignItems': 'center',
                  'borderBottom': `1px solid ${
                      props.themeType === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
                  }`,
                  'transition': 'background 0.3s ease',
                  '-ms-user-select': 'none',
                  '-webkit-user-select': 'none',
                  'user-select': 'none',
              }
            : {
                  'display': 'flex',
                  'flexDirection': 'row',
                  'cursor': 'move',
                  'alignItems': 'center',
                  'padding': '10px 16px',
                  'borderBottom': `1px solid ${
                      props.themeType === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
                  }`,
                  'minWidth': '612px',
                  '-ms-user-select': 'none',
                  '-webkit-user-select': 'none',
                  'user-select': 'none',
              },
    'paragraph': {
        'margin': '0.5em 0',
        '-ms-user-select': 'text',
        '-webkit-user-select': 'text',
        'user-select': 'text',
    },
    'popupCardHeaderButtonGroup': (props: IThemedStyleProps) => ({
        'display': 'flex',
        'flexDirection': 'row',
        'alignItems': 'center',
        'gap': '4px',
        'marginLeft': '10px',
        '@media screen and (max-width: 460px)': {
            marginLeft: props.isDesktopApp ? '5px' : undefined,
        },
    }),
    'popupCardHeaderMoreActionsContainer': () => ({
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 5,
    }),
    'popupCardHeaderMoreActionsBtn': (props: IThemedStyleProps) => ({
        'cursor': 'pointer',
        'display': 'flex',
        'alignItems': 'center',
        'justifyContent': 'center',
        'padding': '5px',
        'borderRadius': '8px',
        'transition': 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        '& *': {
            fill: props.theme.colors.contentPrimary,
            color: props.theme.colors.contentPrimary,
            stroke: props.theme.colors.contentPrimary,
            transition: 'all 0.2s ease',
        },
        '&:hover': {
            background: props.themeType === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
            transform: 'scale(1.05)',
        },
        '&:active': {
            transform: 'scale(0.95)',
        },
    }),
    'popupCardHeaderActionsContainer': (props: IThemedStyleProps) => ({
        'box-sizing': 'border-box',
        'display': 'flex',
        'flexShrink': 0,
        'flexDirection': 'row',
        'alignItems': 'center',
        'padding': props.showLogo ? '5px 10px' : '5px 10px 5px 0px',
        'gap': '10px',
        '@media screen and (max-width: 460px)': {
            padding: props.isDesktopApp ? '5px 0' : undefined,
            gap: props.isDesktopApp ? '5px' : undefined,
        },
    }),
    'from': (props: IThemedStyleProps) => ({
        display: 'flex',
        color: props.theme.colors.contentTertiary,
        fontSize: '12px',
        flexShrink: 0,
    }),
    'arrow': (props: IThemedStyleProps) => ({
        'display': 'flex',
        'color': props.theme.colors.contentTertiary,
        'cursor': 'pointer',
        'borderRadius': '8px',
        'padding': '5px',
        'transition': 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
            color: props.theme.colors.contentPrimary,
            background: props.themeType === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
            transform: 'scale(1.1)',
        },
        '&:active': {
            transform: 'scale(0.9)',
        },
    }),
    'to': (props: IThemedStyleProps) => ({
        display: 'flex',
        color: props.theme.colors.contentTertiary,
        fontSize: '12px',
        flexShrink: 0,
    }),
    'popupCardContentContainer': (props: IThemedStyleProps) => ({
        paddingTop: props.isDesktopApp ? '52px' : undefined,
        display: 'flex',
        flexDirection: 'column',
    }),
    'loadingContainer': {
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '10px',
    },
    'popupCardEditorContainer': {
        display: 'flex',
        flexDirection: 'column',
        padding: '18px 18px 14px',
    },
    'popupCardTranslatedContainer': (props: IThemedStyleProps) => ({
        'position': 'relative',
        'padding': '30px 18px 18px 18px',
        'border-top': `1px solid ${props.themeType === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
        '-ms-user-select': 'none',
        '-webkit-user-select': 'none',
        'user-select': 'none',
    }),
    'tokenCount': (props: IThemedStyleProps) => ({
        color: props.theme.colors.contentTertiary,
        fontSize: '12px',
        fontFamily: 'monospace',
        opacity: 0.7,
    }),
    'actionStr': (props: IThemedStyleProps) => ({
        position: 'absolute',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '6px',
        top: '0',
        left: '50%',
        transform: 'translateX(-50%) translateY(-50%)',
        fontSize: '10px',
        padding: '4px 16px',
        borderRadius: '12px',
        background: props.theme.colors.backgroundTertiary,
        color: props.theme.colors.contentSecondary,
        fontWeight: 500,
        letterSpacing: '0.03em',
    }),
    'error': (props: IThemedStyleProps) => ({
        background: props.themeType === 'dark' ? 'rgba(220, 38, 38, 0.15)' : '#fef2f2',
        color: props.themeType === 'dark' ? '#fca5a5' : '#dc2626',
    }),
    'caret': {
        marginLeft: '4px',
        borderRight: '0.2em solid #888',
        animation: '$caret 600ms ease-in-out infinite',
    },
    '@keyframes caret': {
        '0%, 100%': {
            borderColor: '#888',
        },
        '50%': {
            borderColor: 'transparent',
        },
    },
    'popupCardTranslatedContentContainer': (props: IThemedStyleProps) => ({
        'marginTop': '-14px',
        'display': 'flex',
        'overflowY': 'auto',
        'color': props.themeType === 'dark' ? props.theme.colors.contentSecondary : props.theme.colors.contentPrimary,
        '& *': {
            '-ms-user-select': 'text',
            '-webkit-user-select': 'text',
            'user-select': 'text',
        },
        '& > div': {
            width: '100%',
        },
    }),
    'errorMessage': (props: IThemedStyleProps) => ({
        'display': 'flex',
        'color': props.themeType === 'dark' ? '#fca5a5' : '#dc2626',
        'alignItems': 'center',
        'gap': '8px',
        'fontSize': '13px',
        'padding': '10px 14px',
        'borderRadius': '10px',
        'background': props.themeType === 'dark' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(220, 38, 38, 0.05)',
        'border': `1px solid ${props.themeType === 'dark' ? 'rgba(220, 38, 38, 0.15)' : 'rgba(220, 38, 38, 0.08)'}`,
        '& *': {
            '-ms-user-select': 'text',
            '-webkit-user-select': 'text',
            'user-select': 'text',
        },
    }),
    'actionButtonsContainer': {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '4px',
        marginTop: '4px',
    },
    'actionButton': (props: IThemedStyleProps) => ({
        'color': props.theme.colors.contentSecondary,
        'cursor': 'pointer',
        'display': 'flex',
        'alignItems': 'center',
        'justifyContent': 'center',
        'padding': '6px',
        'borderRadius': '8px',
        'transition': 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
            color: props.theme.colors.contentPrimary,
            background: props.themeType === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
            transform: 'scale(1.08)',
        },
        '&:active': {
            transform: 'scale(0.92)',
        },
    }),
    'actionButtonDisabled': (props: IThemedStyleProps) => ({
        color: props.theme.colors.buttonDisabledText,
        cursor: 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px',
        borderRadius: '8px',
        opacity: 0.4,
    }),
    'enterHint': (props: IThemedStyleProps) => ({
        color: props.theme.colors.contentTertiary,
        fontSize: '11px',
        opacity: 0.7,
    }),
    'writing': {
        'marginLeft': '3px',
        'width': '10px',
        '&::after': {
            content: '"✍️"',
            animation: '$writing 1.3s infinite',
        },
    },
    '@keyframes writing': {
        '50%': {
            marginLeft: '-3px',
            marginBottom: '-3px',
        },
    },
    'dropZone': (props: IThemedStyleProps) => ({
        'display': 'flex',
        'flexDirection': 'column',
        'alignItems': 'center',
        'justifyContent': 'center',
        'padding-left': '3px',
        'padding-right': '3px',
        'borderRadius': '12px',
        'cursor': 'pointer',
        'transition': 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        '-ms-user-select': 'none',
        '-webkit-user-select': 'none',
        'user-select': 'none',
        'border': `1.5px dashed ${props.themeType === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
        'background': props.themeType === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        'color': props.theme.colors.contentSecondary,
        '&:hover': {
            background: props.themeType === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            borderColor: props.themeType === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
        },
    }),
    'flexPlaceHolder': {
        marginRight: 'auto',
    },
    'popupCardContentContainerBackgroundBlur': {
        'height': '100vh',
        'boxSizing': 'border-box',
        'overflow': 'auto',
        'paddingTop': isMacOS ? '82px !important' : '58px !important',
        'paddingBottom': '42px',
        'scrollbarWidth': 'none',
        '&::-webkit-scrollbar': {
            display: 'none',
        },
        'mask': 'linear-gradient(180deg, #0000 58px, #000f 72px, #000f calc(100% - 60px), #0000 calc(100% - 40px));',
    },
})

const translateAction: Action = {
    id: 0,
    idx: 0,
    mode: 'translate',
    name: 'Translate',
    createdAt: '',
    updatedAt: '',
}

const translateActionStrItem = {
    beforeStr: 'Translating...',
    afterStr: 'Translated',
}

export interface MovementXY {
    x: number
    y: number
}

export interface IInnerTranslatorProps {
    uuid?: string
    autoFocus?: boolean
    showSettingsIcon?: boolean
    showSettings?: boolean
    defaultShowSettings?: boolean
    containerStyle?: React.CSSProperties
    editorRows?: number
    showLogo?: boolean
    onSettingsSave?: (oldSettings: ISettings) => void
    onSettingsShow?: (isShow: boolean) => void
}

export interface ITranslatorProps extends IInnerTranslatorProps {
    engine: Styletron
}

export function Translator(props: ITranslatorProps) {
    const { theme } = useTheme()

    return (
        <ErrorBoundary FallbackComponent={ErrorFallback}>
            <div>
                <StyletronProvider value={props.engine}>
                    <BaseProvider theme={theme}>
                        <GlobalSuspense>
                            <InnerTranslator {...props} />
                        </GlobalSuspense>
                    </BaseProvider>
                </StyletronProvider>
            </div>
        </ErrorBoundary>
    )
}

function InnerTranslator(props: IInnerTranslatorProps) {
    const [showSettings, setShowSettings] = useAtom(showSettingsAtom)

    useEffect(() => {
        setShowSettings(props.showSettings ?? false)
    }, [props.showSettings, props.uuid, setShowSettings])

    const { onSettingsShow } = props

    useEffect(() => {
        onSettingsShow?.(showSettings)
    }, [onSettingsShow, showSettings])

    const { showLogo = true } = props

    const [isHistoryOpen, setIsHistoryOpen] = useState(false)

    const [translationFlag, forceTranslate] = useReducer((x: number) => x + 1, 0)
    const translationIDRef = useRef(0)
    const skipNextTranslateRef = useRef(false)
    const historyEntryIdRef = useRef<number | null>(null)
    const lastHistoryKeyRef = useRef<string | null>(null)

    const editorRef = useRef<HTMLTextAreaElement>(null)
    const isCompositing = useRef(false)
    const [selectedWord, setSelectedWord] = useState('')
    const highlightRef = useRef<HighlightInTextarea | null>(null)
    const { t, i18n } = useTranslation()
    const { settings } = useSettings()
    const providerOptions = useMemo(
        () =>
            settings.providers.map((provider) => ({
                id: provider.id,
                label: provider.name,
            })),
        [settings.providers]
    )
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
        settings.defaultProviderId ?? settings.providers[0]?.id ?? null
    )
    const selectedProvider = useMemo(
        () => settings.providers.find((provider) => provider.id === selectedProviderId),
        [selectedProviderId, settings.providers]
    )

    useEffect(() => {
        setSelectedProviderId((currentProviderId) => {
            if (currentProviderId && settings.providers.some((provider) => provider.id === currentProviderId)) {
                return currentProviderId
            }
            return settings.defaultProviderId ?? settings.providers[0]?.id ?? null
        })
    }, [settings.defaultProviderId, settings.providers])

    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (settings?.i18n !== (i18n as any).language) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(i18n as any).changeLanguage(settings?.i18n)
        }
    }, [i18n, settings.i18n])

    const [autoFocus, setAutoFocus] = useState(false)

    useEffect(() => {
        if (highlightRef.current) {
            if (props.autoFocus) {
                setAutoFocus(false)
                setTimeout(() => {
                    setAutoFocus(true)
                }, 500)
            }
            return
        }
        const editor = editorRef.current
        if (!editor) {
            return undefined
        }
        highlightRef.current = new HighlightInTextarea(editor, { highlight: [] })
        if (props.autoFocus) {
            editor.focus()
        }
    }, [props.autoFocus])

    useEffect(() => {
        const editor = editorRef.current
        if (!editor) {
            return undefined
        }
        editor.focus()
        editor.spellcheck = false
    }, [props.uuid, showSettings])

    useEffect(() => {
        if (!isTauri()) {
            return undefined
        }
        let unlisten: UnlistenFn | undefined
        const appWindow = WebviewWindow.getCurrent()
        appWindow
            .listen('tauri://focus', () => {
                const editor = editorRef.current
                if (!editor) {
                    return
                }
                editor.focus()
            })
            .then((cb: UnlistenFn) => {
                unlisten = cb
            })
        return () => {
            unlisten?.()
        }
    }, [])

    useEffect(() => {
        if (!highlightRef.current?.highlight) {
            return
        }
        if (selectedWord) {
            highlightRef.current.highlight.highlight = [selectedWord]
        } else {
            highlightRef.current.highlight.highlight = []
        }
        highlightRef.current.handleInput()
    }, [selectedWord])

    const headerRef = useRef<HTMLDivElement>(null)

    const logoWithTextRef = useRef<LogoWithTextRef>(null)

    const languagesSelectorRef = useRef<HTMLDivElement>(null)

    const containerRef = useRef<HTMLDivElement>(null)
    const editorContainerRef = useRef<HTMLDivElement>(null)
    const translatedContainerRef = useRef<HTMLDivElement>(null)

    const translatedContentRef = useRef<HTMLDivElement>(null)

    const actionButtonsRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const editor = editorRef.current
        if (!editor) {
            return undefined
        }
        const onCompositionStart = () => {
            isCompositing.current = true
        }
        const onCompositionEnd = () => {
            isCompositing.current = false
        }
        const onMouseUp = () => {
            if (editor.selectionStart === 0 && editor.selectionEnd === editor.value.length) {
                setSelectedWord('')
                return
            }
            const selectedWord_ = editor.value.substring(editor.selectionStart, editor.selectionEnd).trim()
            setSelectedWord(selectedWord_)
        }
        const onBlur = onMouseUp

        editor.addEventListener('compositionstart', onCompositionStart)
        editor.addEventListener('compositionend', onCompositionEnd)
        editor.addEventListener('mouseup', onMouseUp)
        editor.addEventListener('blur', onBlur)

        return () => {
            editor.removeEventListener('compositionstart', onCompositionStart)
            editor.removeEventListener('compositionend', onCompositionEnd)
            editor.removeEventListener('mouseup', onMouseUp)
            editor.removeEventListener('blur', onBlur)
        }
    }, [])

    const { theme, themeType } = useTheme()

    const styles = useStyles({
        theme,
        themeType,
        isDesktopApp: isDesktopApp(),
        showLogo,
    })
    const [isLoading, setIsLoading] = useState(false)
    const [editableText, setEditableText] = useState('')
    const [tokenCount, setTokenCount] = useState(0)
    const [translatedText, setTranslatedText] = useState('')
    const [translatedLines, setTranslatedLines] = useState<string[]>([])
    const [isWordMode, setIsWordMode] = useState(false)
    const isWordModeRef = useRef(false)

    const [translateDeps, setTranslateDeps] = useState<{
        sourceLang?: LangCode
        targetLang?: LangCode
        text: string
        action: Action
        providerId?: string
        engineModel?: string
    }>({
        sourceLang: undefined,
        targetLang: undefined,
        text: '',
        action: translateAction,
        providerId: undefined,
        engineModel: undefined,
    })

    useEffect(() => {
        setTranslateDeps((prev) => ({
            ...prev,
            providerId: selectedProvider?.id,
            engineModel: selectedProvider?.model,
        }))
    }, [selectedProvider?.id, selectedProvider?.model])

    const getTranslateDeps = useCallback(
        async function (text: string): Promise<typeof translateDeps> {
            const newSourceLang = await detectLang(text)
            setSourceLang(newSourceLang)
            return await new Promise((resolve) => {
                setTargetLang((targetLang_) => {
                    const newTargetLang = (() => {
                        if (!stopAutomaticallyChangeTargetLang.current || newSourceLang === targetLang_) {
                            return (
                                (newSourceLang === 'zh-Hans' || newSourceLang === 'zh-Hant'
                                    ? 'en'
                                    : (settings?.defaultTargetLanguage as LangCode | undefined)) ?? 'en'
                            )
                        }
                        if (!targetLang_) {
                            if (settings?.defaultTargetLanguage) {
                                return settings.defaultTargetLanguage as LangCode
                            }
                            return newSourceLang
                        }
                        return targetLang_
                    })()
                    setTranslateDeps((oldV) => {
                        const newV: typeof translateDeps = {
                            ...oldV,
                            sourceLang: newSourceLang,
                            targetLang: newTargetLang,
                            text,
                            action: translateAction,
                            providerId: selectedProvider?.id,
                            engineModel: selectedProvider?.model,
                        }
                        resolve(newV)
                        return oldV
                    })
                    return newTargetLang
                })
            })
        },
        [selectedProvider?.id, selectedProvider?.model, settings.defaultTargetLanguage]
    )

    const { externalOriginalText } = useTranslatorStore()

    useEffect(() => {
        if (externalOriginalText === undefined) {
            return
        }
        setEditableText(externalOriginalText)
        getTranslateDeps(externalOriginalText).then((v) => {
            setTranslateDeps(v)
        })
        setSelectedWord('')
    }, [externalOriginalText, getTranslateDeps, props.uuid])

    useEffect(() => {
        setEditableText(translateDeps.text)
    }, [translateDeps.text])

    useLazyEffect(
        () => {
            ;(async () => {
                // use dynamic import to reduce bundle size
                const { countTokens } = await import('../token')
                setTokenCount(countTokens(editableText, settings?.apiModel))
            })()
        },
        [editableText],
        500
    )

    useEffect(() => {
        setTranslatedLines(translatedText.split('\n'))
    }, [translatedText])
    useEffect(() => {
        isWordModeRef.current = isWordMode
    }, [isWordMode])
    const [errorMessage, setErrorMessage] = useState('')
    const startLoading = useCallback(() => {
        setIsLoading(true)
    }, [])
    const stopLoading = useCallback(() => {
        setIsLoading(false)
    }, [])
    const [sourceLang, setSourceLang] = useState<LangCode>('en')
    const [targetLang, setTargetLang] = useState<LangCode>()
    const stopAutomaticallyChangeTargetLang = useRef(false)

    const [actionStr, setActionStr] = useState('')

    useEffect(() => {
        const editor = editorRef.current
        if (!editor) return
        editor.dir = getLangConfig(sourceLang).direction
    }, [sourceLang, actionStr])

    const translatedLanguageDirection = useMemo(() => getLangConfig(sourceLang).direction, [sourceLang])

    useEffect(() => {
        const popupCardInnerContainer: HTMLDivElement | null | undefined = document
            .querySelector(`#${containerID}`)
            ?.shadowRoot?.querySelector(`#${popupCardInnerContainerId}`)

        if (!popupCardInnerContainer) {
            return
        }

        const calculateTranslatedContentMaxHeight = (): number => {
            const { innerHeight } = window
            const maxHeight = popupCardInnerContainer ? parseInt(popupCardInnerContainer.style.maxHeight) : innerHeight

            const editorHeight = editorContainerRef.current?.offsetHeight || 0
            const actionButtonsHeight = actionButtonsRef.current?.offsetHeight || 0
            const headerHeight = headerRef.current?.offsetHeight || 0
            const { paddingTop, paddingBottom } = getComputedStyle(translatedContainerRef.current as HTMLDivElement)
            const { paddingTop: containerPaddingTop, paddingBottom: containerPaddingBottom } = getComputedStyle(
                containerRef.current as HTMLDivElement
            )
            const paddingVertical =
                parseInt(paddingTop) +
                parseInt(paddingBottom) +
                parseInt(containerPaddingTop) +
                parseInt(containerPaddingBottom)

            return maxHeight - headerHeight - editorHeight - actionButtonsHeight - paddingVertical
        }

        const resizeHandle: ResizeObserverCallback = _.debounce(() => {
            // Listen for element height changes
            const $translatedContent = translatedContentRef.current
            if ($translatedContent) {
                const translatedContentMaxHeight = calculateTranslatedContentMaxHeight()
                $translatedContent.style.maxHeight = `${translatedContentMaxHeight}px`
            }
        }, 500)

        const observer = new ResizeObserver(resizeHandle)
        observer.observe(popupCardInnerContainer)
        return () => {
            observer.disconnect()
        }
    }, [showSettings])

    const translateText = useDeepCompareCallback(
        async (selectedWord: string, signal: AbortSignal) => {
            if (skipNextTranslateRef.current) {
                skipNextTranslateRef.current = false
                return
            }
            translationIDRef.current += 1
            if (translationIDRef.current > 1024) {
                translationIDRef.current = 0
            }
            const translationID = translationIDRef.current
            const { text, sourceLang, targetLang } = translateDeps
            if (!text || !sourceLang || !targetLang) {
                return
            }
            const persistHistory = async (resultText: string) => {
                if (!resultText || !resultText.trim()) {
                    return
                }
                if (!translateDeps.text || !translateDeps.sourceLang || !translateDeps.targetLang) {
                    return
                }
                const dedupeKey = `${translateDeps.text}__${resultText}__${translateDeps.sourceLang}__${
                    translateDeps.targetLang
                }__${translateDeps.providerId ?? ''}__${translateDeps.engineModel ?? ''}`
                if (lastHistoryKeyRef.current === dedupeKey) {
                    return
                }
                try {
                    if (historyEntryIdRef.current !== null) {
                        await historyService.update(historyEntryIdRef.current, {
                            translatedText: resultText,
                            tokenCount,
                        })
                    } else {
                        const history = await historyService.create({
                            text: translateDeps.text,
                            translatedText: resultText,
                            sourceLang: translateDeps.sourceLang,
                            targetLang: translateDeps.targetLang,
                            actionId: translateDeps.action.id,
                            actionName: translateDeps.action.name,
                            actionMode: translateDeps.action.mode,
                            provider: translateDeps.providerId ?? selectedProvider?.id,
                            engineModel: translateDeps.engineModel ?? selectedProvider?.model,
                            wordMode: isWordModeRef.current,
                            tokenCount,
                        })
                        historyEntryIdRef.current = history.id ?? null
                    }
                    lastHistoryKeyRef.current = dedupeKey
                } catch (error) {
                    console.error('Failed to persist history', error)
                }
            }
            const beforeTranslate = () => {
                historyEntryIdRef.current = null
                lastHistoryKeyRef.current = null
                setActionStr(translateActionStrItem.beforeStr)
                setTranslatedText('')
                setErrorMessage('')
                startLoading()
            }
            const afterTranslate = (reason: string) => {
                stopLoading()
                if (reason !== 'stop' && reason !== 'eos' && reason !== 'end_turn') {
                    if (reason === 'length' || reason === 'max_tokens') {
                        toast(t('Chars Limited'), {
                            duration: 5000,
                            icon: '😥',
                        })
                    } else {
                        setActionStr((actionStr_) => {
                            let errMsg = `${actionStr_} failed, finish_reason: ${reason}`
                            if (reason === 'content_filter') {
                                errMsg = `很抱歉！由于您使用的 LLM 有敏感词限制，很不幸这个请求已经触发了敏感词，请您接受这个结果。`
                            }
                            setErrorMessage(errMsg)
                            return 'Error'
                        })
                    }
                } else {
                    setActionStr(translateActionStrItem.afterStr)
                }
            }
            beforeTranslate()
            const cachedKey = `translate:${translateDeps.providerId ?? ''}:${
                translateDeps.engineModel ?? ''
            }:${sourceLang}:${targetLang}:${text}:${selectedWord}:${translationFlag}`
            const cachedValue = cache.get(cachedKey)
            if (cachedValue) {
                const cachedText = cachedValue as string
                afterTranslate('stop')
                setTranslatedText(cachedText)
                void persistHistory(cachedText)
                return
            }
            let isStopped = false
            try {
                // console.debug('translate', sourceLang, targetLang, text)
                await translate({
                    signal,
                    text,
                    selectedWord,
                    detectFrom: sourceLang,
                    detectTo: targetLang,
                    providerId: translateDeps.providerId ?? selectedProvider?.id,
                    onStatusCode: () => {},
                    onMessage: async (message) => {
                        if (!message.content) {
                            return
                        }
                        setIsWordMode(message.isWordMode)
                        setTranslatedText((translatedText) => {
                            if (message.isFullText) {
                                return message.content
                            }
                            return translatedText + message.content
                        })
                    },
                    onFinish: (reason) => {
                        afterTranslate(reason)
                        setTranslatedText((translatedText) => {
                            const result = translatedText
                            cache.set(cachedKey, result)
                            void persistHistory(result)
                            return result
                        })
                    },
                    onError: (error) => {
                        setActionStr('Error')
                        setErrorMessage(error)
                    },
                })
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                // if error is a AbortError then ignore this error
                if (error.name === 'AbortError') {
                    isStopped = true
                    return
                }
                setActionStr('Error')
                setErrorMessage((error as Error).toString())
            } finally {
                if (!isStopped && translationID === translationIDRef.current) {
                    stopLoading()
                    isStopped = true
                }
            }
        },
        [selectedProvider?.id, selectedProvider?.model, translateDeps, translationFlag, startLoading, stopLoading, t]
    )

    const translateControllerRef = useRef<AbortController | null>(null)
    useEffect(() => {
        translateControllerRef.current = new AbortController()
        const { signal } = translateControllerRef.current
        translateText(selectedWord, signal)
        return () => {
            translateControllerRef.current?.abort()
        }
    }, [translateText, selectedWord])

    const handleHistoryRestore = useCallback(
        (item: HistoryItem) => {
            historyEntryIdRef.current = item.id ?? null
            lastHistoryKeyRef.current = null
            skipNextTranslateRef.current = true
            setSourceLang(item.sourceLang)
            setTargetLang(item.targetLang)
            setEditableText(item.text)
            setTranslatedText(item.translatedText)
            setActionStr('')
            setErrorMessage('')
            setSelectedWord('')
            setTranslateDeps((prev) => {
                const providerIdFromHistory = settings.providers.some((provider) => provider.id === item.provider)
                    ? item.provider
                    : undefined
                if (providerIdFromHistory) {
                    setSelectedProviderId(providerIdFromHistory)
                }
                return {
                    ...prev,
                    text: item.text,
                    sourceLang: item.sourceLang,
                    targetLang: item.targetLang,
                    action: translateAction,
                    providerId: providerIdFromHistory ?? prev.providerId ?? selectedProviderId ?? undefined,
                    engineModel: item.engineModel ?? prev.engineModel,
                }
            })
        },
        [selectedProviderId, settings.providers]
    )

    useEffect(() => {
        if (!isDesktopApp()) {
            return
        }
        let unlistenHistory: UnlistenFn | undefined
        listen<HistoryItem>('history:restore', ({ payload }) => {
            handleHistoryRestore(payload)
        }).then((cb) => {
            unlistenHistory = cb
        })
        return () => {
            unlistenHistory?.()
        }
    }, [handleHistoryRestore])

    useEffect(() => {
        if (!props.defaultShowSettings) {
            return
        }
        if (!settings) {
            return
        }
        if (settings.providers.length === 0) {
            setShowSettings(true)
        }
    }, [props.defaultShowSettings, setShowSettings, settings])

    const editableTextSpeakingIconRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (selectedWord === '' || settings?.readSelectedWordsFromInputElementsText === false) {
            return
        }
        console.debug('speak selected word', selectedWord)
        editableTextSpeakingIconRef.current?.click()
    }, [selectedWord, settings.readSelectedWordsFromInputElementsText])

    const handleStopGenerating = () => {
        translateControllerRef.current?.abort('stop')
        stopLoading()
        setActionStr('Stopped')
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleInsertTranslatedText = useCallback(async () => {
        if (!translatedText || !isTauri()) {
            return
        }
        try {
            const { commands } = await import('@/tauri/bindings')
            await commands.insertTranslationIntoPreviousInput(translatedText)
            toast(t('Inserted into previous input'), {
                icon: '✅',
                duration: 2000,
            })
        } catch (error) {
            console.error(error)
            toast(t('Failed to insert into previous input'), {
                icon: '⚠️',
                duration: 3000,
            })
        }
    }, [t, translatedText])

    const [isScrolledToTop, setIsScrolledToTop] = useState(false)
    const [isScrolledToBottom, setIsScrolledToBottom] = useState(false)

    useEffect(() => {
        const isOnTop = () => {
            return document.documentElement.scrollTop === 0
        }
        const isOnBottom = () => {
            const scrollTop = document.documentElement.scrollTop

            const windowHeight = window.innerHeight

            const documentHeight = document.documentElement.scrollHeight

            return scrollTop + windowHeight >= documentHeight
        }

        setIsScrolledToTop(isOnTop())
        setIsScrolledToBottom(isOnBottom())

        const onScroll = () => {
            setIsScrolledToTop(isOnTop())
            setIsScrolledToBottom(isOnBottom())
        }

        window.addEventListener('scroll', onScroll)
        window.addEventListener('resize', onScroll)
        const observer = new MutationObserver(onScroll)
        observer.observe(document.body, {
            childList: true,
            subtree: true,
        })
        return () => {
            window.removeEventListener('scroll', onScroll)
            window.removeEventListener('resize', onScroll)
            observer.disconnect()
        }
    }, [showSettings])

    const showSubmitButton = () => {
        if (!editableText) {
            return false
        }

        if (!selectedProvider) {
            return false
        }

        if (editableText !== translateDeps.text) {
            return true
        }

        return false
    }

    const handleSubmit = useCallback(
        (e: React.SyntheticEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLTextAreaElement>) => {
            e.preventDefault()
            e.stopPropagation()
            if (!selectedProvider) {
                setActionStr('Error')
                setErrorMessage(t('Please add an LLM Provider in settings first.'))
                return
            }
            const text = editorRef.current?.value ?? ''
            getTranslateDeps(text).then((v) => {
                setTranslateDeps(v)
            })
        },
        [getTranslateDeps, selectedProvider, t]
    )

    const getFooterBackgroundColor = useCallback(() => {
        if (settings.enableBackgroundBlur) {
            return 'transparent !important'
        }
        return color(theme.colors.backgroundPrimary).alpha(0.5).string()
    }, [settings.enableBackgroundBlur, theme.colors.backgroundPrimary])

    return (
        <div
            className={clsx(styles.popupCard, {
                'yetone-dark': themeType === 'dark',
            })}
            ref={containerRef}
            style={{
                background: isDesktopApp() ? 'transparent' : theme.colors.backgroundPrimary,
                paddingBottom: showSettings || settings.enableBackgroundBlur ? '0px' : '42px',
            }}
        >
            {showSettings && (
                <InnerSettings
                    onSave={(oldSettings) => {
                        props.onSettingsSave?.(oldSettings)
                    }}
                />
            )}
            <div
                style={{
                    display: !showSettings ? 'block' : 'none',
                }}
            >
                <div style={props.containerStyle}>
                    <div
                        ref={headerRef}
                        className={styles.popupCardHeaderContainer}
                        data-tauri-drag-region
                        style={{
                            cursor: isDesktopApp() ? 'default' : showLogo ? 'move' : 'default',
                            boxShadow: isDesktopApp() && !isScrolledToTop ? theme.lighting.shadow600 : undefined,
                            background: settings.enableBackgroundBlur ? 'transparent' : '',
                        }}
                    >
                        {showLogo ? (
                            <LogoWithText ref={logoWithTextRef} />
                        ) : (
                            <div style={{ flexShrink: 0, marginRight: 'auto' }} />
                        )}
                        <div className={styles.popupCardHeaderActionsContainer} ref={languagesSelectorRef}>
                            <div className={styles.from}>
                                <Select
                                    size='mini'
                                    clearable={false}
                                    options={sourceLangOptions}
                                    value={[{ id: sourceLang }]}
                                    overrides={{
                                        Root: {
                                            style: {
                                                minWidth: '110px',
                                            },
                                        },
                                    }}
                                    onChange={({ value }) => {
                                        const langId = value.length > 0 ? value[0].id : sourceLangOptions[0].id
                                        setSourceLang(langId as LangCode)
                                        setTranslateDeps((v) => {
                                            return {
                                                ...v,
                                                text: editableText,
                                                sourceLang: langId as LangCode,
                                            }
                                        })
                                    }}
                                />
                            </div>
                            <div
                                className={styles.arrow}
                                onClick={() => {
                                    setTranslateDeps((v) => ({
                                        ...v,
                                        text: translatedText,
                                        sourceLang: targetLang ?? 'en',
                                        targetLang: sourceLang,
                                    }))
                                    setSourceLang(targetLang ?? 'en')
                                    setTargetLang(sourceLang)
                                    editorRef.current?.focus()
                                }}
                            >
                                <Tooltip content='Exchange' placement='top'>
                                    <div>
                                        <TbArrowsExchange />
                                    </div>
                                </Tooltip>
                            </div>
                            <div className={styles.to}>
                                <Select
                                    size='mini'
                                    clearable={false}
                                    options={targetLangOptions}
                                    value={[{ id: targetLang }]}
                                    overrides={{
                                        Root: {
                                            style: {
                                                minWidth: '110px',
                                            },
                                        },
                                    }}
                                    onChange={({ value }) => {
                                        stopAutomaticallyChangeTargetLang.current = true
                                        const langId = value.length > 0 ? value[0].id : targetLangOptions[0].id
                                        setTargetLang(langId as LangCode)
                                        setTranslateDeps((v) => {
                                            return {
                                                ...v,
                                                text: editableText,
                                                targetLang: langId as LangCode,
                                            }
                                        })
                                    }}
                                />
                            </div>
                            {providerOptions.length > 0 && (
                                <div className={styles.to}>
                                    <Select
                                        size='mini'
                                        clearable={false}
                                        options={providerOptions}
                                        value={
                                            selectedProvider
                                                ? [{ id: selectedProvider.id, label: selectedProvider.name }]
                                                : []
                                        }
                                        overrides={{
                                            Root: {
                                                style: {
                                                    minWidth: '130px',
                                                },
                                            },
                                        }}
                                        onChange={({ value }) => {
                                            const providerId = value.length > 0 ? value[0].id : providerOptions[0].id
                                            setSelectedProviderId(providerId as string)
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                    <div
                        className={clsx(
                            styles.popupCardContentContainer,
                            settings.enableBackgroundBlur && styles.popupCardContentContainerBackgroundBlur
                        )}
                    >
                        {settings?.apiURL === defaultAPIURL && (
                            <div>
                                <IpLocationNotification showSettings={showSettings} />
                            </div>
                        )}
                        {providerOptions.length === 0 && (
                            <div
                                style={{
                                    margin: '0 0 10px',
                                    padding: '8px 10px',
                                    borderRadius: 8,
                                    color: theme.colors.contentPrimary,
                                    background: theme.colors.backgroundSecondary,
                                    fontSize: 12,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                }}
                            >
                                <span>{t('Please add an LLM Provider in settings first.')}</span>
                                <Button
                                    size='mini'
                                    kind='secondary'
                                    onClick={async (event) => {
                                        event.stopPropagation()
                                        event.preventDefault()
                                        if (isBrowserExtensionContentScript()) {
                                            const browser = (await import('webextension-polyfill')).default
                                            await browser.runtime.sendMessage({
                                                type: 'openOptionsPage',
                                            })
                                            return
                                        }
                                        setShowSettings(true)
                                    }}
                                >
                                    {t('Settings')}
                                </Button>
                            </div>
                        )}
                        <div ref={editorContainerRef} className={styles.popupCardEditorContainer}>
                            <div
                                style={{
                                    height: 0,
                                    overflow: 'hidden',
                                }}
                            >
                                {editableText}
                            </div>
                            <div>
                                <Textarea
                                    inputRef={editorRef}
                                    autoFocus={autoFocus}
                                    overrides={{
                                        Root: {
                                            style: {
                                                fontSize: `${settings.fontSize}px !important`,
                                                width: '100%',
                                                borderRadius: '8px',
                                                background: settings.enableBackgroundBlur
                                                    ? 'transparent !important'
                                                    : undefined,
                                                borderWidth: settings.enableBackgroundBlur ? '1px' : undefined,
                                            },
                                        },
                                        InputContainer: {
                                            style: settings.enableBackgroundBlur
                                                ? ({ $theme, $isFocused }) => ({
                                                      background:
                                                          ($isFocused
                                                              ? $theme.colors.backgroundSecondary
                                                              : $theme.colors.backgroundTertiary) + '80',
                                                  })
                                                : null,
                                        },
                                        Input: {
                                            style: {
                                                fontSize: `${settings.fontSize}px !important`,
                                                padding: '4px 8px',
                                                color:
                                                    themeType === 'dark'
                                                        ? theme.colors.contentSecondary
                                                        : theme.colors.contentPrimary,
                                                fontFamily: 'inherit',
                                                textalign: 'start',
                                            },
                                        },
                                    }}
                                    value={editableText}
                                    size='mini'
                                    resize='vertical'
                                    rows={
                                        props.editorRows
                                            ? props.editorRows
                                            : Math.min(Math.max(editableText.split('\n').length, 3), 12)
                                    }
                                    onChange={(e) => setEditableText(e.target.value)}
                                    onKeyDown={(e) => {
                                        e.stopPropagation()
                                    }}
                                    onKeyUp={(e) => {
                                        e.stopPropagation()
                                    }}
                                    onKeyPress={(e) => {
                                        e.stopPropagation()
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            handleSubmit(e)
                                        }
                                    }}
                                />
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        paddingTop: showSubmitButton() ? 8 : 0,
                                        height: showSubmitButton() ? 28 : 0,
                                        transition: 'all 0.3s linear',
                                        overflow: 'hidden',
                                    }}
                                >
                                    <div className={styles.tokenCount}> {tokenCount} </div>
                                    <div className={styles.flexPlaceHolder} />
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 10,
                                        }}
                                    >
                                        <div className={styles.enterHint}>
                                            {'Press <Enter> to submit, <Shift+Enter> for a new line.'}
                                        </div>
                                        <Button
                                            size='mini'
                                            onClick={handleSubmit}
                                            startEnhancer={<IoIosRocket size={13} />}
                                            overrides={{
                                                StartEnhancer: {
                                                    style: {
                                                        marginRight: '6px',
                                                    },
                                                },
                                                BaseButton: {
                                                    style: {
                                                        fontWeight: 'normal',
                                                        fontSize: '12px',
                                                        padding: '4px 8px',
                                                    },
                                                },
                                            }}
                                        >
                                            {t('Submit')}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            <div className={styles.actionButtonsContainer}>
                                <div style={{ marginLeft: 'auto' }}></div>
                                {!!editableText.length && (
                                    <>
                                        {isLoading && (
                                            <Tooltip content={t('Stop')} placement='bottom'>
                                                <div className={styles.actionButton} onClick={handleStopGenerating}>
                                                    <RxStop size={15} />
                                                </div>
                                            </Tooltip>
                                        )}
                                        {!isLoading && translatedText && (
                                            <Tooltip content={t('Retry')} placement='bottom'>
                                                <div onClick={() => forceTranslate()} className={styles.actionButton}>
                                                    <RxReload size={15} />
                                                </div>
                                            </Tooltip>
                                        )}
                                        <Tooltip content={t('Speak')} placement='bottom'>
                                            <div className={styles.actionButton}>
                                                <SpeakerIcon
                                                    size={15}
                                                    divRef={editableTextSpeakingIconRef}
                                                    provider={settings.tts?.provider}
                                                    text={selectedWord ? selectedWord : editableText}
                                                    lang={sourceLang}
                                                    voice={
                                                        settings.tts?.voices?.find((item) => item.lang === sourceLang)
                                                            ?.voice
                                                    }
                                                    rate={settings.tts?.rate}
                                                    volume={settings.tts?.volume}
                                                />
                                            </div>
                                        </Tooltip>
                                        <CopyButton text={editableText} styles={styles}></CopyButton>
                                        <Tooltip content={t('Clear input')} placement='bottom'>
                                            <div
                                                className={styles.actionButton}
                                                onClick={() => {
                                                    setEditableText('')
                                                    setTranslatedText('')
                                                    setTranslateDeps((v) => {
                                                        return {
                                                            ...v,
                                                            text: '',
                                                        }
                                                    })
                                                    editorRef.current?.focus()
                                                }}
                                            >
                                                <RxEraser size={15} />
                                            </div>
                                        </Tooltip>
                                    </>
                                )}
                            </div>
                        </div>
                        {translateDeps.text !== '' && (
                            <div
                                className={styles.popupCardTranslatedContainer}
                                ref={translatedContainerRef}
                                dir={translatedLanguageDirection}
                            >
                                {actionStr && (
                                    <div
                                        className={clsx({
                                            [styles.actionStr]: true,
                                            [styles.error]: !!errorMessage,
                                        })}
                                    >
                                        <div>{actionStr}</div>
                                        {isLoading ? (
                                            <span className={styles.writing} key={'1'} />
                                        ) : errorMessage ? (
                                            <span key={'2'}>😢</span>
                                        ) : translateControllerRef.current?.signal.aborted &&
                                          translateControllerRef.current?.signal.reason === 'stop' ? (
                                            <span key={'3'}>⏹️</span>
                                        ) : (
                                            <span key={'4'}>👍</span>
                                        )}
                                    </div>
                                )}
                                {errorMessage ? (
                                    <>
                                        <div className={styles.errorMessage}>
                                            <span>{errorMessage}</span>
                                            <Tooltip content={t('Retry')} placement='bottom'>
                                                <div onClick={() => forceTranslate()} className={styles.actionButton}>
                                                    <RxReload size={15} />
                                                </div>
                                            </Tooltip>
                                        </div>
                                    </>
                                ) : (
                                    <div
                                        style={{
                                            width: '100%',
                                        }}
                                    >
                                        <div
                                            ref={translatedContentRef}
                                            className={styles.popupCardTranslatedContentContainer}
                                            style={{
                                                fontSize: settings.fontSize,
                                            }}
                                        >
                                            <div>
                                                {translatedLines.map((line, i) => {
                                                    return (
                                                        <div className={styles.paragraph} key={`p-${i}`}>
                                                            {line}
                                                            {isLoading && i === translatedLines.length - 1 && (
                                                                <span className={styles.caret} />
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                        {translatedText && (
                                            <div ref={actionButtonsRef} className={styles.actionButtonsContainer}>
                                                <div style={{ marginRight: 'auto' }} />
                                                {!isLoading && (
                                                    <Tooltip content={t('Retry')} placement='bottom'>
                                                        <div
                                                            onClick={() => forceTranslate()}
                                                            className={styles.actionButton}
                                                        >
                                                            <RxReload size={15} />
                                                        </div>
                                                    </Tooltip>
                                                )}
                                                <Tooltip content={t('Speak')} placement='bottom'>
                                                    <div className={styles.actionButton}>
                                                        <SpeakerIcon
                                                            size={15}
                                                            provider={settings.tts?.provider}
                                                            text={translatedText}
                                                            lang={targetLang ?? 'en'}
                                                            voice={
                                                                settings.tts?.voices?.find(
                                                                    (item) => item.lang === targetLang
                                                                )?.voice
                                                            }
                                                            rate={settings.tts?.rate}
                                                            volume={settings.tts?.volume}
                                                        />
                                                    </div>
                                                </Tooltip>
                                                {isTauri() && (
                                                    <Tooltip
                                                        content={t('Insert into previous input')}
                                                        placement='bottom'
                                                    >
                                                        <div
                                                            className={styles.actionButton}
                                                            onClick={handleInsertTranslatedText}
                                                        >
                                                            <RxEnter size={15} />
                                                        </div>
                                                    </Tooltip>
                                                )}
                                                <CopyButton text={translatedText} styles={styles}></CopyButton>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {props.showSettingsIcon && (
                <div
                    className={styles.footer}
                    style={{
                        boxShadow: isScrolledToBottom ? undefined : theme.lighting.shadow700,
                        backgroundColor: getFooterBackgroundColor(),
                    }}
                >
                    <Tooltip content={showSettings ? t('Go to Translator') : t('Go to Settings')} placement='right'>
                        <Button
                            size='mini'
                            kind='tertiary'
                            overrides={{
                                Root: {
                                    style: {
                                        zIndex: 1003,
                                    },
                                },
                            }}
                            onClick={async (e) => {
                                e.stopPropagation()
                                e.preventDefault()
                                if (isBrowserExtensionContentScript()) {
                                    const browser = (await import('webextension-polyfill')).default
                                    await browser.runtime.sendMessage({
                                        type: 'openOptionsPage',
                                    })
                                } else {
                                    setShowSettings((s: boolean) => !s)
                                }
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 6,
                                    fontSize: '11px',
                                }}
                            >
                                {showSettings ? (
                                    <TiArrowBack size={15} />
                                ) : (
                                    <div
                                        style={{
                                            position: 'relative',
                                        }}
                                    >
                                        <IoSettingsOutline
                                            style={{
                                                display: 'block',
                                            }}
                                            size={15}
                                        />
                                    </div>
                                )}
                                {showSettings ? t('Go back') : ''}
                            </div>
                        </Button>
                    </Tooltip>
                    {!showSettings && (
                        <div className={styles.poweredBy}>
                            {selectedProvider
                                ? `${t('Provider')}: ${selectedProvider.name} · ${selectedProvider.model}`
                                : t('No LLM Provider')}
                        </div>
                    )}
                    {!showSettings && (
                        <div className={styles.footerActions}>
                            <Tooltip content={t('History')} placement='top'>
                                <Button
                                    size='mini'
                                    kind='tertiary'
                                    overrides={{
                                        Root: {
                                            style: {
                                                zIndex: 1003,
                                            },
                                        },
                                    }}
                                    onClick={async (event) => {
                                        event.stopPropagation()
                                        event.preventDefault()
                                        if (isTauri()) {
                                            const { commands } = await import('@/tauri/bindings')
                                            await commands.showHistoryWindow()
                                            return
                                        }
                                        setIsHistoryOpen(true)
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 6,
                                        }}
                                    >
                                        <MdHistory size={15} />
                                    </div>
                                </Button>
                            </Tooltip>
                        </div>
                    )}
                </div>
            )}
            {isHistoryOpen ? (
                <TranslationHistory
                    isOpen
                    actions={[translateAction]}
                    activeActionId={translateAction.id}
                    onClose={() => setIsHistoryOpen(false)}
                    onRestore={handleHistoryRestore}
                />
            ) : null}
            <Toaster />
        </div>
    )
}
