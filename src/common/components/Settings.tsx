import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import _ from 'underscore'
import { Tabs, Tab, StyledTabList, StyledTabPanel } from 'baseui-sd/tabs-motion'
import icon from '../assets/images/icon-large.png'
import beams from '../assets/images/beams.jpg'
import toast, { Toaster } from 'react-hot-toast'
import * as utils from '../utils'
import { Client as Styletron } from 'styletron-engine-atomic'
import { Provider as StyletronProvider } from 'styletron-react'
import { BaseProvider } from 'baseui-sd'
import { Input } from 'baseui-sd/input'
import { createForm } from './Form'
import { Button, ButtonProps } from 'baseui-sd/button'
import { Select, Value, Option } from 'baseui-sd/select'
import { Checkbox } from 'baseui-sd/checkbox'
import { LangCode, supportedLanguages } from '../lang'
import { createUseStyles } from 'react-jss'
import {
    AnthropicThinkingEffort,
    ISettings,
    IThemedStyleProps,
    LanguageDetectionEngine,
    ModelSelection,
    OpenAIReasoningEffort,
    ProviderConfig,
    ProxyProtocol,
    ThemeType,
} from '../types'
import { useTheme } from '../hooks/useTheme'
import { IoSettingsOutline } from 'react-icons/io5'
import { useTranslation } from 'react-i18next'
import { version as appVersion } from '../../../package.json'
import { useSettings } from '../hooks/useSettings'
import { defaultTTSProvider, langCode2TTSLang, ttsLangTestTextMap } from '../tts'
import { RiDeleteBin5Line } from 'react-icons/ri'
import { IoIosSave, IoMdAdd } from 'react-icons/io'
import { OpenAITTSFormat, OpenAITTSSettings, TTSProvider } from '../tts/types'
import { fetchEdgeVoices } from '../tts/edge-tts'
import { useThemeType } from '../hooks/useThemeType'
import { Slider } from 'baseui-sd/slider'
import { GlobalSuspense } from './GlobalSuspense'
import { TbCloudNetwork } from 'react-icons/tb'
import { Cell, Grid } from 'baseui-sd/layout-grid'
import useSWR from 'swr'
import { Skeleton } from 'baseui-sd/skeleton'
import { SpeakerIcon } from './SpeakerIcon'
import { RxSpeakerLoud } from 'react-icons/rx'
import { Textarea } from 'baseui-sd/textarea'
import { ProxyTester } from './ProxyTester'
import NumberInput from './NumberInput'
import { ProviderForm, ProviderFormValue } from './ProviderForm'
import { v4 as uuidv4 } from 'uuid'
import { filterChatModels, filterTTSModels, sortModelIds } from '../engines/model-filter'
import { getEngine } from '../engines'

const langOptions: Value = supportedLanguages.reduce((acc, [id, label]) => {
    return [
        ...acc,
        {
            id,
            label,
        } as Option,
    ]
}, [] as Value)

interface ILanguageSelectorProps {
    value?: string
    onChange?: (value: string) => void
    onBlur?: () => void
}

const linkStyle = {
    color: 'inherit',
    opacity: 0.8,
    cursor: 'pointer',
    outline: 'none',
}

function LanguageSelector({ value, onChange, onBlur }: ILanguageSelectorProps) {
    return (
        <Select
            onBlur={onBlur}
            size='compact'
            clearable={false}
            options={langOptions}
            value={value ? [{ id: value }] : []}
            onChange={({ value }) => {
                const selected = value[0]
                onChange?.(selected?.id as string)
            }}
        />
    )
}

interface IThemeTypeSelectorProps {
    value?: ThemeType
    onChange?: (value: ThemeType) => void
    onBlur?: () => void
}

function ThemeTypeSelector({ value, onChange, onBlur }: IThemeTypeSelectorProps) {
    const { t } = useTranslation()

    return (
        <Select
            size='compact'
            onBlur={onBlur}
            searchable={false}
            clearable={false}
            value={
                value
                    ? [
                          {
                              id: value,
                          },
                      ]
                    : []
            }
            onChange={(params) => {
                onChange?.(params.value[0].id as ThemeType)
            }}
            options={[
                { label: t('Follow the System'), id: 'followTheSystem' },
                { label: t('Dark'), id: 'dark' },
                { label: t('Light'), id: 'light' },
            ]}
        />
    )
}

interface ILanguageDetectionEngineSelectorProps {
    value?: LanguageDetectionEngine
    onChange?: (value: LanguageDetectionEngine) => void
    onBlur?: () => void
}

function LanguageDetectionEngineSelector({ value, onChange, onBlur }: ILanguageDetectionEngineSelectorProps) {
    const { t } = useTranslation()

    return (
        <Select
            size='compact'
            onBlur={onBlur}
            searchable={false}
            clearable={false}
            value={
                value
                    ? [
                          {
                              id: value,
                          },
                      ]
                    : []
            }
            onChange={(params) => {
                onChange?.(params.value[0].id as LanguageDetectionEngine)
            }}
            options={[
                { label: t('Baidu'), id: 'baidu' },
                { label: t('Google'), id: 'google' },
                { label: t('Bing'), id: 'bing' },
                { label: t('Local'), id: 'local' },
            ]}
        />
    )
}

const useTTSSettingsStyles = createUseStyles({
    label: (props: IThemedStyleProps) => ({
        color: props.theme.colors.contentPrimary,
        fontWeight: 500,
    }),
    voiceSelector: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        width: '100%',
    },
    formControl: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
    },
    tickBar: (props: IThemedStyleProps) => ({
        color: props.theme.colors.contentPrimary,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingRight: '16px',
        paddingLeft: '16px',
    }),
})

interface ISpeakerButtonProps extends ButtonProps {
    iconSize?: number
    provider?: TTSProvider
    lang: LangCode
    voice: string
    rate?: number
    volume?: number
    text?: string
}

function SpeakerButton({
    iconSize = 13,
    provider,
    text: text_,
    lang,
    voice,
    rate,
    volume,
    ...buttonProps
}: ISpeakerButtonProps) {
    const text = text_ ?? ttsLangTestTextMap[lang]

    return (
        <Button
            shape='circle'
            size='mini'
            {...buttonProps}
            onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const target = e.target as HTMLButtonElement
                target.querySelector('div')?.click()
            }}
        >
            <SpeakerIcon
                size={iconSize}
                provider={provider}
                text={text}
                lang={lang}
                voice={voice}
                rate={rate}
                volume={volume}
            />
        </Button>
    )
}

interface ITTSVoicesSettingsProps {
    value?: ISettings['tts']
    providers: ProviderConfig[]
    onChange?: (value: ISettings['tts']) => void
    onBlur?: () => void
}

const ttsProviderOptions: {
    labelKey: string
    id: TTSProvider
}[] = [
    { labelKey: 'Edge TTS', id: 'edge' },
    { labelKey: 'System Default', id: 'system' },
    { labelKey: 'OpenAI TTS', id: 'openai' },
]

const openAITTSVoiceOptions = [
    'alloy',
    'ash',
    'ballad',
    'coral',
    'echo',
    'fable',
    'onyx',
    'nova',
    'sage',
    'shimmer',
    'verse',
    'marin',
    'cedar',
]

