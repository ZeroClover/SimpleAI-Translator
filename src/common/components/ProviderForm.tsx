import { useCallback, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from 'baseui-sd/button'
import { Checkbox } from 'baseui-sd/checkbox'
import { Input } from 'baseui-sd/input'
import { Select } from 'baseui-sd/select'
import { Textarea } from 'baseui-sd/textarea'
import { useTranslation } from 'react-i18next'
import { AnthropicThinkingEffort, OpenAIReasoningEffort, ProviderConfig, ProviderProtocol } from '../types'
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
    const [extraHeaders, setExtraHeaders] = useState(
        initialValue?.extraHeaders ? JSON.stringify(initialValue.extraHeaders, null, 2) : ''
    )
    const [thinkingEnabled, setThinkingEnabled] = useState(initialValue?.thinkingEnabled === true)
    const [openaiReasoningEffort, setOpenAIReasoningEffort] = useState<OpenAIReasoningEffort | undefined>(
        initialValue?.openaiReasoningEffort
    )
    const [anthropicThinkingEffort, setAnthropicThinkingEffort] = useState<AnthropicThinkingEffort | undefined>(
        initialValue?.anthropicThinkingEffort
    )
    const [showAdvanced, setShowAdvanced] = useState(Boolean(initialValue?.extraHeaders))

    const translatedProtocolOptions = useMemo(
        () => protocolOptions.map((option) => ({ id: option.id, label: t(option.labelKey) })),
        [t]
    )
    const selectedProtocolOption = useMemo(
        () => translatedProtocolOptions.find((option) => option.id === protocol),
        [protocol, translatedProtocolOptions]
    )
    const selectedOpenAIEffort = openaiReasoningEffort ?? 'medium'
    const selectedAnthropicEffort = anthropicThinkingEffort ?? 'high'
    const isOpenAIProtocol = protocol === 'openai-chat' || protocol === 'openai-responses'
    const handleSave = useCallback(() => {
        if (!name.trim()) {
            toast(t('Provider name is required.'))
            return
        }
        if (!apiKey.trim()) {
            toast(t('API Key is required.'))
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
                model: initialValue?.model ?? '',
                modelOptions: initialValue?.modelOptions ?? [],
                extraHeaders: parsedHeaders,
                thinkingEnabled,
                openaiReasoningEffort: isOpenAIProtocol ? selectedOpenAIEffort : openaiReasoningEffort,
                anthropicThinkingEffort: protocol === 'anthropic' ? selectedAnthropicEffort : anthropicThinkingEffort,
            })
        } catch (error) {
            toast(error instanceof Error ? t(error.message) : t('Extra headers must be valid JSON.'))
        }
    }, [
        apiKey,
        endpoint,
        extraHeaders,
        initialValue?.id,
        initialValue?.model,
        initialValue?.modelOptions,
        isOpenAIProtocol,
        name,
        onSave,
        openaiReasoningEffort,
        protocol,
        selectedAnthropicEffort,
        selectedOpenAIEffort,
        anthropicThinkingEffort,
        thinkingEnabled,
        t,
    ])

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
                searchable={false}
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
            <Checkbox
                checkmarkType='toggle_round'
                checked={thinkingEnabled}
                onChange={(event) => setThinkingEnabled(event.target.checked)}
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
                        options={openaiReasoningEffortOptions.map((option) => ({ ...option, label: t(option.label) }))}
                        value={[
                            {
                                id: selectedOpenAIEffort,
                                label: t(
                                    openaiReasoningEffortOptions.find((option) => option.id === selectedOpenAIEffort)
                                        ?.label ?? 'Medium'
                                ),
                            },
                        ]}
                        onChange={({ option }) =>
                            option?.id && setOpenAIReasoningEffort(option.id as OpenAIReasoningEffort)
                        }
                    />
                </div>
            )}
            {protocol === 'anthropic' && (
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
                            option?.id && setAnthropicThinkingEffort(option.id as AnthropicThinkingEffort)
                        }
                    />
                </div>
            )}
            <div style={{ color: theme.colors.contentSecondary, fontSize: 12 }}>
                {t(
                    'Thinking support depends on the selected model and compatible endpoint. OpenAI reasoning models should use the OpenAI Responses protocol.'
                )}
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
