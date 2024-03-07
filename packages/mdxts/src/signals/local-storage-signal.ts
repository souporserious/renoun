import { signal, effect } from '@preact/signals-core'

export function localStorageSignal(key: string, defaultValue?: string) {
  const state = signal(defaultValue)
  const savedState = localStorage.getItem(key)

  if (savedState) {
    state.value = savedState
  }

  const cleanup = effect(() => {
    const currentState = state.value
    const savedState = localStorage.getItem(key)
    if (currentState && currentState !== savedState) {
      localStorage.setItem(key, currentState)
    }
  })

  function handleStorage(event: StorageEvent) {
    if (
      event.storageArea === localStorage &&
      event.key === key &&
      event.newValue !== null
    ) {
      state.value = event.newValue
    }
  }

  window.addEventListener('storage', handleStorage)

  Object.assign(state, {
    cleanup: () => {
      cleanup()
      window.removeEventListener('storage', handleStorage)
    },
  })

  return state as typeof state & { cleanup: () => void }
}
