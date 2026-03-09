import { describe, expect, test, vi } from 'vitest'

import {
  activeRefreshingPrograms,
  completeRefreshingPrograms,
  startRefreshingPrograms,
  waitForRefreshingPrograms,
} from './refresh.ts'

describe('refresh waiter', () => {
  test('resolves many concurrent waiters without warning emissions', async () => {
    const emitWarningSpy = vi
      .spyOn(process, 'emitWarning')
      .mockImplementation(() => {})
    const previousActiveProjects = [...activeRefreshingPrograms]

    activeRefreshingPrograms.clear()
    startRefreshingPrograms()

    try {
      const waits = Array.from({ length: 50 }, () =>
        waitForRefreshingPrograms()
      )

      completeRefreshingPrograms()

      expect(await Promise.all(waits)).toEqual(Array(50).fill(true))
      const hasMaxListenersWarning = emitWarningSpy.mock.calls.some(
        ([warning]) =>
          typeof warning === 'string'
            ? warning.includes('MaxListenersExceededWarning')
            : warning instanceof Error
              ? warning.name === 'MaxListenersExceededWarning'
              : String(warning).includes('MaxListenersExceededWarning')
      )
      expect(hasMaxListenersWarning).toBe(false)
      expect(await waitForRefreshingPrograms()).toBe(false)
    } finally {
      for (const activeProject of previousActiveProjects) {
        activeRefreshingPrograms.add(activeProject)
      }

      emitWarningSpy.mockRestore()
    }
  })
})