const openAITTSFormatOptions: OpenAITTSFormat[] = ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']

function getOpenAITTSVoiceId(voice: OpenAITTSSettings['voice'] | undefined): string {
    if (!voice) {
        return 'alloy'
    }
    return typeof voice === 'string' ? voice : voice.id
}

function toOpenAITTSVoice(value: string): OpenAITTSSettings['voice'] {
    return value.startsWith('voice_') ? { id: value } : value
}

function TTSVoicesSettings({ value, providers, onChange, onBlur }: ITTSVoicesSettingsProps) {
    console.debug('render tts voices settings')

    const { t } = useTranslation()
    const { theme, themeType } = useTheme()

    const styles = useTTSSettingsStyles({ theme, themeType, isDesktopApp: utils.isDesktopApp() })

    const [showLangSelector, setShowLangSelector] = useState(false)

    const [supportedVoices, setSupportedVoices] = useState<SpeechSynthesisVoice[]>([])

    const provider = value?.provider ?? defaultTTSProvider
    const ttsProviderSelectOptions = useMemo(
        () => ttsProviderOptions.map((option) => ({ id: option.id, label: t(option.labelKey) })),
        [t]
    )
    const openAIProviders = useMemo(
        () =>
            providers.filter(
                (provider) => provider.protocol === 'openai-chat' || provider.protocol === 'openai-responses'
            ),
        [providers]
    )
    const openAIConfig = value?.openai
    const openAIProviderId = openAIConfig?.providerId ?? openAIProviders[0]?.id ?? ''
    const openAIModel = openAIConfig?.model ?? ''
    const openAIVoice = getOpenAITTSVoiceId(openAIConfig?.voice)
    const openAIFormat = openAIConfig?.format ?? 'mp3'
    const [openAITTSModelOptions, setOpenAITTSModelOptions] = useState<string[]>(openAIModel ? [openAIModel] : [])
    const [isRefreshingOpenAITTSModels, setIsRefreshingOpenAITTSModels] = useState(false)

    const openAIProviderOptions = useMemo(
        () =>
            openAIProviders.map((provider) => ({
                id: provider.id,
                label: `${provider.name} · ${provider.protocol}`,
            })),
        [openAIProviders]
    )
    const openAIModelOptions = useMemo(
        () =>
            sortModelIds(Array.from(new Set([openAIModel, ...openAITTSModelOptions].filter(Boolean)))).map((model) => ({
                id: model,
                label: model,
            })),
        [openAIModel, openAITTSModelOptions]
    )
    const openAIVoiceOptions = useMemo(
        () =>
            Array.from(new Set([openAIVoice, ...openAITTSVoiceOptions].filter(Boolean))).map((voice) => ({
                id: voice,
                label: voice,
            })),
        [openAIVoice]
    )

    const { data: edgeVoices, isLoading: isEdgeVoicesLoading } = useSWR(
        provider === 'edge' ? 'edgeVoices' : null,
        fetchEdgeVoices
    )

    const { data: webSpeechVoices, isLoading: isWebSpeechVoicesLoading } = useSWR(
        provider === 'system' ? 'webSpeechVoices' : null,
        async () => {
            return speechSynthesis.getVoices()
        }
    )

    const isVoicesLoading = isEdgeVoicesLoading || isWebSpeechVoicesLoading

    useEffect(() => {
        switch (provider) {
            case 'edge':
                setSupportedVoices(edgeVoices ?? [])
                break
            case 'system':
                setSupportedVoices(webSpeechVoices ?? [])
                break
            case 'openai':
                setSupportedVoices([])
                break
            default:
                setSupportedVoices(edgeVoices ?? [])
                break
        }
    }, [edgeVoices, provider, webSpeechVoices])

    const getNextOpenAISettings = useCallback(
        (changes: Partial<OpenAITTSSettings> = {}): OpenAITTSSettings => ({
            providerId: openAIProviderId,
            model: openAIModel,
            voice: openAIVoice,
            format: openAIFormat,
            ...openAIConfig,
            ...changes,
        }),
        [openAIConfig, openAIFormat, openAIModel, openAIProviderId, openAIVoice]
    )

    const handleChangeOpenAISettings = useCallback(
        (changes: Partial<OpenAITTSSettings>) => {
            onChange?.({
                ...value,
                openai: getNextOpenAISettings(changes),
            })
        },
        [getNextOpenAISettings, onChange, value]
    )

    const refreshOpenAITTSModels = useCallback(async () => {
        const providerConfig = openAIProviders.find((provider) => provider.id === openAIProviderId)
        if (!providerConfig) {
            toast(t('Please select an OpenAI-compatible Provider first.'))
            return
        }

        setIsRefreshingOpenAITTSModels(true)
        try {
            const models = await getEngine(providerConfig).listModels()
            const ids = sortModelIds(filterTTSModels(models.map((model) => model.id)))
            setOpenAITTSModelOptions(ids)
            if (!openAIModel && ids[0]) {
                handleChangeOpenAISettings({ model: ids[0] })
            }
            if (ids.length === 0) {
                toast(t('No TTS model was found for this Provider. You can enter a model manually.'))
            }
        } catch {
            toast(t('Unable to fetch TTS model list. Please enter the model name manually.'))
        } finally {
            setIsRefreshingOpenAITTSModels(false)
        }
    }, [handleChangeOpenAISettings, openAIModel, openAIProviderId, openAIProviders, t])

    const getLangOptions = useCallback(
        (lang: string) => {
            return supportedLanguages.reduce((acc, [langCode, label]) => {
                const ttsLang = langCode2TTSLang[langCode]
                if (ttsLang && supportedVoices.find((v) => v.lang === ttsLang)) {
                    if (value?.voices?.find((item) => item.lang === langCode) && langCode !== lang) {
                        return acc
                    }
                    return [
                        ...acc,
                        {
                            id: langCode,
                            label,
                        } as Option,
                    ]
                }
                return acc
            }, [] as Value)
        },
        [value?.voices, supportedVoices]
    )

    const getVoiceOptions = useCallback(
        (lang: LangCode) => {
            const ttsLang = langCode2TTSLang[lang]
            return supportedVoices
                .filter((v) => v.lang.split('-')[0] === lang || v.lang === ttsLang)
                .filter((v, idx, items) => items.findIndex((item) => item.name === v.name) === idx)
                .map((sv) => ({
                    id: sv.voiceURI,
                    label: (
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                            }}
                            key={sv.voiceURI}
                        >
                            <SpeakerButton
                                shape='round'
                                kind='secondary'
                                iconSize={12}
                                overrides={{
                                    Root: {
                                        style: {
                                            padding: '4px',
                                        },
                                    },
                                }}
                                provider={value?.provider}
                                lang={lang}
                                voice={sv.voiceURI}
                                volume={value?.volume}
                                rate={value?.rate}
                            />
                            {sv.name}
                        </div>
                    ),
                    lang: sv.lang,
                }))
        },
        [supportedVoices, value?.provider, value?.rate, value?.volume]
    )

    const getDefaultVoice = useCallback(
        (lang: LangCode) => {
            const ttsLang = langCode2TTSLang[lang]
            return (
                supportedVoices.find((voice) => voice.lang === ttsLang) ??
                supportedVoices.find((voice) => voice.lang.split('-')[0] === lang)
            )
        },
        [supportedVoices]
    )

    const handleDeleteLang = useCallback(
        (lang: string) => {
            const voices = value?.voices ?? []
            const newVoices = voices.filter((item) => {
                return item.lang !== lang
            })
            onChange?.({ ...value, voices: newVoices })
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [value]
    )

    const handleChangeLang = useCallback(
        (prevLang: LangCode, newLang: LangCode) => {
            const voices = value?.voices ?? []
            const newVoices = voices.map((item) => {
                if (item.lang === prevLang) {
                    return {
                        lang: newLang,
                        voice: getDefaultVoice(newLang)?.voiceURI ?? '',
                    }
                }
                return item
            })
            onChange?.({ ...value, voices: newVoices })
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [getDefaultVoice, value]
    )

    const handleAddLang = useCallback(
        (lang: LangCode) => {
            const voices = value?.voices ?? []
            onChange?.({
                ...value,
                voices: [
                    ...voices,
                    {
                        lang,
                        voice: getDefaultVoice(lang)?.voiceURI ?? '',
                    },
                ],
            })
            setShowLangSelector(false)
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [getDefaultVoice, value]
    )

    const handleChangeVoice = useCallback(
        (lang: string, voice: string) => {
            const voices = value?.voices ?? []
            const newVoices = voices.map((item) => {
                if (item.lang === lang) {
                    return {
                        ...item,
                        voice,
                    }
                }
                return item
            })
            onChange?.({ ...value, voices: newVoices })
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [value]
    )

    const handleChangeProvider = useCallback(
        (provider: TTSProvider) => {
            if (provider === 'openai') {
                onChange?.({
                    ...value,
                    provider,
                    openai: getNextOpenAISettings({
                        providerId: openAIProviderId,
                    }),
                })
                return
            }
            onChange?.({ ...value, provider })
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [getNextOpenAISettings, openAIProviderId, value]
    )

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                marginTop: 20,
            }}
        >
            <div className={styles.formControl}>
                <label className={styles.label}>{t('Provider')}</label>
                <Select
                    size='compact'
                    clearable={false}
                    searchable={false}
                    options={ttsProviderSelectOptions}
                    value={[{ id: value?.provider ?? defaultTTSProvider }]}
                    onChange={({ option }) => handleChangeProvider(option?.id as TTSProvider)}
                    onBlur={onBlur}
                />
            </div>
            <div className={styles.formControl}>
                <label className={styles.label}>{t('Rate')}</label>
                <Slider
                    min={1}
                    max={20}
                    step={1}
                    value={[value?.rate ?? 10]}
                    onChange={(params) => onChange?.({ ...value, rate: params.value[0] })}
                    overrides={{
                        ThumbValue: () => null,
                        InnerThumb: () => null,
                        TickBar: () => (
                            <div className={styles.tickBar}>
                                <div>{t('Slow')}</div>
                                <div>{t('Fast')}</div>
                            </div>
                        ),
                    }}
                />
            </div>
            <div className={styles.formControl}>
                <label className={styles.label}>{t('Volume')}</label>
                <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[value?.volume ?? 100]}
                    onChange={(params) => onChange?.({ ...value, volume: params.value[0] })}
                    overrides={{
                        ThumbValue: () => null,
                        InnerThumb: () => null,
                        TickBar: () => (
                            <div className={styles.tickBar}>
                                <div>{t('Quiet')}</div>
                                <div>{t('Loud')}</div>
                            </div>
                        ),
                    }}
                />
            </div>
            {provider === 'openai' && (
                <div className={styles.formControl}>
                    <label className={styles.label}>{t('OpenAI TTS')}</label>
                    <Select
                        size='compact'
                        clearable={false}
                        searchable={false}
                        options={openAIProviderOptions}
                        value={openAIProviderId ? [{ id: openAIProviderId }] : []}
                        placeholder={t('Associated Provider')}
                        onChange={({ option }) =>
                            handleChangeOpenAISettings({ providerId: (option?.id as string) ?? '' })
                        }
                        onBlur={onBlur}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                            <Select
                                size='compact'
                                creatable
                                options={openAIModelOptions}
                                value={openAIModel ? [{ id: openAIModel, label: openAIModel }] : []}
                                placeholder={t('TTS Model')}
                                onChange={({ value }) => {
                                    const nextModel = value[0]?.id
                                    handleChangeOpenAISettings({
                                        model: typeof nextModel === 'string' ? nextModel : '',
                                    })
                                }}
                                onBlur={onBlur}
                            />
                        </div>
                        <Button
                            type='button'
                            size='compact'
                            isLoading={isRefreshingOpenAITTSModels}
                            onClick={() => void refreshOpenAITTSModels()}
                        >
                            {t('Refresh')}
                        </Button>
                    </div>
                    <Select
                        size='compact'
                        creatable
                        options={openAIVoiceOptions}
                        value={openAIVoice ? [{ id: openAIVoice, label: openAIVoice }] : []}
                        placeholder={t('Voice')}
                        onChange={({ value }) => {
                            const nextVoice = value[0]?.id
                            handleChangeOpenAISettings({
                                voice: toOpenAITTSVoice(typeof nextVoice === 'string' ? nextVoice : 'alloy'),
                            })
                        }}
                        onBlur={onBlur}
                    />
                    <Select
                        size='compact'
                        clearable={false}
                        searchable={false}
                        options={openAITTSFormatOptions.map((format) => ({ id: format, label: format }))}
                        value={[{ id: openAIFormat, label: openAIFormat }]}
                        placeholder={t('Audio format')}
                        onChange={({ option }) => handleChangeOpenAISettings({ format: option?.id as OpenAITTSFormat })}
                        onBlur={onBlur}
                    />
                    {(!openAIProviderId || !openAIModel) && (
                        <div style={{ color: theme.colors.negative, fontSize: 12 }}>
                            {t('Please select an associated LLM Provider and TTS model.')}
                        </div>
                    )}
                </div>
            )}
            {provider !== 'openai' && (
                <div className={styles.formControl}>
                    <label className={styles.label}>{t('Voice')}</label>
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10,
                        }}
                    >
                        {isVoicesLoading && <Skeleton rows={6} height='300px' width='100%' animation />}
                        {!isVoicesLoading &&
                            (value?.voices ?? []).map(({ lang, voice }) => {
                                const langOptions = getLangOptions(lang)
                                const selectedLang = langOptions.find((opt) => opt.id === lang)
                                const voiceOptions = getVoiceOptions(lang)
                                const selectedVoice = voiceOptions.find((opt) => opt.id === voice)
                                return (
                                    <div className={styles.voiceSelector} key={lang}>
                                        <Select
                                            key={`lang-${lang}`}
                                            size='mini'
                                            clearable={false}
                                            options={langOptions}
                                            placeholder={t('Please select a language')}
                                            overrides={{
                                                Root: {
                                                    style: {
                                                        width: '115px',
                                                        flexShrink: 0,
                                                    },
                                                },
                                            }}
                                            onChange={({ option }) => handleChangeLang(lang, option?.id as LangCode)}
                                            value={selectedLang ? [{ id: selectedLang.id }] : undefined}
                                        />
                                        <Select
                                            size='mini'
                                            options={voiceOptions}
                                            placeholder={t('Please select a voice')}
                                            overrides={{
                                                Root: {
                                                    style: {
                                                        flexShrink: 1,
                                                        minWidth: '215px',
                                                    },
                                                },
                                            }}
                                            value={selectedVoice ? [{ id: selectedVoice.id }] : undefined}
                                            onChange={({ option }) => handleChangeVoice(lang, option?.id as string)}
                                            clearable={false}
                                            onBlur={onBlur}
                                            autoFocus={!selectedVoice}
                                        />
                                        <Button
                                            shape='circle'
                                            size='mini'
                                            overrides={{
                                                Root: {
                                                    style: {
                                                        flexShrink: 0,
                                                    },
                                                },
                                            }}
                                            onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                handleDeleteLang(lang)
                                            }}
                                        >
                                            <RiDeleteBin5Line size={12} />
                                        </Button>
                                    </div>
                                )
                            })}
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginTop: 10,
                        }}
                    >
                        {showLangSelector && (
                            <Select
                                size='mini'
                                placeholder={t('Please select a language')}
                                clearable={false}
                                options={getLangOptions('')}
                                onChange={({ option }) => handleAddLang(option?.id as LangCode)}
                                autoFocus
                            />
                        )}
                        <Button
                            size='mini'
                            overrides={{
                                Root: {
                                    style: {
                                        flexShrink: 0,
                                    },
                                },
                            }}
                            startEnhancer={() => <IoMdAdd size={12} />}
                            onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setShowLangSelector(true)
                            }}
                        >
                            {t('Add')}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

