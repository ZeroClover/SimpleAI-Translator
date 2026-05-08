import { useCallback, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from 'baseui-sd/button'
import { Input } from 'baseui-sd/input'
import { Select } from 'baseui-sd/select'
import { Textarea } from 'baseui-sd/textarea'
import { useTranslation } from 'react-i18next'
import { ProviderConfig, ProviderProtocol } from '../types'
import { getEngine } from '../engines'
import { filterChatModels } from '../engines/model-filter'
import { useTheme } from '../hooks/useTheme'

const protocolOptions: { id: ProviderProtocol; labelKey: string }[] = [
    { id: 'openai-chat', labelKey: 'OpenAI Chat Completions' },
    { id: 'openai-responses', labelKey: 'OpenAI Responses' },
    { id: 'anthropic', labelKey: 'Anthropic Messages' },
]

const defaultEndpointByProtocol: Record<ProviderProtocol, string> = {
    'openai-chat': 'https://api.openai.com/v1',
    'openai-responses': 'https://api.openai.com/v1',
    'anthropic': 'https://api.anthropic.com',
}

export type ProviderFormValue = Omit<ProviderConfig, 'id'> & { id?: string }

interface ProviderFormProps {
    initialValue?: ProviderConfig
    onCancel(): void
    onSave(value: ProviderFormValue): void
}

function parseExtraHeaders(value: string): Record<string, string> | undefined {
    const trimmed = value.trim()
    if (!trimmed) {
        return undefined
    }
    let parsed: unknown
    try {
        parsed = JSON.parse(trimmed)
    } catch {
        throw new Error('Extra headers must be valid JSON.')
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Extra headers must be a JSON object.')
    }
    return Object.fromEntries(Object.entries(parsed).map(([key, val]) => [key, String(val)]))
}

function isValidEndpoint(endpoint: string): boolean {
    if (!endpoint.trim()) {
        return true
    }
    try {
        const url = new URL(endpoint)
        return url.protocol === 'https:' || url.protocol === 'http:'
    } catch {
        return false
    }
}

export function ProviderForm({ initialValue, onCancel, onSave }: ProviderFormProps) {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const [name, setName] = useState(initialValue?.name ?? '')
    const [protocol, setProtocol] = useState<ProviderProtocol>(initialValue?.protocol ?? 'openai-chat')
    const [apiKey, setAPIKey] = useState(initialValue?.apiKey ?? '')
    const [endpoint, setEndpoint] = useState(initialValue?.endpoint ?? '')
    const [model, setModel] = useState(initialValue?.model ?? '')
    const [extraHeaders, setExtraHeaders] = useState(
        initialValue?.extraHeaders ? JSON.stringify(initialValue.extraHeaders, null, 2) : ''
    )
    const [modelOptions, setModelOptions] = useState<string[]>(initialValue?.model ? [initialValue.model] : [])
    const [isRefreshingModels, setIsRefreshingModels] = useState(false)
    const [hasAutoRefreshed, setHasAutoRefreshed] = useState(Boolean(initialValue))
    const [showAdvanced, setShowAdvanced] = useState(Boolean(initialValue?.extraHeaders))

    const translatedProtocolOptions = useMemo(
        () => protocolOptions.map((option) => ({ id: option.id, label: t(option.labelKey) })),
        [t]
    )
    const selectedProtocolOption = useMemo(
        () => translatedProtocolOptions.find((option) => option.id === protocol),
        [protocol, translatedProtocolOptions]
    )
    const selectedModelOption = useMemo(() => (model ? [{ id: model, label: model }] : []), [model])

    const refreshModels = useCallback(async () => {
        if (!apiKey.trim()) {
            return
        }
        setIsRefreshingModels(true)
        try {
            const engine = getEngine({
                id: initialValue?.id ?? 'preview-provider',
                name: name.trim() || 'Provider',
                protocol,
                apiKey: apiKey.trim(),
                endpoint: endpoint.trim() || undefined,
                model: model.trim() || 'model',
                extraHeaders: parseExtraHeaders(extraHeaders),
            })
            const models = await engine.listModels()
            const ids = filterChatModels(models.map((item) => item.id))
            setModelOptions(ids)
            if (!model && ids[0]) {
                setModel(ids[0])
            }
            if (ids.length === 0) {
                toast(t('Unable to fetch model list. Please enter the model name manually.'))
            }
        } catch (error) {
            toast(error instanceof Error ? t(error.message) : t('Unable to fetch model list. Please enter manually.'))
        } finally {
            setIsRefreshingModels(false)
            setHasAutoRefreshed(true)
        }
    }, [apiKey, endpoint, extraHeaders, initialValue?.id, model, name, protocol, t])

    const handleSave = useCallback(() => {
        if (!name.trim()) {
            toast(t('Provider name is required.'))
            return
        }
        if (!apiKey.trim()) {
            toast(t('API Key is required.'))
            return
        }
        if (!model.trim()) {
            toast(t('Model name is required.'))
            return
        }
        if (!isValidEndpoint(endpoint)) {
            toast(t('Endpoint must be a valid URL.'))
            return
        }
        try {
            const parsedHeaders = parseExtraHeaders(extraHeaders)
            onSave({
                id: initialValue?.id,
                name: name.trim(),
                protocol,
                apiKey: apiKey.trim(),
                endpoint: endpoint.trim() || undefined,
                model: model.trim(),
                extraHeaders: parsedHeaders,
            })
        } catch (error) {
            toast(error instanceof Error ? t(error.message) : t('Extra headers must be valid JSON.'))
        }
    }, [apiKey, endpoint, extraHeaders, initialValue?.id, model, name, onSave, protocol, t])

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Input
                size='compact'
                value={name}
                placeholder={t('Name')}
                onChange={(event) => setName(event.currentTarget.value)}
            />
            <Select
                size='compact'
                clearable={false}
                options={translatedProtocolOptions}
                value={selectedProtocolOption ? [selectedProtocolOption] : []}
                onChange={({ option }) => option?.id && setProtocol(option.id as ProviderProtocol)}
            />
            <Input
                size='compact'
                type='password'
                value={apiKey}
                placeholder={t('API Key')}
                onChange={(event) => setAPIKey(event.currentTarget.value)}
                onBlur={() => {
                    if (!hasAutoRefreshed) {
                        void refreshModels()
                    }
                }}
            />
            <Input
                size='compact'
                value={endpoint}
                placeholder={t('Endpoint')}
                onChange={(event) => setEndpoint(event.currentTarget.value)}
            />
            <div style={{ color: theme.colors.contentSecondary, fontSize: 12 }}>
                {t('Official endpoint')}: {defaultEndpointByProtocol[protocol]}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                    <Select
                        size='compact'
                        creatable
                        options={modelOptions.map((id) => ({ id, label: id }))}
                        value={selectedModelOption}
                        placeholder={t('Model')}
                        onChange={({ value }) => {
                            const nextModel = value[0]?.id
                            setModel(typeof nextModel === 'string' ? nextModel : '')
                        }}
                    />
                </div>
                <Button
                    type='button'
                    size='compact'
                    isLoading={isRefreshingModels}
                    onClick={() => void refreshModels()}
                >
                    {t('Refresh')}
                </Button>
            </div>
            <Button type='button' size='mini' kind='tertiary' onClick={() => setShowAdvanced((value) => !value)}>
                {t('Advanced')}
            </Button>
            {showAdvanced && (
                <Textarea
                    size='compact'
                    value={extraHeaders}
                    placeholder={t('Extra headers JSON')}
                    onChange={(event) => setExtraHeaders(event.currentTarget.value)}
                />
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button type='button' size='compact' kind='secondary' onClick={onCancel}>
                    {t('Cancel')}
                </Button>
                <Button type='button' size='compact' onClick={handleSave}>
                    {t('Save')}
                </Button>
            </div>
        </div>
    )
}
