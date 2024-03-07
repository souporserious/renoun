import { useState, useEffect, useRef } from 'react'

/** Use state that is persisted to localStorage. */
export function useLocalStorageState(key: string, defaultValue?: string) {
  const [state, setState] = useState(defaultValue)
  const [isHydrating, setIsHydrating] = useState(true)
  const initialRender = useRef(true)
  const ignoreUpdate = useRef(true)

  // Handle initialization and updates to localStorage
  useEffect(() => {
    const savedState = localStorage.getItem(key)
    if (initialRender.current) {
      if (savedState) {
        setState(savedState)
      }
      setIsHydrating(false)
    } else if (state && state !== savedState) {
      localStorage.setItem(key, state)
      ignoreUpdate.current = true
    }

    initialRender.current = false
  }, [state])

  // Listen for changes in localStorage from other tabs / windows
  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (
        ignoreUpdate.current === false &&
        event.storageArea === localStorage &&
        event.key === key &&
        event.newValue
      ) {
        setState(event.newValue)
      }
      ignoreUpdate.current = false
    }

    window.addEventListener('storage', handleStorageChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  return [state, setState, isHydrating] as const
}