interface IProxyProtocolProps {
    value?: ProxyProtocol
    onChange?: (value: ProxyProtocol) => void
    onBlur?: () => void
}

function ProxyProtocolSelector({ value, onChange, onBlur }: IProxyProtocolProps) {
    const options = [
        { label: 'HTTP', id: 'HTTP' },
        { label: 'HTTPS', id: 'HTTPS' },
    ]

    return (
        <Select
            size='compact'
            onBlur={onBlur}
            searchable={false}
            clearable={false}
            value={
                value
                    ? [
                          {
                              id: value,
                              label: options.find((option) => option.id === value)?.label || 'HTTP',
                          },
                      ]
                    : undefined
            }
            onChange={(params) => {
                onChange?.(params.value[0].id as ProxyProtocol)
            }}
            options={options}
        />
    )
}

interface Ii18nSelectorProps {
    value?: string
    onChange?: (value: string) => void
    onBlur?: () => void
}

function Ii18nSelector({ value, onChange, onBlur }: Ii18nSelectorProps) {
    const { i18n } = useTranslation()

    const options = [
        { label: 'English', id: 'en' },
        { label: '简体中文', id: 'zh-Hans' },
        { label: '繁體中文', id: 'zh-Hant' },
        { label: '日本語', id: 'ja' },
        { label: 'ไทย', id: 'th' },
        { label: 'Türkçe', id: 'tr' },
    ]

    return (
        <Select
            size='compact'
            onBlur={onBlur}
            searchable={false}
            clearable={false}
            value={
                value
                    ? [
                          {
                              id: value,
                              label: options.find((option) => option.id === value)?.label || 'en',
                          },
                      ]
                    : undefined
            }
            onChange={(params) => {
                onChange?.(params.value[0].id as string)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ;(i18n as any).changeLanguage(params.value[0].id as string)
            }}
            options={options}
        />
    )
}

