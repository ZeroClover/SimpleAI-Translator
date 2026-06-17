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
import { getTranslationCacheKey, translate } from '../translate'
import { Select, Value, Option } from 'baseui-sd/select'
import { RxEraser, RxEnter, RxReload, RxStop } from 'react-icons/rx'
import { clsx } from 'clsx'
import { Button } from 'baseui-sd/button'
import { ErrorBoundary } from 'react-error-boundary'
import { ErrorFallback } from '../components/ErrorFallback'
import {
    isOpenAIOfficialProvider,
    isDesktopApp,
    isTauri,
    isBrowserExtensionContentScript,
    isMacOS,
    areSameLanguageForTargetSelection,
    resolveAutomaticTargetLanguage,
    resolveProviderModelOutputControls,
    resolveTargetLanguageForSource,
    setSettings as persistSettings,
} from '../utils'
import { InnerSettings } from './Settings'
import { containerID, popupCardInnerContainerId } from '../../browser-extension/content_script/consts'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import IpLocationNotification from '../components/IpLocationNotification'
import { LRUCache } from 'lru-cache'
import { ISettings, IThemedStyleProps, ModelSelection } from '../types'
import { useTheme } from '../hooks/useTheme'
import { Tooltip } from './Tooltip'
import { useSettings } from '../hooks/useSettings'
import { HistoryItem } from '../internal-services/db'
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
import { useSettingsVisibility } from '../store/setting'
import { sortModelIds } from '../engines/model-filter'

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
const DEFAULT_DESKTOP_HEADER_OFFSET = isMacOS ? 82 : 58
const DESKTOP_HEADER_OFFSET_VAR = `var(--simpleai-translator-header-offset, ${DEFAULT_DESKTOP_HEADER_OFFSET}px)`

function getProviderModelOptions(provider: ISettings['providers'][number] | undefined) {
    if (!provider) {
        return []
    }
    const models = sortModelIds(Array.from(new Set([provider.model, ...(provider.modelOptions ?? [])].filter(Boolean))))
    return models.map((model) => ({
        id: `${provider.id}:${model}`,
        label: model,
        providerId: provider.id,
        model,
    }))
}

