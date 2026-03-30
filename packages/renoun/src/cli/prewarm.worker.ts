import { getPriority, setPriority } from 'node:os'

import type { AnalysisOptions } from '../analysis/types.ts'
import type { AnalysisRpcRequestPriority } from '../analysis/request-priority.ts'
import {
  PREWARM_WORKER_NICENESS,
  PREWARM_WORKER_PAYLOAD_ENV_KEY,
} from './prewarm/constants.ts'
import { startPrewarmRenounRpcServerCache } from './prewarm.ts'

interface PrewarmWorkerPayload {
  analysisOptions?: AnalysisOptions
  requestPriority?: AnalysisRpcRequestPriority
}

interface PrewarmWorkerMessage {
  type: 'started' | 'ready' | 'completed' | 'error'
  durationMs: number
  error?: string
  priority?: number
}

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
    const handle = startPrewarmRenounRpcServerCache({
      analysisOptions: payload.analysisOptions,
      requestPriority: payload.requestPriority,
    })
    await handle.ready
    sendPrewarmWorkerMessage({
      type: 'ready',
      durationMs: Date.now() - startedAt,
      priority,
    })
    await handle.settled
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
