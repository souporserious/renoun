import { describe, expect, test, vi } from 'vitest'

import { POST_BUILD_STEPS, runPostBuildScripts } from './postbuild.ts'

describe('postbuild', () => {
  test('runs every post-build step in order', async () => {
    const runStep = vi.fn(async (_step: () => Promise<void>) => undefined)

    await runPostBuildScripts({ runStep })

    expect(runStep.mock.calls).toEqual(
      POST_BUILD_STEPS.map((step) => [step])
    )
  })

  test('stops after the first failed post-build step', async () => {
    const runStep = vi
      .fn<(step: () => Promise<void>) => Promise<void>>()
      .mockRejectedValueOnce(new Error('boom'))

    await expect(runPostBuildScripts({ runStep })).rejects.toThrow('boom')
    expect(runStep).toHaveBeenCalledTimes(1)
    expect(runStep).toHaveBeenCalledWith(POST_BUILD_STEPS[0])
  })
})
