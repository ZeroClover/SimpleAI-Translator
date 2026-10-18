import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast/headless'
import { Client as Styletron } from 'styletron-engine-atomic'
import { Provider as StyletronProvider } from 'styletron-react'
import { BaseProvider } from 'baseui'
import { Textarea } from 'baseui/textarea'
import { createUseStyles } from 'react-jss'
import { IoSettingsOutline } from 'react-icons/io5'
import { TiArrowBack } from 'react-icons/ti'
import { TbArrowsExchange, TbMarkdown } from 'react-icons/tb'
import { MdHistory } from 'react-icons/md'
import { detectLang, getLangConfig, sourceLanguages, targetLanguages, LangCode } from '../lang'
import { getTranslationCacheKey, resolveTranslationModel, translate } from '../translate'
import { Select, Value, Option } from 'baseui/select'
import { RxEraser, RxEnter, RxReload, RxStop } from 'react-icons/rx'
import { clsx } from 'clsx'
import { Button } from 'baseui/button'
import { ErrorBoundary } from 'react-error-boundary'
import { ErrorFallback } from '../components/ErrorFallback'
import {
    isTauri,
    isBrowserExtensionContentScript,
    isMacOS,
    areSameLanguageForTargetSelection,
    resolveAutomaticTargetLanguage,
    resolveProviderModelOutputControls,
    resolveTargetLanguageForSource,
} from '../utils'
import { InnerSettings } from './Settings'
import { containerID, popupCardInnerContainerId } from '../../browser-extension/content_script/consts'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
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
import debounce from 'lodash.debounce'
import { GlobalSuspense } from './GlobalSuspense'
import LogoWithText from './LogoWithText'
import Toaster from './Toaster'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useDeepCompareCallback, useDeepCompareEffect } from 'use-deep-compare'
import { useTranslatorStore } from '../store'
import { SpeakerIcon } from './SpeakerIcon'
import color from 'color'
import { useSettingsVisibility } from '../store/setting'
import { sortModelIds } from '../engines/model-filter'
import { MarkdownResult } from './MarkdownResult'

const SUCCESS_FINISH_REASONS = new Set(['stop', 'eos', 'end_turn'])

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

