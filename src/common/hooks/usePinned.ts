import { useCallback, useEffect } from 'react'
import { create } from 'zustand'
import { isTauri } from '../utils'
import { events } from '@/tauri/bindings'

interface PinnedState {
    pinned: boolean
    setPinned: (updater: boolean | ((prev: boolean) => boolean)) => void
}

const usePinnedStore = create<PinnedState>((set) => ({
    pinned: false,
    setPinned: (updater) =>
        set((state) => ({
            pinned: typeof updater === 'function' ? updater(state.pinned) : updater,
        })),
}))

export function usePinned() {
    const pinned = usePinnedStore((s) => s.pinned)
    const setPinned_ = usePinnedStore((s) => s.setPinned)

    useEffect(() => {
        if (!isTauri()) {
            return
        }
        let unlisten: () => void | undefined
        events.pinnedFromTrayEvent
            .listen((event) => {
                setPinned_(event.payload.pinned)
            })
            .then((unlistenFn) => {
                unlisten = unlistenFn
            })
        return () => {
            unlisten?.()
        }
    }, [setPinned_])

    const setPinned = useCallback(
        (cb: (p: boolean) => boolean) => {
            setPinned_((prev) => {
                const next = cb(prev)
                if (!isTauri()) {
                    return next
                }
                events.pinnedFromWindowEvent.emit({ pinned: next })
                return next
            })
        },
        [setPinned_]
    )

    return { pinned, setPinned }
}
