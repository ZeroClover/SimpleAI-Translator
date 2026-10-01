import { describe, expect, it, vi } from 'vitest'
import { startExclusivePlayback } from '.'

describe('startExclusivePlayback', () => {
    it('stops the previous playback when a new one starts', () => {
        const stopFirst = vi.fn()
        const stopSecond = vi.fn()

        startExclusivePlayback(stopFirst)
        const releaseSecond = startExclusivePlayback(stopSecond)

        expect(stopFirst).toHaveBeenCalledTimes(1)
        expect(stopSecond).not.toHaveBeenCalled()
        releaseSecond()
    })

    it('does not stop a playback that already released its slot', () => {
        const stopFirst = vi.fn()
        const releaseFirst = startExclusivePlayback(stopFirst)
        releaseFirst()

        const releaseSecond = startExclusivePlayback(vi.fn())

        expect(stopFirst).not.toHaveBeenCalled()
        releaseSecond()
    })

    it('ignores a stale release from a replaced playback', () => {
        const releaseFirst = startExclusivePlayback(vi.fn())
        const stopSecond = vi.fn()
        startExclusivePlayback(stopSecond)

        releaseFirst()
        const releaseThird = startExclusivePlayback(vi.fn())

        expect(stopSecond).toHaveBeenCalledTimes(1)
        releaseThird()
    })

    it('tolerates a stop callback that releases its own slot', () => {
        const stopFirst = vi.fn(() => releaseFirst())
        const releaseFirst = startExclusivePlayback(stopFirst)
        const stopSecond = vi.fn()
        const releaseSecond = startExclusivePlayback(stopSecond)

        const releaseThird = startExclusivePlayback(vi.fn())

        expect(stopFirst).toHaveBeenCalledTimes(1)
        expect(stopSecond).toHaveBeenCalledTimes(1)
        releaseSecond()
        releaseThird()
    })
})
