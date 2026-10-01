/* eslint-disable camelcase */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProviderConfig } from '../../types'
import { getUniversalFetch } from '../../universal-fetch'
import { listModels } from './anthropic'

vi.mock('../../utils', () => ({ fetchSSE: vi.fn() }))
vi.mock('../../universal-fetch', () => ({ getUniversalFetch: vi.fn() }))

const providerConfig: ProviderConfig = {
    id: 'provider-1',
    name: 'Anthropic',
    protocol: 'anthropic',
    apiKey: 'sk-test',
    model: '',
}

function page(ids: string[], hasMore: boolean, status = 200): Response {
    return new Response(
        JSON.stringify({
            data: ids.map((id) => ({ id, type: 'model' })),
            has_more: hasMore,
            first_id: ids[0] ?? null,
            last_id: ids[ids.length - 1] ?? null,
        }),
        { status, headers: { 'Content-Type': 'application/json' } }
    )
}

describe('anthropic listModels pagination', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('requests the maximum page size and follows has_more with after_id', async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(page(['claude-opus-5-5', 'claude-sonnet-5-5'], true))
            .mockResolvedValueOnce(page(['claude-haiku-4-5'], false))
        vi.mocked(getUniversalFetch).mockReturnValue(fetcher)

        await expect(listModels(providerConfig)).resolves.toEqual([
            'claude-opus-5-5',
            'claude-sonnet-5-5',
            'claude-haiku-4-5',
        ])
        expect(fetcher).toHaveBeenCalledTimes(2)
        expect(fetcher.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/models?limit=1000')
        expect(fetcher.mock.calls[1][0]).toBe(
            'https://api.anthropic.com/v1/models?limit=1000&after_id=claude-sonnet-5-5'
        )
        expect(fetcher.mock.calls[0][1].signal).toBe(fetcher.mock.calls[1][1].signal)
    })

    it('stops when has_more is set but the cursor does not advance', async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(page(['claude-opus-5-5'], true))
            .mockResolvedValueOnce(page(['claude-opus-5-5'], true))
        vi.mocked(getUniversalFetch).mockReturnValue(fetcher)

        await expect(listModels(providerConfig)).resolves.toEqual(['claude-opus-5-5', 'claude-opus-5-5'])
        expect(fetcher).toHaveBeenCalledTimes(2)
    })

    it('returns an empty list when a later page fails', async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(page(['claude-opus-5-5'], true))
            .mockResolvedValueOnce(page([], false, 500))
        vi.mocked(getUniversalFetch).mockReturnValue(fetcher)

        await expect(listModels(providerConfig)).resolves.toEqual([])
    })

    it('returns an empty list when a later page request rejects', async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(page(['claude-opus-5-5'], true))
            .mockRejectedValueOnce(new DOMException('Timeout', 'TimeoutError'))
        vi.mocked(getUniversalFetch).mockReturnValue(fetcher)

        await expect(listModels(providerConfig)).resolves.toEqual([])
    })
})
