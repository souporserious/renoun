'use client'
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { effect, type Signal } from '@preact/signals-core'

const Empty = [] as const

export function useSignalValue<Value>(signal: Signal<Value>) {
  const getSnapshot = useMemo(() => () => signal.value, Empty)
  const subscribe = useCallback((onStoreChange: () => void) => {
    const unsubscribe = effect(onStoreChange)
    return () => unsubscribe()
  }, Empty)
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
