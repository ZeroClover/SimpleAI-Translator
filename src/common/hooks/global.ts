import { createGlobalState } from 'react-hooks-global-state'

const initialState = {
    pinned: false,
}

export const { useGlobalState } = createGlobalState(initialState)