interface MyCheckboxProps {
    value?: boolean
    onChange?: (value: boolean) => void
    onBlur?: () => void
    disabled?: boolean
}

function MyCheckbox({ value, onChange, onBlur, disabled }: MyCheckboxProps) {
    return (
        <Checkbox
            checkmarkType='toggle_round'
            checked={value}
            disabled={disabled}
            onChange={(e) => {
                onChange?.(e.target.checked)
                onBlur?.()
            }}
        />
    )
}

interface SettingsToggleProps extends MyCheckboxProps {
    label?: React.ReactNode
    caption?: React.ReactNode
}

function SettingsToggle({ value, onChange, onBlur, disabled, label, caption }: SettingsToggleProps) {
    const { theme } = useTheme()
    return (
        <div style={{ opacity: disabled ? 0.55 : 1 }}>
            <Checkbox
                checkmarkType='toggle_round'
                checked={value}
                disabled={disabled}
                onChange={(e) => {
                    onChange?.(e.target.checked)
                    onBlur?.()
                }}
            >
                {label}
            </Checkbox>
            {caption && <div style={{ color: theme.colors.contentSecondary, fontSize: '0.85em' }}>{caption}</div>}
        </div>
    )
}

interface RestorePreviousPositionCheckboxProps {
    value?: boolean
    onChange?: (value: boolean) => void
    onBlur?: () => void
}

function RestorePreviousPositionCheckbox({ value, onChange, onBlur }: RestorePreviousPositionCheckboxProps) {
    return (
        <Checkbox
            checkmarkType='toggle_round'
            checked={value}
            onChange={(e) => {
                onChange?.(e.target.checked)
                onBlur?.()
            }}
        />
    )
}
interface RunAtStartupCheckboxProps {
    value?: boolean
    onChange?: (value: boolean) => void
    onBlur?: () => void
}

function RunAtStartupCheckbox({ value, onChange, onBlur }: RunAtStartupCheckboxProps) {
    return (
        <Checkbox
            checkmarkType='toggle_round'
            checked={value}
            onChange={(e) => {
                onChange?.(e.target.checked)
                onBlur?.()
            }}
        />
    )
}

const useStyles = createUseStyles({
    footer: (props: IThemedStyleProps) =>
        props.isDesktopApp
            ? {
                  zIndex: 999,
                  color: props.theme.colors.contentSecondary,
                  position: 'fixed',
                  width: '100%',
                  height: '42px',
                  cursor: 'pointer',
                  left: '0',
                  bottom: '0',
                  paddingLeft: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  background: props.themeType === 'dark' ? 'rgba(31, 31, 31, 0.65)' : 'rgba(255, 255, 255, 0.65)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  borderTop: `1px solid ${props.themeType === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                  transition: 'background 0.3s ease',
              }
            : {
                  color: props.theme.colors.contentSecondary,
                  position: 'absolute',
                  cursor: 'pointer',
                  bottom: '16px',
                  left: '6px',
                  lineHeight: '1',
              },
})

interface LLMProvidersSettingsProps {
    providers: ProviderConfig[]
    defaultProviderId: string | null
    defaultModel: ModelSelection | null
    onChange(providers: ProviderConfig[], defaultProviderId: string | null, defaultModel: ModelSelection | null): void
}

const openaiReasoningEffortOptions: { id: OpenAIReasoningEffort; label: string }[] = [
    { id: 'none', label: 'None' },
    { id: 'minimal', label: 'Minimal' },
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
    { id: 'xhigh', label: 'Extra High' },
]

const anthropicThinkingEffortOptions: { id: AnthropicThinkingEffort; label: string }[] = [
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
    { id: 'xhigh', label: 'Extra High' },
    { id: 'max', label: 'Max' },
]

