import { useCallback, useEffect } from 'react'
import { create } from 'zustand'
import { events } from '../bindings'

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
                events.pinnedFromWindowEvent.emit({ pinned: next })
                return next
            })
        },
        [setPinned_]
    )

    return { pinned, setPinned }
}
