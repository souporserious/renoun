import React, { Fragment } from 'react'
import { AsyncLocalStorage } from 'node:async_hooks'

const contexts = new Map<any, any>()

/** Creates a context value provider with an initial value. */
export function createContext<Value>(initialValue: Value) {
  const localStorage = new AsyncLocalStorage()

  function Restore({ previousValue }: { previousValue?: Value }) {
    if (previousValue !== undefined) {
      localStorage.enterWith(previousValue)
    }
    return null
  }

  /** Sets the context value for its descendants. */
  function Context({
    children,
    value,
  }: {
    children: React.ReactNode
    value: Value
  }) {
    const previousValue = localStorage.getStore() as Value | undefined
    localStorage.enterWith(value)
    return (
      <Fragment>
        <Fragment>{children}</Fragment>
        <Restore previousValue={previousValue} />
      </Fragment>
    )
  }

  contexts.set(Context, { localStorage, initialValue })

  return Context
}

/** Returns the current context value. */
export function getContext<Value>(
  Context: ReturnType<typeof createContext<Value>>
) {
  const contextValue = contexts.get(Context)
  const localStorageValue = contextValue?.localStorage.getStore()
  return (localStorageValue || contextValue?.initialValue) as Value
}