function LLMProvidersSettings({ providers, defaultProviderId, defaultModel, onChange }: LLMProvidersSettingsProps) {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null)
    const [isAddingProvider, setIsAddingProvider] = useState(false)
    const [refreshingProviderId, setRefreshingProviderId] = useState<string | null>(null)
    const activeProviderId = defaultModel?.providerId ?? defaultProviderId
    const activeProvider = useMemo(
        () => providers.find((provider) => provider.id === activeProviderId),
        [activeProviderId, providers]
    )

    const modelOptions = useMemo(() => {
        if (!activeProvider) {
            return []
        }
        const models = sortModelIds(
            Array.from(new Set([activeProvider.model, ...(activeProvider.modelOptions ?? [])].filter(Boolean)))
        )
        return models.map((model) => ({
            id: `${activeProvider.id}:${model}`,
            label: model,
            providerId: activeProvider.id,
            model,
        }))
    }, [activeProvider])
    const selectedModelOption = useMemo(
        () =>
            defaultModel
                ? modelOptions.find(
                      (option) => option.providerId === defaultModel.providerId && option.model === defaultModel.model
                  ) ?? {
                      id: `${defaultModel.providerId}:${defaultModel.model}`,
                      label: defaultModel.model,
                      providerId: defaultModel.providerId,
                      model: defaultModel.model,
                  }
                : undefined,
        [defaultModel, modelOptions]
    )
    const selectedOpenAIEffort = defaultModel?.openaiReasoningEffort ?? 'medium'
    const selectedAnthropicEffort = defaultModel?.anthropicThinkingEffort ?? 'high'
    const isOpenAIProtocol =
        activeProvider?.protocol === 'openai-chat' || activeProvider?.protocol === 'openai-responses'
    const updateDefaultModelThinking = useCallback(
        (thinking: Partial<ModelSelection>) => {
            if (!defaultModel) {
                return
            }
            onChange(providers, defaultProviderId, {
                ...defaultModel,
                ...thinking,
            })
        },
        [defaultModel, defaultProviderId, onChange, providers]
    )
    const dropdownOverrides = useMemo(
        () => ({
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
            Dropdown: {
                props: {
                    onWheel: (event: React.WheelEvent) => event.stopPropagation(),
                },
            },
        }),
        []
    )

    const closeForm = useCallback(() => {
        setEditingProvider(null)
        setIsAddingProvider(false)
    }, [])

    const saveProvider = useCallback(
        (value: ProviderFormValue) => {
            const provider: ProviderConfig = {
                ...value,
                id: value.id ?? uuidv4(),
            }
            const nextProviders = value.id
                ? providers.map((item) => (item.id === value.id ? provider : item))
                : [...providers, provider]
            onChange(nextProviders, defaultProviderId ?? provider.id, defaultModel)
            closeForm()
        },
        [closeForm, defaultModel, defaultProviderId, onChange, providers]
    )

    const deleteProvider = useCallback(
        (providerId: string) => {
            const nextProviders = providers.filter((provider) => provider.id !== providerId)
            const nextDefaultProviderId =
                defaultProviderId === providerId ? nextProviders[0]?.id ?? null : defaultProviderId
            const fallbackProvider = nextProviders.find((provider) => provider.model)
            const nextDefaultModel =
                defaultModel?.providerId === providerId && fallbackProvider
                    ? {
                          providerId: fallbackProvider.id,
                          model: fallbackProvider.model,
                      }
                    : defaultModel?.providerId === providerId
                    ? null
                    : defaultModel
            onChange(nextProviders, nextDefaultProviderId, nextDefaultModel)
        },
        [defaultModel, defaultProviderId, onChange, providers]
    )

    const activateProvider = useCallback(
        (provider: ProviderConfig) => {
            const model = provider.modelOptions?.[0] ?? provider.model
            onChange(
                providers,
                provider.id,
                model
                    ? {
                          providerId: provider.id,
                          model,
                      }
                    : defaultModel
            )
        },
        [defaultModel, onChange, providers]
    )

    const refreshProviderModels = useCallback(
        async (provider: ProviderConfig) => {
            if (!provider.apiKey.trim()) {
                toast(t('API Key is required.'))
                return
            }
            setRefreshingProviderId(provider.id)
            try {
                const models = await getEngine({
                    ...provider,
                    model: provider.model || 'model',
                }).listModels()
                const ids = sortModelIds(filterChatModels(models.map((model) => model.id)))
                const nextProviders = providers.map((item) => {
                    if (item.id !== provider.id) {
                        return item
                    }
                    return {
                        ...item,
                        modelOptions: ids,
                        model: item.model || ids[0] || '',
                    }
                })
                const nextDefaultModel =
                    defaultModel && defaultModel.providerId === provider.id
                        ? ids.includes(defaultModel.model)
                            ? defaultModel
                            : ids[0]
                            ? { providerId: provider.id, model: ids[0] }
                            : defaultModel
                        : defaultModel ?? (ids[0] ? { providerId: provider.id, model: ids[0] } : null)
                onChange(nextProviders, defaultProviderId ?? provider.id, nextDefaultModel)
                if (ids.length === 0) {
                    toast(t('Unable to fetch model list. Please enter the model name manually.'))
                }
            } catch (error) {
                toast(
                    error instanceof Error ? t(error.message) : t('Unable to fetch model list. Please enter manually.')
                )
            } finally {
                setRefreshingProviderId(null)
            }
        },
        [defaultModel, defaultProviderId, onChange, providers, t]
    )

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ color: theme.colors.contentSecondary }}>
                    {providers.length === 0
                        ? t('No LLM Provider')
                        : t('Manage OpenAI-compatible and Anthropic providers.')}
                </div>
                <Button
                    type='button'
                    size='compact'
                    startEnhancer={<IoMdAdd />}
                    onClick={() => setIsAddingProvider(true)}
                >
                    {t('Add')}
                </Button>
            </div>
            {providers.map((provider) => (
                <div
                    key={provider.id}
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '8px 10px',
                        border: `1px solid ${
                            provider.id === activeProviderId ? theme.colors.accent : theme.colors.borderOpaque
                        }`,
                        borderRadius: 8,
                        background:
                            provider.id === activeProviderId
                                ? theme.colors.backgroundSecondary
                                : theme.colors.backgroundPrimary,
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                color: theme.colors.contentPrimary,
                                fontWeight: 600,
                            }}
                        >
                            {provider.name}
                            {provider.id === activeProviderId && (
                                <span
                                    style={{
                                        borderRadius: 999,
                                        padding: '2px 8px',
                                        color: theme.colors.accent,
                                        background: theme.colors.backgroundPrimary,
                                        fontSize: 11,
                                        fontWeight: 600,
                                    }}
                                >
                                    {t('In use')}
                                </span>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {provider.id !== activeProviderId && (
                            <Button
                                type='button'
                                size='mini'
                                kind='secondary'
                                onClick={() => activateProvider(provider)}
                            >
                                {t('Use')}
                            </Button>
                        )}
                        <Button
                            type='button'
                            size='mini'
                            kind='secondary'
                            isLoading={refreshingProviderId === provider.id}
                            onClick={() => void refreshProviderModels(provider)}
                        >
                            {t('Refresh')}
                        </Button>
                        <Button type='button' size='mini' kind='secondary' onClick={() => setEditingProvider(provider)}>
                            {t('Edit')}
                        </Button>
                        <Button type='button' size='mini' kind='tertiary' onClick={() => deleteProvider(provider.id)}>
                            <RiDeleteBin5Line />
                        </Button>
                    </div>
                </div>
            ))}
            {providers.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ color: theme.colors.contentPrimary, fontWeight: 600 }}>{t('Model')}</div>
                    <Select
                        size='compact'
                        creatable
                        options={modelOptions}
                        value={selectedModelOption ? [selectedModelOption] : []}
                        placeholder={t('Model')}
                        overrides={dropdownOverrides}
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
                        onChange={({ value }) => {
                            const option = value[0]
                            if (!option) {
                                onChange(providers, defaultProviderId, null)
                                return
                            }
                            const providerId = option.providerId as string | undefined
                            const model = option.model as string | undefined
                            if (providerId && model) {
                                onChange(providers, providerId, {
                                    providerId,
                                    model,
                                    thinkingEnabled: defaultModel?.thinkingEnabled,
                                    openaiReasoningEffort: defaultModel?.openaiReasoningEffort,
                                    anthropicThinkingEffort: defaultModel?.anthropicThinkingEffort,
                                })
                                return
                            }
                            const selectedModel = option.id
                            if (typeof selectedModel === 'string') {
                                const providerId = defaultModel?.providerId ?? defaultProviderId ?? providers[0].id
                                onChange(providers, providerId, {
                                    providerId,
                                    model: selectedModel,
                                    thinkingEnabled: defaultModel?.thinkingEnabled,
                                    openaiReasoningEffort: defaultModel?.openaiReasoningEffort,
                                    anthropicThinkingEffort: defaultModel?.anthropicThinkingEffort,
                                })
                            }
                        }}
                    />
                    <Checkbox
                        checkmarkType='toggle_round'
                        checked={defaultModel?.thinkingEnabled === true}
                        disabled={!defaultModel}
                        onChange={(event) => updateDefaultModelThinking({ thinkingEnabled: event.target.checked })}
                    >
                        {t('Thinking Enabled')}
                    </Checkbox>
                    {isOpenAIProtocol && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ color: theme.colors.contentSecondary, fontSize: 12 }}>
                                {t('OpenAI Reasoning Effort')}
                            </div>
                            <Select
                                size='compact'
                                clearable={false}
                                searchable={false}
                                options={openaiReasoningEffortOptions.map((option) => ({
                                    ...option,
                                    label: t(option.label),
                                }))}
                                value={[
                                    {
                                        id: selectedOpenAIEffort,
                                        label: t(
                                            openaiReasoningEffortOptions.find(
                                                (option) => option.id === selectedOpenAIEffort
                                            )?.label ?? 'Medium'
                                        ),
                                    },
                                ]}
                                onChange={({ option }) =>
                                    option?.id &&
                                    updateDefaultModelThinking({
                                        openaiReasoningEffort: option.id as OpenAIReasoningEffort,
                                    })
                                }
                            />
                        </div>
                    )}
                    {activeProvider?.protocol === 'anthropic' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ color: theme.colors.contentSecondary, fontSize: 12 }}>
                                {t('Anthropic Thinking Effort')}
                            </div>
                            <Select
                                size='compact'
                                clearable={false}
                                searchable={false}
                                options={anthropicThinkingEffortOptions.map((option) => ({
                                    ...option,
                                    label: t(option.label),
                                }))}
                                value={[
                                    {
                                        id: selectedAnthropicEffort,
                                        label: t(
                                            anthropicThinkingEffortOptions.find(
                                                (option) => option.id === selectedAnthropicEffort
                                            )?.label ?? 'High'
                                        ),
                                    },
                                ]}
                                onChange={({ option }) =>
                                    option?.id &&
                                    updateDefaultModelThinking({
                                        anthropicThinkingEffort: option.id as AnthropicThinkingEffort,
                                    })
                                }
                            />
                        </div>
                    )}
                    <div style={{ color: theme.colors.contentSecondary, fontSize: 12 }}>
                        {t(
                            'Thinking support depends on the selected model and compatible endpoint. OpenAI reasoning models should use the OpenAI Responses protocol.'
                        )}
                    </div>
                </div>
            )}
            {(isAddingProvider || editingProvider) && (
                <ProviderForm initialValue={editingProvider ?? undefined} onCancel={closeForm} onSave={saveProvider} />
            )}
        </div>
    )
}

