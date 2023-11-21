import { signal, effect } from '@preact/signals-core'

const activeCodeComponents = signal<Set<any> | null>(null)

const areAllCodesProcessed = signal(false)

export function registerCodeComponent(id) {
  if (activeCodeComponents.value === null) {
    activeCodeComponents.value = new Set([id])
  } else {
    activeCodeComponents.value.add(id)
  }
}

export function unregisterCodeComponent(id) {
  activeCodeComponents.value.delete(id)
  if (activeCodeComponents.value.size === 0) {
    areAllCodesProcessed.value = true
  }
}

effect(() => {
  if (activeCodeComponents.value?.size === 0) {
    areAllCodesProcessed.value = true
  }
})

export function waitUntilAllCodesProcessed() {
  return new Promise((resolve) => {
    if (areAllCodesProcessed.value) {
      resolve(null)
    } else {
      const stop = effect(() => {
        if (areAllCodesProcessed.value) {
          stop()
          resolve(null)
        }
      })
    }
  })
}
