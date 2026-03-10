import { describe, expect, test, vi } from 'vitest'

import { POST_BUILD_SCRIPT_PATHS, runPostBuildScripts } from './postbuild.ts'

describe('postbuild', () => {
  test('runs every post-build patch script in order', async () => {
    const runScript = vi.fn(async (_scriptPath: string) => undefined)

    await runPostBuildScripts({ runScript })

    expect(runScript.mock.calls).toEqual(
      POST_BUILD_SCRIPT_PATHS.map((scriptPath) => [scriptPath])
    )
  })

  test('stops after the first failed post-build patch script', async () => {
    const runScript = vi
      .fn<(scriptPath: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('boom'))

    await expect(runPostBuildScripts({ runScript })).rejects.toThrow('boom')
    expect(runScript).toHaveBeenCalledTimes(1)
    expect(runScript).toHaveBeenCalledWith(POST_BUILD_SCRIPT_PATHS[0])
  })
})