const { Form, FormItem, useForm } = createForm<ISettings>()

interface IInnerSettingsProps {
    showFooter?: boolean
    onSave?: (oldSettings: ISettings) => void
}

interface ISettingsProps extends IInnerSettingsProps {
    engine: Styletron
}

export function Settings({ engine, ...props }: ISettingsProps) {
    const { theme } = useTheme()
    return (
        <StyletronProvider value={engine}>
            <BaseProvider theme={theme}>
                <GlobalSuspense>
                    <InnerSettings {...props} />
                </GlobalSuspense>
            </BaseProvider>
        </StyletronProvider>
    )
}

export function InnerSettings({ onSave, showFooter = false }: IInnerSettingsProps) {
    const isTauri = utils.isTauri()
    const { theme, themeType } = useTheme()

    const { refreshThemeType } = useThemeType()

    const { t } = useTranslation()

    const [loading, setLoading] = useState(false)
    const { settings, setSettings } = useSettings()
    const [values, setValues] = useState<ISettings>(settings)
    const [prevValues, setPrevValues] = useState<ISettings>(values)
    const valuesRef = useRef(values)

    const [form] = useForm()

    useEffect(() => {
        form.setFieldsValue(values)
    }, [form, values])

    useEffect(() => {
        if (settings) {
            ;(async () => {
                if (isTauri) {
                    const { isEnabled: autostartIsEnabled } = await import('@tauri-apps/plugin-autostart')
                    settings.runAtStartup = await autostartIsEnabled()
                }
                valuesRef.current = settings
                setValues(settings)
                setPrevValues(settings)
            })()
        }
    }, [isTauri, settings])

    const mergeFormValues = useCallback((baseValues: ISettings, formValues: ISettings) => {
        return utils.normalizeSettings({
            ...baseValues,
            ...formValues,
            proxy: formValues.proxy ? { ...baseValues.proxy, ...formValues.proxy } : baseValues.proxy,
            tts: formValues.tts ? { ...baseValues.tts, ...formValues.tts } : baseValues.tts,
        })
    }, [])

    const onChange = useCallback(
        (_changes: Partial<ISettings>, values_: ISettings) => {
            setValues((currentValues) => {
                const nextValues = mergeFormValues(currentValues, values_)
                valuesRef.current = nextValues
                return nextValues
            })
        },
        [mergeFormValues]
    )

    const onSubmit = useCallback(
        async (data: ISettings) => {
            setLoading(true)
            const nextSettings = mergeFormValues(valuesRef.current, data)
            const oldSettings = await utils.getSettings()
            if (isTauri) {
                try {
                    const {
                        enable: autostartEnable,
                        disable: autostartDisable,
                        isEnabled: autostartIsEnabled,
                    } = await import('@tauri-apps/plugin-autostart')
                    if (nextSettings.runAtStartup) {
                        await autostartEnable()
                    } else {
                        await autostartDisable()
                    }
                    nextSettings.runAtStartup = await autostartIsEnabled()
                } catch (e) {
                    console.log('err', e)
                }
            }
            await utils.setSettings(nextSettings)

            if (nextSettings.themeType) {
                refreshThemeType()
            }

            toast(t('Saved'), {
                icon: '👍',
                duration: 3000,
            })
            setLoading(false)
            valuesRef.current = nextSettings
            setPrevValues(nextSettings)
            setSettings(nextSettings)
            onSave?.(oldSettings)
        },
        [isTauri, onSave, setSettings, refreshThemeType, t, mergeFormValues]
    )

    const persistSettings = useCallback(
        async (nextValues: ISettings) => {
            await utils.setSettings(nextValues)
            valuesRef.current = nextValues
            setPrevValues(nextValues)
            setSettings(nextValues)
        },
        [setSettings]
    )

    const onBlur = useCallback(async () => {
        if (!_.isEqual(values, prevValues)) {
            await persistSettings(values)
        }
    }, [persistSettings, prevValues, values])

    const handleLLMProvidersChange = useCallback(
        (providers: ProviderConfig[], defaultProviderId: string | null, defaultModel: ModelSelection | null) => {
            const nextValues = {
                ...values,
                providers,
                defaultProviderId,
                defaultModel,
            }
            form.setFieldsValue({
                providers,
                defaultProviderId,
                defaultModel,
            })
            valuesRef.current = nextValues
            setValues(nextValues)
            void persistSettings(nextValues)
        },
        [form, persistSettings, values]
    )

    const handleStructuredOutputChange = useCallback(
        (useStructuredOutput: boolean) => {
            const nextValues = {
                ...valuesRef.current,
                useStructuredOutput,
            }
            form.setFieldsValue({
                useStructuredOutput,
            })
            valuesRef.current = nextValues
            setValues(nextValues)
            void persistSettings(nextValues)
        },
        [form, persistSettings]
    )

    const handleStrictSchemaChange = useCallback(
        (useStrictSchema: boolean) => {
            const nextValues = {
                ...valuesRef.current,
                useStrictSchema,
            }
            form.setFieldsValue({
                useStrictSchema,
            })
            valuesRef.current = nextValues
            setValues(nextValues)
            void persistSettings(nextValues)
        },
        [form, persistSettings]
    )

    const isDesktopApp = utils.isDesktopApp()

    const styles = useStyles({ theme, themeType, isDesktopApp })

    const [isScrolledToBottom, setIsScrolledToBottom] = useState(false)

    useEffect(() => {
        if (!showFooter) {
            return undefined
        }
        const isOnBottom = () => {
            const scrollTop = document.documentElement.scrollTop

            const windowHeight = window.innerHeight

            const documentHeight = document.documentElement.scrollHeight

            return scrollTop + windowHeight >= documentHeight
        }

        setIsScrolledToBottom(isOnBottom())

        const onScroll = () => {
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
    }, [showFooter])

    const [activeTab, setActiveTab] = useState('general')

    const [isScrolled, setIsScrolled] = useState(window.scrollY > 0)

    useEffect(() => {
        const onScroll = () => {
            setIsScrolled(window.scrollY > 0)
        }
        window.addEventListener('scroll', onScroll)
        return () => {
            window.removeEventListener('scroll', onScroll)
        }
    }, [])

    const tabsOverrides = {
        Root: {
            style: {
                '& button:hover': {
                    background: 'transparent !important',
                },
            },
        },
        TabList: {
            style: () => ({}),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            component: function TabsListOverride(props: any) {
                return (
                    <Grid behavior='fluid'>
                        <Cell span={12}>
                            <StyledTabList {...props} />
                        </Cell>
                    </Grid>
                )
            },
        },
    }

    const tabOverrides = {
        TabPanel: {
            style: {
                padding: '0px',
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            component: function TabsListOverride(props: any) {
                return (
                    <Grid>
                        <Cell span={[1, 2, 3]}>
                            <StyledTabPanel {...props} />
                        </Cell>
                    </Grid>
                )
            },
        },
        Tab: {
            style: {
                'color': theme.colors.black,
                'background': 'transparent',
                ':hover': {
                    background: 'rgba(255, 255, 255, 0.35) !important',
                },
                ':active': {
                    background: 'rgba(255, 255, 255, 0.45) !important',
                },
            },
        },
    }

    console.debug('render settings')

    return (
        <div
            style={{
                paddingTop: utils.isBrowserExtensionOptions() ? undefined : '136px',
                paddingBottom: utils.isBrowserExtensionOptions() ? undefined : '32px',
                background: isDesktopApp ? 'transparent' : theme.colors.backgroundPrimary,
                minWidth: isDesktopApp ? 450 : 400,
                maxHeight: utils.isUserscript() ? 'calc(100vh - 32px)' : undefined,
                overflow: utils.isUserscript() ? 'auto' : undefined,
            }}
            data-testid='settings-container'
        >
            <nav
                style={{
                    position: utils.isBrowserExtensionOptions() ? 'sticky' : 'fixed',
                    left: 0,
                    top: 0,
                    zIndex: 999,
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    background: `url(${utils.getAssetUrl(beams)}) no-repeat center center`,
                    boxSizing: 'border-box',
                    boxShadow: isScrolled ? theme.lighting.shadow600 : undefined,
                }}
                data-tauri-drag-region
            >
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        color: '#333',
                        gap: 10,
                        padding: '15px 25px 0 25px',
                    }}
                >
                    <img width='22' src={utils.getAssetUrl(icon)} alt='logo' />
                    <h2
                        style={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        SimpleAI Translator
                        {appVersion ? (
                            <a
                                href='https://github.com/nextai-translator/nextai-translator/releases'
                                target='_blank'
                                rel='noreferrer'
                                style={linkStyle}
                            >
                                {appVersion}
                            </a>
                        ) : null}
                    </h2>
                    <div
                        style={{
                            flexGrow: 1,
                        }}
                    />
                </div>
                <Tabs
                    overrides={tabsOverrides}
                    activeKey={activeTab}
                    onChange={({ activeKey }) => {
                        setActiveTab(activeKey as string)
                    }}
                    fill='fixed'
                    renderAll
                >
                    <Tab
                        title={t('General')}
                        key='general'
                        artwork={() => {
                            return <IoSettingsOutline size={14} />
                        }}
                        overrides={tabOverrides}
                    />
                    {isTauri && (
                        <Tab
                            title={t('Proxy')}
                            key='proxy'
                            artwork={() => {
                                return <TbCloudNetwork size={14} />
                            }}
                            overrides={tabOverrides}
                        />
                    )}
                    <Tab
                        title={t('TTS')}
                        key='tts'
                        artwork={() => {
                            return <RxSpeakerLoud size={14} />
                        }}
                        overrides={tabOverrides}
                    />
                </Tabs>
            </nav>
            {!isDesktopApp && (
                <div
                    style={{
                        padding: '20px 25px 0px 25px',
                        color: theme.colors.contentPrimary,
                    }}
                >
                    {t(
                        'It is recommended to download the desktop application of SimpleAI Translator to enjoy the wonderful experience of word translation in all software!'
                    )}{' '}
                    <a
                        target='_blank'
                        href={
                            values?.i18n?.toLowerCase().includes('zh')
                                ? 'https://github.com/nextai-translator/nextai-translator/blob/main/README-CN.md#%E5%AE%89%E8%A3%85'
                                : 'https://github.com/nextai-translator/nextai-translator#installation'
                        }
                        rel='noreferrer'
                        style={{
                            color: theme.colors.linkText,
                        }}
                    >
                        {t('Download Link')}
                    </a>
                </div>
            )}
            <Form
                autoComplete='off'
                autoCapitalize='off'
                form={form}
                style={{
                    padding: '20px 25px',
                    paddingBottom: utils.isBrowserExtensionOptions() ? 0 : undefined,
                }}
                onFinish={onSubmit}
                initialValues={values}
                onValuesChange={onChange}
            >
                <div>
                    <div
                        style={{
                            display: activeTab === 'general' ? 'block' : 'none',
                        }}
                    >
                        <FormItem name='i18n' label={t('i18n')}>
                            <Ii18nSelector onBlur={onBlur} />
                        </FormItem>
                        <div style={{ marginBottom: 20 }}>
                            <div
                                style={{
                                    flexShrink: 0,
                                    padding: '0.25em 0',
                                    fontSize: '1.2em',
                                    fontWeight: '600',
                                    color: theme.colors.contentPrimary,
                                }}
                            >
                                {t('LLM Providers')}
                            </div>
                            <LLMProvidersSettings
                                providers={values.providers ?? []}
                                defaultProviderId={values.defaultProviderId ?? null}
                                defaultModel={values.defaultModel ?? null}
                                onChange={handleLLMProvidersChange}
                            />
                        </div>
                        <FormItem
                            name='nativeLanguage'
                            label={t('Native language')}
                            caption={t('Text in other languages is translated into this language.')}
                        >
                            <LanguageSelector onBlur={onBlur} />
                        </FormItem>
                        <FormItem
                            name='translationTargetLanguage'
                            label={t('Translation target language')}
                            caption={t('Text in your native language is translated into this language.')}
                        >
                            <LanguageSelector onBlur={onBlur} />
                        </FormItem>
                        <div className='rc-form-item'>
                            <div
                                className='rc-form-item-label'
                                style={{
                                    flexShrink: 0,
                                    padding: '0.25em 0',
                                    fontSize: '1.2em',
                                    fontWeight: '600',
                                }}
                            >
                                {t('Use Structured Output')}
                            </div>
                            <SettingsToggle
                                value={values.useStructuredOutput}
                                onChange={handleStructuredOutputChange}
                            />
                        </div>
                        <div className='rc-form-item'>
                            <div
                                className='rc-form-item-label'
                                style={{
                                    flexShrink: 0,
                                    padding: '0.25em 0',
                                    fontSize: '1.2em',
                                    fontWeight: '600',
                                }}
                            >
                                {t('Strict JSON Schema')}
                            </div>
                            <SettingsToggle
                                value={values.useStrictSchema}
                                onChange={handleStrictSchemaChange}
                                disabled={!values.useStructuredOutput}
                                caption={t(
                                    'Some older or third-party models only support JSON Object mode and may fail with Strict Schema enabled.'
                                )}
                            />
                        </div>
                        <FormItem name='languageDetectionEngine' label={t('Language detection engine')}>
                            <LanguageDetectionEngineSelector onBlur={onBlur} />
                        </FormItem>
                        <FormItem name='themeType' label={t('Theme')}>
                            <ThemeTypeSelector onBlur={onBlur} />
                        </FormItem>
                        <FormItem
                            style={{
                                display: isDesktopApp ? 'block' : 'none',
                            }}
                            name='enableBackgroundBlur'
                            label={t('Window background blur')}
                            caption={t(
                                "If the window background blur effect is enabled, please ensure to set the 'Theme' to 'Follow the System', as it is currently not possible to manually switch between light and dark themes when the window background blur is active."
                            )}
                        >
                            <MyCheckbox onBlur={onBlur} />
                        </FormItem>
                        <FormItem name='fontSize' label={t('Font size')}>
                            <NumberInput />
                        </FormItem>
                        <FormItem
                            style={{
                                display: isDesktopApp ? 'block' : 'none',
                            }}
                            name='restorePreviousPosition'
                            label={t('Fixed Position')}
                        >
                            <RestorePreviousPositionCheckbox onBlur={onBlur} />
                        </FormItem>
                        {isTauri && (
                            <FormItem name='runAtStartup' label={t('Run at startup')}>
                                <RunAtStartupCheckbox onBlur={onBlur} />
                            </FormItem>
                        )}
                        <FormItem
                            style={{
                                display: isDesktopApp ? 'block' : 'none',
                            }}
                            name='automaticCheckForUpdates'
                            label={t('Automatic check for updates')}
                        >
                            <MyCheckbox onBlur={onBlur} />
                        </FormItem>
                    </div>
                    <div
                        style={{
                            display: isTauri && activeTab === 'proxy' ? 'block' : 'none',
                        }}
                    >
                        <FormItem name={['proxy', 'enabled']} label={t('Enabled')}>
                            <MyCheckbox />
                        </FormItem>
                        <FormItem name={['proxy', 'protocol']} label={t('Protocol')}>
                            <ProxyProtocolSelector />
                        </FormItem>
                        <FormItem name={['proxy', 'server']} label={t('Server')}>
                            <Input size='compact' />
                        </FormItem>
                        <FormItem name={['proxy', 'port']} label={t('Port')}>
                            <Input type='number' size='compact' />
                        </FormItem>
                        <FormItem name={['proxy', 'basicAuth', 'username']} label={t('Username')}>
                            <Input size='compact' />
                        </FormItem>
                        <FormItem name={['proxy', 'basicAuth', 'password']} label={t('Password')}>
                            <Input type='password' size='compact' />
                        </FormItem>
                        <FormItem name={['proxy', 'noProxy']} label={t('No proxy')}>
                            <Textarea size='compact' />
                        </FormItem>
                        <ProxyTester proxy={values.proxy} />
                    </div>
                    <div
                        style={{
                            display: activeTab === 'tts' ? 'block' : 'none',
                        }}
                    >
                        <FormItem name='tts' label={t('TTS')}>
                            <TTSVoicesSettings providers={values.providers ?? []} onBlur={onBlur} />
                        </FormItem>
                    </div>
                </div>
                <div
                    style={{
                        position: utils.isBrowserExtensionOptions() ? 'sticky' : 'fixed',
                        bottom: '7px',
                        right: '25px',
                        paddingBottom: utils.isBrowserExtensionOptions() ? '10px' : undefined,
                        display: 'flex',
                        alignItems: 'center',
                        flexDirection: 'row',
                        zIndex: 1000,
                        gap: 10,
                    }}
                >
                    <div
                        style={{
                            marginRight: 'auto',
                        }}
                    />
                    <Button
                        type='button'
                        isLoading={loading}
                        size='mini'
                        startEnhancer={<IoIosSave size={12} />}
                        onClick={() => void onSubmit(form.getFieldsValue())}
                    >
                        {t('Save')}
                    </Button>
                </div>
                <Toaster />
            </Form>
            {showFooter && (
                <div
                    className={styles.footer}
                    style={{
                        boxShadow: isScrolledToBottom ? undefined : theme.lighting.shadow700,
                    }}
                />
            )}
        </div>
    )
}
