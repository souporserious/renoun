import { cache } from 'react'
import { signal, effect } from '@preact/signals-core'

const activeCodeComponents = signal<null | Set<string | number>>(null)

const allCodeComponentsProcessed = signal(false)

effect(() => {
  allCodeComponentsProcessed.value = activeCodeComponents.value?.size === 0
})

export const registerCodeComponent = cache((id: string | number) => {
  if (activeCodeComponents.value === null) {
    activeCodeComponents.value = new Set([id])
  } else {
    activeCodeComponents.value.add(id)
    activeCodeComponents.value = new Set(activeCodeComponents.value)
  }

  return () => {
    activeCodeComponents.value?.delete(id)
    activeCodeComponents.value = new Set(activeCodeComponents.value)
  }
})

export const waitUntilAllCodeComponentsAdded = cache(() => {
  return new Promise((resolve) => {
    if (allCodeComponentsProcessed.value) {
      resolve(null)
    } else {
      const stop = effect(() => {
        if (allCodeComponentsProcessed.value) {
          stop()
          resolve(null)
        }
      })
    }
  })
})