function resolveModelSelection(
    settings: Pick<ISettings, 'providers' | 'defaultProviderId' | 'defaultModel'>
): ModelSelection | null {
    if (
        settings.defaultModel &&
        settings.providers.some((provider) => provider.id === settings.defaultModel?.providerId) &&
        settings.defaultModel.model
    ) {
        return settings.defaultModel
    }
    // Never switch to another provider: without a model on the provider in use, the
    // translator asks the user to pick one in settings.
    const provider = settings.providers.find((item) => item.id === settings.defaultProviderId && item.model)
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
    'popupCardHeaderContainer': (props: IThemedStyleProps) =>
        props.isTauri
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
            padding: props.isTauri ? '5px 0' : undefined,
            gap: props.isTauri ? '5px' : undefined,
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
    'resultActionButtonsContainer': {
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '4px',
        marginTop: '4px',
    },
    'markdownToggle': (props: IThemedStyleProps) => ({
        'boxSizing': 'border-box',
        'minWidth': '28px',
        'minHeight': '28px',
        'margin': 0,
        'padding': '5px',
        'font': 'inherit',
        'color': props.theme.colors.contentSecondary,
        'background': 'transparent',
        'border': '1px solid transparent',
        'borderRadius': '8px',
        'cursor': 'pointer',
        'display': 'flex',
        'alignItems': 'center',
        'justifyContent': 'center',
        'transition': 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
            color: props.theme.colors.contentPrimary,
            background: props.themeType === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
        },
        '&:focus-visible': {
            outline: `2px solid ${props.theme.colors.accent}`,
            outlineOffset: '1px',
        },
        '&[aria-pressed="true"]': {
            color: props.theme.colors.accent,
            background: color(props.theme.colors.accent).alpha(0.14).string(),
            borderColor: color(props.theme.colors.accent).alpha(0.5).string(),
        },
    }),
    'markdownResult': (props: IThemedStyleProps) => {
        const codeBackground = props.themeType === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'
        return {
            'minWidth': 0,
            'overflowWrap': 'anywhere',
            '& p': {
                margin: '0.5em 0',
            },
            '& h1, & h2, & h3, & h4, & h5, & h6': {
                margin: '0.6em 0 0.4em',
                lineHeight: 1.3,
                fontWeight: 600,
            },
            '& h1': { fontSize: '1.4em' },
            '& h2': { fontSize: '1.25em' },
            '& h3': { fontSize: '1.1em' },
            '& h4, & h5, & h6': { fontSize: '1em' },
            '& ul, & ol': {
                margin: '0.5em 0',
                paddingInlineStart: '1.5em',
            },
            '& li > p, & li > ul, & li > ol': {
                margin: '0.25em 0',
            },
            '& blockquote': {
                margin: '0.5em 0',
                paddingInlineStart: '0.8em',
                borderInlineStart: `3px solid ${
                    props.themeType === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'
                }`,
                color: props.theme.colors.contentTertiary,
            },
            '& code': {
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: '0.9em',
                padding: '0.1em 0.3em',
                borderRadius: '4px',
                background: codeBackground,
            },
            '& pre': {
                margin: '0.5em 0',
                padding: '8px 10px',
                borderRadius: '8px',
                background: codeBackground,
                overflowX: 'auto',
                whiteSpace: 'pre',
                overflowWrap: 'normal',
            },
            '& pre code': {
                padding: 0,
                fontSize: 'inherit',
                background: 'transparent',
            },
            '& hr': {
                margin: '0.8em 0',
                border: 0,
                borderTop: `1px solid ${props.themeType === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
            },
        }
    },
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

export interface IInnerTranslatorProps {
    uuid?: string
    autoFocus?: boolean
    showSettingsIcon?: boolean
    defaultShowSettings?: boolean
    containerStyle?: React.CSSProperties
    editorRows?: number
    showLogo?: boolean
    onSettingsSave?: () => void
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

    // A new uuid means the window was summoned again, which always starts on the translator view.
    useEffect(() => {
        setShowSettings(false)
    }, [props.uuid, setShowSettings])

    const { onSettingsShow } = props

    useEffect(() => {
        onSettingsShow?.(showSettings)
    }, [onSettingsShow, showSettings])

    const { showLogo = true } = props

    const [isHistoryOpen, setIsHistoryOpen] = useState(false)

    const [translationFlag, forceTranslate] = useReducer((x: number) => x + 1, 0)
    const [submissionFlag, submitTranslation] = useReducer((x: number) => x + 1, 0)
    const translationIDRef = useRef(0)
    const skipNextTranslateRef = useRef(false)
    const historyEntryIdRef = useRef<number | null>(null)
    const lastHistoryKeyRef = useRef<string | null>(null)

    const editorRef = useRef<HTMLTextAreaElement>(null)
    const { t, i18n } = useTranslation()
    const { settings, updateSettings } = useSettings()
    const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(() => resolveModelSelection(settings))
    const selectedProvider = useMemo(
        () => settings.providers.find((provider) => provider.id === selectedModel?.providerId),
        [selectedModel?.providerId, settings.providers]
    )
    const modelOptions = useMemo(() => getProviderModelOptions(selectedProvider), [selectedProvider])
    const selectedModelOption = useMemo(
        () =>
            selectedModel
                ? (modelOptions.find(
                      (option) => option.providerId === selectedModel.providerId && option.model === selectedModel.model
                  ) ?? {
                      id: `${selectedModel.providerId}:${selectedModel.model}`,
                      label: selectedModel.model,
                      providerId: selectedModel.providerId,
                      model: selectedModel.model,
                  })
                : undefined,
        [modelOptions, selectedModel]
    )

    const { providers, defaultProviderId, defaultModel, providerModelOutputControls } = settings
    // Only the values that pick the default model may reset the current one; display
    // preferences must not overwrite a model restored from history.
    useDeepCompareEffect(() => {
        setSelectedModel((currentModel) => {
            const nextModel = resolveModelSelection({ providers, defaultProviderId, defaultModel })
            if (currentModel?.providerId === nextModel?.providerId && currentModel?.model === nextModel?.model) {
                return currentModel
            }
            return nextModel
        })
    }, [providers, defaultProviderId, defaultModel])

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
        isTauri: isTauri(),
        showLogo,
    })
    const [isLoading, setIsLoading] = useState(false)
    const [editableText, setEditableText] = useState('')
    const [translatedText, setTranslatedText] = useState('')
    const translatedLines = useMemo(() => translatedText.split('\n'), [translatedText])
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

    const translateDepsRef = useRef(translateDeps)
    translateDepsRef.current = translateDeps

    useEffect(() => {
        if (!isTauri()) {
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
            // Write only the change: `settings` may predate a save from another window.
            void updateSettings({ defaultProviderId: model.providerId, defaultModel: model })
        },
        [updateSettings]
    )

    // The content script cannot host the settings form, so it opens the extension options page.
    const openExtensionOptions = useCallback(async () => {
        const browser = (await import('webextension-polyfill')).default
        await browser.runtime.sendMessage({ type: 'openOptionsPage' })
    }, [])

    const toggleRenderMarkdown = useCallback(() => {
        void updateSettings({ renderMarkdown: !settings.renderMarkdown })
    }, [settings.renderMarkdown, updateSettings])

    const getTranslateDeps = useCallback(
        async function (text: string): Promise<typeof translateDeps> {
            const newSourceLang = await detectLang(text)
            setSourceLang(newSourceLang)
            const result = resolveTargetLanguageForSource(
                newSourceLang,
                targetLangRef.current,
                manualTargetLangSourceRef.current,
                settings.nativeLanguage,
                settings.translationTargetLanguage
            )
            const newTargetLang = result.targetLanguage as LangCode
            manualTargetLangSourceRef.current = result.manualTargetLanguageSource as LangCode | null
            setTargetLang(newTargetLang)
            return {
                ...translateDepsRef.current,
                sourceLang: newSourceLang,
                targetLang: newTargetLang,
                text,
                providerId: selectedModel?.providerId,
                engineModel: selectedModel?.model,
            }
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
    const targetLangRef = useRef(targetLang)
    targetLangRef.current = targetLang
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

        const resizeHandle: ResizeObserverCallback = debounce(() => {
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

    // Resolve once so the cache key, output controls, request, and history all use the same model.
    // translateText depends only on these request inputs, so display preferences never restart it.
    const requestedProviderId = translateDeps.providerId ?? selectedModel?.providerId
    const { providerConfig: requestProviderConfig, model: requestModel } = resolveTranslationModel(
        { providers, defaultProviderId, defaultModel },
        requestedProviderId,
        translateDeps.engineModel ?? selectedModel?.model
    )
    // An unknown provider id is passed through so translate() reports it instead of silently switching.
    const requestProviderId = requestProviderConfig?.id ?? requestedProviderId
    const requestOutputControls = resolveProviderModelOutputControls(
        { providerModelOutputControls },
        requestProviderId,
        requestModel
    )

    const translateText = useDeepCompareCallback(
        async (signal: AbortSignal) => {
            translationIDRef.current += 1
            if (translationIDRef.current > 1024) {
                translationIDRef.current = 0
            }
            const translationID = translationIDRef.current
            if (skipNextTranslateRef.current) {
                skipNextTranslateRef.current = false
                stopLoading()
                return
            }
            const { text, sourceLang, targetLang } = translateDeps
            if (!text || !sourceLang || !targetLang) {
                stopLoading()
                setActionStr('')
                return
            }
            const isCurrentTranslation = () => translationID === translationIDRef.current
            const providerId = requestProviderId
            const model = requestModel
            let reportedError: string | undefined
            const persistHistory = async (resultText: string) => {
                if (!resultText || !resultText.trim()) {
                    return
                }
                if (!translateDeps.text || !translateDeps.sourceLang || !translateDeps.targetLang) {
                    return
                }
                const dedupeKey = `${translateDeps.text}__${resultText}__${translateDeps.sourceLang}__${
                    translateDeps.targetLang
                }__${providerId ?? ''}__${model ?? ''}`
                if (lastHistoryKeyRef.current === dedupeKey) {
                    return
                }
                try {
                    if (historyEntryIdRef.current !== null) {
                        await historyService.update(historyEntryIdRef.current, {
                            translatedText: resultText,
                        })
                    } else {
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
                if (!SUCCESS_FINISH_REASONS.has(reason)) {
                    if (reason === 'length' || reason === 'max_tokens') {
                        toast(t('Chars Limited'), {
                            duration: 5000,
                            icon: '😥',
                        })
                    } else if (reason === 'content_filter') {
                        setActionStr('Error')
                        setErrorMessage(t('The model provider blocked this request with its content filter.'))
                    } else if (reportedError === undefined) {
                        setActionStr((actionStr_) => {
                            setErrorMessage(`${actionStr_} failed, finish_reason: ${reason}`)
                            return 'Error'
                        })
                    } else {
                        // Keep the readable message the engine already reported through onError.
                        setActionStr('Error')
                    }
                } else {
                    setActionStr(translateActionStrItem.afterStr)
                }
            }
            beforeTranslate()
            const outputControls = requestOutputControls
            const cachedKey = getTranslationCacheKey({
                providerId,
                model,
                sourceLang,
                targetLang,
                text,
                thinkingEnabled: outputControls.thinkingEnabled,
                reasoningEffort: outputControls.reasoningEffort,
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
            let resultText = ''
            let flushTimer: ReturnType<typeof setTimeout> | undefined
            const flushText = () => {
                clearTimeout(flushTimer)
                flushTimer = undefined
                if (isCurrentTranslation()) setTranslatedText(resultText)
            }
            try {
                await translate({
                    signal,
                    text,
                    detectFrom: sourceLang,
                    detectTo: targetLang,
                    providerId,
                    model,
                    onMessage: async (message) => {
                        if (!isCurrentTranslation() || signal.aborted) {
                            return
                        }
                        // A full-text snapshot replaces the current text, even when it is empty.
                        if (message.isFullText) {
                            resultText = message.content
                        } else if (message.content) {
                            resultText += message.content
                        } else {
                            return
                        }
                        if (flushTimer === undefined) {
                            flushTimer = setTimeout(flushText, 100)
                        }
                    },
                    onFinish: (reason) => {
                        if (!isCurrentTranslation()) {
                            return
                        }
                        flushText()
                        afterTranslate(reason)
                        // Partial output (errors, truncation, filtering) stays on screen but is never cached or saved.
                        if (!SUCCESS_FINISH_REASONS.has(reason) || !resultText.trim()) {
                            return
                        }
                        cache.set(cachedKey, resultText)
                        void persistHistory(resultText)
                    },
                    onError: (error) => {
                        if (!isCurrentTranslation() || signal.aborted) {
                            return
                        }
                        reportedError = error
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
                flushText()
                if (!isStopped && translationID === translationIDRef.current) {
                    stopLoading()
                    isStopped = true
                }
            }
        },
        [
            requestProviderConfig,
            requestProviderId,
            requestModel,
            requestOutputControls,
            translateDeps,
            translationFlag,
            submissionFlag,
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
            manualTargetLangSourceRef.current = item.fromLang
            translateControllerRef.current?.abort()
            translationIDRef.current += 1
            stopLoading()
            setSourceLang(item.fromLang)
            setTargetLang(item.toLang)
            setEditableText(item.sourceText)
            setTranslatedText(item.translatedText)
            setActionStr('')
            setErrorMessage('')
            const prev = translateDepsRef.current
            const providerIdFromHistory = settings.providers.some((provider) => provider.id === item.providerId)
                ? item.providerId
                : undefined
            if (providerIdFromHistory) {
                setSelectedModel({ providerId: providerIdFromHistory, model: item.model })
            }
            const next = {
                ...prev,
                text: item.sourceText,
                sourceLang: item.fromLang,
                targetLang: item.toLang,
                providerId: providerIdFromHistory ?? prev.providerId ?? selectedModel?.providerId,
                engineModel: item.model ?? prev.engineModel,
            }
            skipNextTranslateRef.current = JSON.stringify(prev) !== JSON.stringify(next)
            setTranslateDeps(next)
        },
        [selectedModel?.providerId, settings.providers, stopLoading]
    )

    useEffect(() => {
        if (!isTauri()) {
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
        const scrollOnContainer = isTauri() && !!container
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
        // Only this component's own content changes its scroll edges; host page mutations do not.
        const observer = new MutationObserver(onScroll)
        observer.observe(scrollOnContainer && container ? container : (containerRef.current as HTMLDivElement), {
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
            skipNextTranslateRef.current = false
            const text = editorRef.current?.value ?? ''
            getTranslateDeps(text)
                .then((v) => {
                    setTranslateDeps(v)
                    submitTranslation()
                })
                .catch((error) => {
                    stopLoading()
                    setActionStr('Error')
                    setErrorMessage(String(error))
                })
        },
        [getTranslateDeps, selectedModel?.model, selectedProvider, stopLoading, t]
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
                background: isTauri() ? 'transparent' : theme.colors.backgroundPrimary,
                paddingBottom: showSettings || settings.enableBackgroundBlur || isTauri() ? '0px' : '42px',
            }}
        >
            {showSettings && <InnerSettings onSave={props.onSettingsSave} />}
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
                            cursor: isTauri() ? 'default' : showLogo ? 'move' : 'default',
                            boxShadow: isTauri() && !isScrolledToTop ? theme.lighting.shadow600 : undefined,
                            background: settings.enableBackgroundBlur ? 'transparent' : '',
                        }}
                    >
                        {showLogo ? <LogoWithText /> : <div style={{ flexShrink: 0, marginRight: 'auto' }} />}
                        <div className={styles.popupCardHeaderActionsContainer}>
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
                            isTauri() &&
                                !settings.enableBackgroundBlur &&
                                styles.popupCardContentContainerDesktopScroll,
                            settings.enableBackgroundBlur && styles.popupCardContentContainerBackgroundBlur
                        )}
                    >
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
                                            await openExtensionOptions()
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
                                    inputRef={editorRef as React.RefObject<HTMLTextAreaElement>}
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
                                        if (
                                            e.key === 'Enter' &&
                                            !e.shiftKey &&
                                            !e.nativeEvent.isComposing &&
                                            e.nativeEvent.keyCode !== 229
                                        ) {
                                            handleSubmit(e)
                                        }
                                    }}
                                    onKeyUp={(e) => {
                                        e.stopPropagation()
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
                                {errorMessage && (
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
                                )}
                                {(!errorMessage || translatedText) && (
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
                                            {settings.renderMarkdown ? (
                                                <div className={styles.markdownResult}>
                                                    <MarkdownResult text={translatedText} />
                                                    {isLoading && <span className={styles.caret} />}
                                                </div>
                                            ) : (
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
                                            )}
                                        </div>
                                        {translatedText && (
                                            <div ref={actionButtonsRef} className={styles.resultActionButtonsContainer}>
                                                <Tooltip
                                                    content={
                                                        settings.renderMarkdown
                                                            ? t('Markdown rendering is on. Click to turn it off.')
                                                            : t('Markdown rendering is off. Click to turn it on.')
                                                    }
                                                    placement='bottom'
                                                >
                                                    <div>
                                                        <button
                                                            type='button'
                                                            className={styles.markdownToggle}
                                                            aria-label={t('Markdown rendering')}
                                                            aria-pressed={settings.renderMarkdown}
                                                            onClick={toggleRenderMarkdown}
                                                        >
                                                            <TbMarkdown size={16} />
                                                        </button>
                                                    </div>
                                                </Tooltip>
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
                                    await openExtensionOptions()
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
