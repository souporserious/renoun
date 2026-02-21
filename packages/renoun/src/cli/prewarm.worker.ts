import { getPriority, setPriority } from 'node:os'

import type { ProjectOptions } from '../project/types.ts'
import { prewarmRenounRpcServerCache } from './prewarm.ts'

interface PrewarmWorkerPayload {
  projectOptions?: ProjectOptions
}

interface PrewarmWorkerMessage {
  type: 'started' | 'completed' | 'error'
  durationMs: number
  error?: string
  priority?: number
}

const PREWARM_WORKER_PAYLOAD_ENV_KEY = 'RENOUN_PREWARM_WORKER_PAYLOAD'
const PREWARM_WORKER_NICENESS = 10

function parsePrewarmWorkerPayloadFromEnvironment(): PrewarmWorkerPayload {
  const rawPayload = process.env[PREWARM_WORKER_PAYLOAD_ENV_KEY]
  if (!rawPayload) {
    return {}
  }

  try {
    const parsedPayload = JSON.parse(rawPayload) as PrewarmWorkerPayload
    if (!parsedPayload || typeof parsedPayload !== 'object') {
      return {}
    }

    return parsedPayload
  } catch {
    return {}
  }
}

function sendPrewarmWorkerMessage(message: PrewarmWorkerMessage): void {
  if (typeof process.send === 'function') {
    process.send(message)
  }
}

function applyPrewarmWorkerPriority(): number | undefined {
  try {
    setPriority(0, PREWARM_WORKER_NICENESS)
    return getPriority(0)
  } catch {
    return undefined
  }
}

async function runPrewarmWorker(): Promise<void> {
  const startedAt = Date.now()
  const payload = parsePrewarmWorkerPayloadFromEnvironment()
  const priority = applyPrewarmWorkerPriority()

  sendPrewarmWorkerMessage({
    type: 'started',
    durationMs: 0,
    priority,
  })

  try {
    await prewarmRenounRpcServerCache({
      projectOptions: payload.projectOptions,
    })
    sendPrewarmWorkerMessage({
      type: 'completed',
      durationMs: Date.now() - startedAt,
      priority,
    })
    process.exit(0)
  } catch (error) {
    sendPrewarmWorkerMessage({
      type: 'error',
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      priority,
    })
    process.exit(1)
  }
}

void runPrewarmWorker()
