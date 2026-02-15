import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const getPortMock = vi.fn(async () => 4321)
const getIdMock = vi.fn(() => 'integration-test-server')
const serverCleanupMock = vi.fn()

const createServerMock = vi.fn(async () => ({
  getPort: getPortMock,
  getId: getIdMock,
  cleanup: serverCleanupMock,
}))

vi.mock('../project/server.ts', () => ({
  createServer: createServerMock,
}))

const prewarmRenounRpcServerCacheMock = vi.fn(async () => undefined)

vi.mock('./prewarm.ts', () => ({
  prewarmRenounRpcServerCache: prewarmRenounRpcServerCacheMock,
}))

let originalArgv: string[] = []
let originalCwd: string = process.cwd()

beforeEach(() => {
  originalArgv = process.argv.slice()
  originalCwd = process.cwd()
  vi.clearAllMocks()
  process.chdir(originalCwd)
})

afterEach(() => {
  process.argv = originalArgv
  process.chdir(originalCwd)
})

describe('renoun CLI index integration', () => {
  test('passes project tsconfig path to prewarm in watch mode', async () => {
    process.argv = ['node', 'renoun', 'watch']

    await import('./index.ts')

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(createServerMock).toHaveBeenCalledTimes(1)
    expect(prewarmRenounRpcServerCacheMock).toHaveBeenCalledTimes(1)
    expect(prewarmRenounRpcServerCacheMock).toHaveBeenCalledWith({
      projectOptions: {
        tsConfigFilePath: join(process.cwd(), 'tsconfig.json'),
      },
    })
  })
})