function resolveModelSelection(settings: ISettings): ModelSelection | null {
    if (
        settings.defaultModel &&
        settings.providers.some((provider) => provider.id === settings.defaultModel?.providerId) &&
        settings.defaultModel.model
    ) {
        return settings.defaultModel
    }
    const provider =
        settings.providers.find((item) => item.id === settings.defaultProviderId && item.model) ??
        settings.providers.find((item) => item.model)
    if (!provider) {
        return null
    }
    return {
        providerId: provider.id,
        model: provider.model,
    }
}

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
        'flex': 1,
        'minWidth': 0,
        'flexDirection': 'row',
        'alignItems': 'center',
        'justifyContent': 'flex-end',
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
    'popupCardContentContainer': {
        display: 'flex',
        flexDirection: 'column',
    },
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
    // Non-blur desktop scroll: cap to the viewport and scroll inside this element
    // (the header and footer are position:fixed, so a 100vh box fills the window
    // exactly), keeping scrolling off the document where macOS WKWebView renders
    // its ugly native main-frame scrollbar. The top/bottom offsets are TRANSPARENT
    // BORDERS, not padding: WebKit paints the scrollbar inside the border box, so
    // the border insets the visible scrollbar so its ends clear the fixed header,
    // footer and the rounded window corners (same fix as the settings window).
    'popupCardContentContainerDesktopScroll': {
        height: '100vh',
        boxSizing: 'border-box',
        overflow: 'auto',
        // The transparent top border both clears the fixed header and insets the
        // scrollbar below it. The editor container owns the visible content gap.
        borderTop: `${DESKTOP_HEADER_OFFSET_VAR} solid transparent`,
        borderBottom: '42px solid transparent',
    },
    // Background-blur mode keeps the original behaviour: content scrolls UNDER the
    // translucent header with a mask fade, and the scrollbar is hidden — so it uses
    // padding (scroll-under) rather than the border inset, and needs the full
    // geometry here since DesktopScroll is not applied in blur mode.
    'popupCardContentContainerBackgroundBlur': {
        'height': '100vh',
        'boxSizing': 'border-box',
        'overflow': 'auto',
        'paddingTop': DESKTOP_HEADER_OFFSET_VAR,
        'paddingBottom': '42px',
        'scrollbarWidth': 'none',
        '&::-webkit-scrollbar': {
            display: 'none',
        },
        'mask': 'linear-gradient(180deg, #0000 58px, #000f 72px, #000f calc(100% - 60px), #0000 calc(100% - 40px));',
    },
})

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
    const showSettings = useSettingsVisibility((s) => s.showSettings)
    const setShowSettings = useSettingsVisibility((s) => s.setShowSettings)
    const toggleSettingsVisibility = useSettingsVisibility((s) => s.toggleSettingsVisibility)

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
    const { t, i18n } = useTranslation()
    const { settings, setSettings } = useSettings()
    const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(() => resolveModelSelection(settings))
    const selectedProvider = useMemo(
        () => settings.providers.find((provider) => provider.id === selectedModel?.providerId),
        [selectedModel?.providerId, settings.providers]
    )
    const modelOptions = useMemo(() => getProviderModelOptions(selectedProvider), [selectedProvider])
    const selectedModelOption = useMemo(
        () =>
            selectedModel
                ? modelOptions.find(
                      (option) => option.providerId === selectedModel.providerId && option.model === selectedModel.model
                  ) ?? {
                      id: `${selectedModel.providerId}:${selectedModel.model}`,
                      label: selectedModel.model,
                      providerId: selectedModel.providerId,
                      model: selectedModel.model,
                  }
                : undefined,
        [modelOptions, selectedModel]
    )

    useEffect(() => {
        setSelectedModel((currentModel) => {
            const nextModel = resolveModelSelection(settings)
            if (currentModel?.providerId === nextModel?.providerId && currentModel?.model === nextModel?.model) {
                return currentModel
            }
            return nextModel
        })
    }, [settings])

    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (settings?.i18n !== (i18n as any).language) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(i18n as any).changeLanguage(settings?.i18n)
        }
    }, [i18n, settings.i18n])

    const [autoFocus, setAutoFocus] = useState(false)

    useEffect(() => {
        if (props.autoFocus) {
            setAutoFocus(false)
            setTimeout(() => {
                setAutoFocus(true)
            }, 500)
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

    const headerRef = useRef<HTMLDivElement>(null)

    const logoWithTextRef = useRef<LogoWithTextRef>(null)

    const languagesSelectorRef = useRef<HTMLDivElement>(null)

    const containerRef = useRef<HTMLDivElement>(null)
    const editorContainerRef = useRef<HTMLDivElement>(null)
    const translatedContainerRef = useRef<HTMLDivElement>(null)
    // The desktop content scrolls inside this element (see popupCardContentContainerDesktopScroll)
    // rather than at the document level, which would show the ugly native macOS scrollbar.
    const contentScrollRef = useRef<HTMLDivElement>(null)

    const translatedContentRef = useRef<HTMLDivElement>(null)

    const actionButtonsRef = useRef<HTMLDivElement>(null)

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
    const [translateDeps, setTranslateDeps] = useState<{
        sourceLang?: LangCode
        targetLang?: LangCode
        text: string
        providerId?: string
        engineModel?: string
    }>({
        sourceLang: undefined,
        targetLang: undefined,
        text: '',
        providerId: undefined,
        engineModel: undefined,
    })

    useEffect(() => {
        if (!isDesktopApp()) {
            return undefined
        }
        const header = headerRef.current
        const content = contentScrollRef.current
        if (!header || !content) {
            return undefined
        }

        const updateHeaderOffset = () => {
            content.style.setProperty('--simpleai-translator-header-offset', `${header.offsetHeight}px`)
        }
        updateHeaderOffset()

        const observer = new ResizeObserver(updateHeaderOffset)
        observer.observe(header)
        window.addEventListener('resize', updateHeaderOffset)
        return () => {
            observer.disconnect()
            window.removeEventListener('resize', updateHeaderOffset)
        }
    }, [showSettings])

    useEffect(() => {
        setTranslateDeps((prev) => ({
            ...prev,
            providerId: selectedModel?.providerId,
            engineModel: selectedModel?.model,
        }))
    }, [selectedModel?.model, selectedModel?.providerId])

    const changeSelectedModel = useCallback(
        (model: ModelSelection) => {
            setSelectedModel(model)
            const nextSettings = {
                ...settings,
                defaultProviderId: model.providerId,
                defaultModel: model,
            }
            setSettings(nextSettings)
            void persistSettings(nextSettings)
        },
        [setSettings, settings]
    )

    const getTranslateDeps = useCallback(
        async function (text: string): Promise<typeof translateDeps> {
            const newSourceLang = await detectLang(text)
            setSourceLang(newSourceLang)
            return await new Promise((resolve) => {
                setTargetLang((targetLang_) => {
                    const result = resolveTargetLanguageForSource(
                        newSourceLang,
                        targetLang_,
                        manualTargetLangSourceRef.current,
                        settings.nativeLanguage,
                        settings.translationTargetLanguage
                    )
                    const newTargetLang = result.targetLanguage as LangCode
                    manualTargetLangSourceRef.current = result.manualTargetLanguageSource as LangCode | null
                    setTranslateDeps((oldV) => {
                        const newV: typeof translateDeps = {
                            ...oldV,
                            sourceLang: newSourceLang,
                            targetLang: newTargetLang,
                            text,
                            providerId: selectedModel?.providerId,
                            engineModel: selectedModel?.model,
                        }
                        resolve(newV)
                        return oldV
                    })
                    return newTargetLang
                })
            })
        },
        [selectedModel?.model, selectedModel?.providerId, settings.nativeLanguage, settings.translationTargetLanguage]
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
    }, [externalOriginalText, getTranslateDeps, props.uuid])

    useEffect(() => {
        setEditableText(translateDeps.text)
    }, [translateDeps.text])

    useLazyEffect(
        () => {
            ;(async () => {
                // use dynamic import to reduce bundle size
                const { countTokens } = await import('../token')
                setTokenCount(countTokens(editableText, selectedModel?.model))
            })()
        },
        [editableText],
        500
    )

    useEffect(() => {
        setTranslatedLines(translatedText.split('\n'))
    }, [translatedText])
    const [errorMessage, setErrorMessage] = useState('')
    const startLoading = useCallback(() => {
        setIsLoading(true)
    }, [])
    const stopLoading = useCallback(() => {
        setIsLoading(false)
    }, [])
    const [sourceLang, setSourceLang] = useState<LangCode>('en')
    const [targetLang, setTargetLang] = useState<LangCode>(
        () =>
            resolveAutomaticTargetLanguage(
                'en',
                settings.nativeLanguage,
                settings.translationTargetLanguage
            ) as LangCode
    )
    const manualTargetLangSourceRef = useRef<LangCode | null>(null)

    useEffect(() => {
        if (!manualTargetLangSourceRef.current) {
            setTargetLang(
                resolveAutomaticTargetLanguage(
                    sourceLang,
                    settings.nativeLanguage,
                    settings.translationTargetLanguage
                ) as LangCode
            )
        }
    }, [settings.nativeLanguage, settings.translationTargetLanguage, sourceLang])

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
        async (signal: AbortSignal) => {
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
            const isCurrentTranslation = () => translationID === translationIDRef.current
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
                        })
                    } else {
                        const providerId = translateDeps.providerId ?? selectedModel?.providerId
                        const model = translateDeps.engineModel ?? selectedModel?.model
                        if (!providerId || !model) {
                            return
                        }
                        const history = await historyService.create({
                            sourceText: translateDeps.text,
                            translatedText: resultText,
                            fromLang: translateDeps.sourceLang,
                            toLang: translateDeps.targetLang,
                            providerId,
                            model,
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
                if (!isCurrentTranslation()) {
                    return
                }
                stopLoading()
                if (reason === 'aborted') {
                    if (signal.reason === 'stop') {
                        setActionStr('Stopped')
                    }
                    return
                }
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
            const outputControls = resolveProviderModelOutputControls(
                settings,
                translateDeps.providerId ?? selectedModel?.providerId,
                translateDeps.engineModel ?? selectedModel?.model
            )
            const cachedKey = getTranslationCacheKey({
                providerId: translateDeps.providerId,
                model: translateDeps.engineModel,
                sourceLang,
                targetLang,
                text,
                thinkingEnabled: outputControls.thinkingEnabled,
                openaiReasoningEffort: outputControls.openaiReasoningEffort,
                anthropicThinkingEffort: outputControls.anthropicThinkingEffort,
                useStructuredOutput: outputControls.useStructuredOutput,
                useStrictSchema: outputControls.useStrictSchema,
                translationFlag,
            })
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
                await translate({
                    signal,
                    text,
                    detectFrom: sourceLang,
                    detectTo: targetLang,
                    providerId: translateDeps.providerId ?? selectedModel?.providerId,
                    model: translateDeps.engineModel ?? selectedModel?.model,
                    onStatusCode: () => {},
                    onMessage: async (message) => {
                        if (!isCurrentTranslation() || signal.aborted) {
                            return
                        }
                        if (!message.content) {
                            return
                        }
                        setTranslatedText((translatedText) => {
                            if (!isCurrentTranslation()) {
                                return translatedText
                            }
                            if (message.isFullText) {
                                return message.content
                            }
                            return translatedText + message.content
                        })
                    },
                    onFinish: (reason) => {
                        if (!isCurrentTranslation()) {
                            return
                        }
                        afterTranslate(reason)
                        if (reason === 'aborted') {
                            return
                        }
                        setTranslatedText((translatedText) => {
                            if (!isCurrentTranslation()) {
                                return translatedText
                            }
                            const result = translatedText
                            cache.set(cachedKey, result)
                            void persistHistory(result)
                            return result
                        })
                    },
                    onError: (error) => {
                        if (!isCurrentTranslation() || signal.aborted) {
                            return
                        }
                        setActionStr('Error')
                        setErrorMessage(error)
                    },
                })
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                // if error is a AbortError then ignore this error
                if (error.name === 'AbortError') {
                    isStopped = true
                    if (isCurrentTranslation()) {
                        stopLoading()
                    }
                    return
                }
                if (!isCurrentTranslation()) {
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
        [
            selectedModel?.model,
            selectedModel?.providerId,
            settings,
            translateDeps,
            translationFlag,
            startLoading,
            stopLoading,
            t,
        ]
    )

    const translateControllerRef = useRef<AbortController | null>(null)
    useEffect(() => {
        const controller = new AbortController()
        translateControllerRef.current = controller
        const { signal } = controller
        translateText(signal)
        return () => {
            controller.abort()
        }
    }, [translateText])

    const handleHistoryRestore = useCallback(
        (item: HistoryItem) => {
            historyEntryIdRef.current = item.id ?? null
            lastHistoryKeyRef.current = null
            manualTargetLangSourceRef.current = null
            skipNextTranslateRef.current = true
            setSourceLang(item.fromLang)
            setTargetLang(item.toLang)
            setEditableText(item.sourceText)
            setTranslatedText(item.translatedText)
            setActionStr('')
            setErrorMessage('')
            setTranslateDeps((prev) => {
                const providerIdFromHistory = settings.providers.some((provider) => provider.id === item.providerId)
                    ? item.providerId
                    : undefined
                if (providerIdFromHistory) {
                    setSelectedModel({
                        providerId: providerIdFromHistory,
                        model: item.model,
                    })
                }
                return {
                    ...prev,
                    text: item.sourceText,
                    sourceLang: item.fromLang,
                    targetLang: item.toLang,
                    providerId: providerIdFromHistory ?? prev.providerId ?? selectedModel?.providerId ?? undefined,
                    engineModel: item.model ?? prev.engineModel,
                }
            })
        },
        [selectedModel?.providerId, settings.providers]
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
        const container = contentScrollRef.current
        const scrollOnContainer = isDesktopApp() && !!container
        const isOnTop = () => {
            if (scrollOnContainer && container) {
                return container.scrollTop === 0
            }
            return document.documentElement.scrollTop === 0
        }
        const isOnBottom = () => {
            if (scrollOnContainer && container) {
                // -1px tolerance for sub-pixel/zoom rounding.
                return container.scrollTop + container.clientHeight >= container.scrollHeight - 1
            }
            const scrollTop = document.documentElement.scrollTop
            const windowHeight = window.innerHeight
            const documentHeight = document.documentElement.scrollHeight
            return scrollTop + windowHeight >= documentHeight - 1
        }

        setIsScrolledToTop(isOnTop())
        setIsScrolledToBottom(isOnBottom())

        const onScroll = () => {
            setIsScrolledToTop(isOnTop())
            setIsScrolledToBottom(isOnBottom())
        }

        const scrollTarget: HTMLElement | Window = scrollOnContainer && container ? container : window
        scrollTarget.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('resize', onScroll)
        const observer = new MutationObserver(onScroll)
        observer.observe(scrollOnContainer && container ? container : document.body, {
            childList: true,
            subtree: true,
        })
        return () => {
            scrollTarget.removeEventListener('scroll', onScroll)
            window.removeEventListener('resize', onScroll)
            observer.disconnect()
        }
    }, [showSettings])

    const showSubmitButton = () => {
        if (!editableText) {
            return false
        }

        if (!selectedProvider || !selectedModel?.model) {
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
            if (!selectedProvider || !selectedModel?.model) {
                setActionStr('Error')
                setErrorMessage(t('Please select a model in settings first.'))
                return
            }
            const text = editorRef.current?.value ?? ''
            getTranslateDeps(text).then((v) => {
                setTranslateDeps(v)
            })
        },
        [getTranslateDeps, selectedModel?.model, selectedProvider, t]
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
                'simpleai-dark': themeType === 'dark',
            })}
            ref={containerRef}
            style={{
                background: isDesktopApp() ? 'transparent' : theme.colors.backgroundPrimary,
                paddingBottom: showSettings || settings.enableBackgroundBlur || isDesktopApp() ? '0px' : '42px',
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
                                        const nextSourceLang = langId as LangCode
                                        const sourceChanged = !areSameLanguageForTargetSelection(
                                            sourceLang,
                                            nextSourceLang
                                        )
                                        const nextTargetLang = sourceChanged
                                            ? (resolveAutomaticTargetLanguage(
                                                  nextSourceLang,
                                                  settings.nativeLanguage,
                                                  settings.translationTargetLanguage
                                              ) as LangCode)
                                            : targetLang
                                        if (sourceChanged) {
                                            manualTargetLangSourceRef.current = null
                                            setTargetLang(nextTargetLang)
                                        }
                                        setSourceLang(nextSourceLang)
                                        setTranslateDeps((v) => {
                                            return {
                                                ...v,
                                                text: editableText,
                                                sourceLang: nextSourceLang,
                                                targetLang: nextTargetLang,
                                            }
                                        })
                                    }}
                                />
                            </div>
                            <div
                                className={styles.arrow}
                                onClick={() => {
                                    const nextSourceLang = targetLang
                                    manualTargetLangSourceRef.current = nextSourceLang
                                    setTranslateDeps((v) => ({
                                        ...v,
                                        text: translatedText,
                                        sourceLang: nextSourceLang,
                                        targetLang: sourceLang,
                                    }))
                                    setSourceLang(nextSourceLang)
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
                                        manualTargetLangSourceRef.current = sourceLang
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
                            {modelOptions.length > 0 && (
                                <div
                                    className={styles.to}
                                    style={{
                                        flex: '1 1 0',
                                        minWidth: 0,
                                    }}
                                >
                                    <Select
                                        size='mini'
                                        clearable={false}
                                        options={modelOptions}
                                        value={selectedModelOption ? [selectedModelOption] : []}
                                        getValueLabel={({ option }) => (
                                            <div
                                                style={{
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                                title={String(option.label ?? '')}
                                            >
                                                {option.label}
                                            </div>
                                        )}
                                        overrides={{
                                            Root: {
                                                style: {
                                                    width: '100%',
                                                    minWidth: 0,
                                                },
                                            },
                                            ValueContainer: {
                                                style: {
                                                    minWidth: 0,
                                                    overflow: 'hidden',
                                                },
                                            },
                                            SingleValue: {
                                                style: {
                                                    minWidth: 0,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                },
                                            },
                                        }}
                                        onChange={({ value }) => {
                                            const option = value[0]
                                            if (!option) {
                                                return
                                            }
                                            const providerId = option.providerId
                                            const model = option.model
                                            if (typeof providerId === 'string' && typeof model === 'string') {
                                                changeSelectedModel({ providerId, model })
                                            }
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                    <div
                        ref={contentScrollRef}
                        className={clsx(
                            styles.popupCardContentContainer,
                            isDesktopApp() &&
                                !settings.enableBackgroundBlur &&
                                styles.popupCardContentContainerDesktopScroll,
                            settings.enableBackgroundBlur && styles.popupCardContentContainerBackgroundBlur
                        )}
                    >
                        {isOpenAIOfficialProvider(selectedProvider) && (
                            <div>
                                <IpLocationNotification showSettings={showSettings} />
                            </div>
                        )}
                        {settings.providers.length === 0 && (
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
                                                    provider={settings.tts?.provider}
                                                    text={editableText}
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
                                    toggleSettingsVisibility()
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
                                ? `${t('Provider')}: ${selectedProvider.name} · ${t('Model')}: ${
                                      selectedModel?.model ?? ''
                                  }`
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
                <TranslationHistory isOpen onClose={() => setIsHistoryOpen(false)} onRestore={handleHistoryRestore} />
            ) : null}
            <Toaster />
        </div>
    )
}
