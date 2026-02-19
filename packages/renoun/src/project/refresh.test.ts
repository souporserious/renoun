import { describe, expect, test, vi } from 'vitest'

import {
  activeRefreshingProjects,
  completeRefreshingProjects,
  startRefreshingProjects,
  waitForRefreshingProjects,
} from './refresh.ts'

describe('refresh waiter', () => {
  test('resolves many concurrent waiters without warning emissions', async () => {
    const emitWarningSpy = vi.spyOn(process, 'emitWarning').mockImplementation(
      () => {}
    )
    const previousActiveProjects = [...activeRefreshingProjects]

    activeRefreshingProjects.clear()
    startRefreshingProjects()

    try {
      const waits = Array.from({ length: 50 }, () =>
        waitForRefreshingProjects()
      )

      completeRefreshingProjects()

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
      expect(await waitForRefreshingProjects()).toBe(false)
    } finally {
      for (const activeProject of previousActiveProjects) {
        activeRefreshingProjects.add(activeProject)
      }

      emitWarningSpy.mockRestore()
    }
  })
})
