import { afterEach, describe, expect, test } from 'vitest'

import { captureProcessEnv, restoreProcessEnv } from '../utils/test-process-env.ts'
import { WebSocketClient } from './rpc/client.ts'
import type { RefreshInvalidationsSinceResponse } from './refresh-notifications.ts'
import { createServer } from './server.ts'

const originalEnvironment = captureProcessEnv([
  'RENOUN_SERVER_PORT',
  'RENOUN_SERVER_ID',
  'RENOUN_SERVER_REFRESH_NOTIFICATIONS',
])

describe('project server refresh invalidations', () => {
  let client: WebSocketClient | undefined
  let server: Awaited<ReturnType<typeof createServer>> | undefined

  afterEach(() => {
    client?.close()
    server?.cleanup()
    client = undefined
    server = undefined

    restoreProcessEnv(originalEnvironment)
  })

  test('forces full refresh when requested cursor is ahead of the server cursor', async () => {
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'

    server = await createServer()
    client = new WebSocketClient(server.getId())
    await client.ready(2_000)

    const response = await client.callMethod<
      { sinceCursor: number },
      RefreshInvalidationsSinceResponse
    >('getRefreshInvalidationsSince', {
      sinceCursor: 5,
    })

    expect(response.fullRefresh).toBe(true)
    expect(response.nextCursor).toBe(0)
    expect(response.filePaths?.length).toBe(1)
    expect(response.filePath).toBe(response.filePaths?.[0])
  })
})
