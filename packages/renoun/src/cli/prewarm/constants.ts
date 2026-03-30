import { PROCESS_ENV_KEYS } from '../../utils/env-keys.ts'

export const PREWARM_WORKER_PAYLOAD_ENV_KEY =
  PROCESS_ENV_KEYS.renounPrewarmWorkerPayload
export const PREWARM_WORKER_NICENESS = 10
export const PREWARM_REQUEST_TIMEOUT_MS = 60_000
export const BUILD_PREWARM_REQUEST_TIMEOUT_MS = 5 * 60_000
