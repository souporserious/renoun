import { Worker } from 'node:worker_threads'

export type TokenizeJob = {
  scopeName: string
  sourceBuffer: ArrayBuffer
  timeLimit?: number
  theme?: unknown
  themeId?: number
}

export type TokenSegment = { start: number; end: number; scopes: string[] }

export type TokenizeResult = {
  lines?: TokenSegment[][]
  tokens?: Array<Array<{ start: number; end: number; bits: number }>>
  colorMap?: string[]
  baseColor?: string
}

const pending = new Map<
  number,
  {
    resolve: (value: TokenizeResult | void) => void
    reject: (err: unknown) => void
  }
>()
let singleton: Promise<Worker> | null = null
let messageBound = false
let requestId = 0

export function getTokenizerWorker(): Promise<Worker> {
  if (!singleton) {
    singleton = new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL('./tokenize.worker.js', import.meta.url)
      )
      worker.once('online', () => resolve(worker))
      worker.once('error', reject)
    })
  }
  return singleton
}

export async function initializeWorkerGrammars(
  grammarMap: Record<string, unknown>
): Promise<void> {
  const worker = await getTokenizerWorker()
  bindWorkerHandlers(worker)
  await new Promise<void>((resolve, reject) => {
    const id = ++requestId
    pending.set(id, { resolve: () => resolve(), reject })
    worker.postMessage({ type: 'init', id, grammars: grammarMap })
  })
}

export async function runTokenizeJob(
  job: TokenizeJob
): Promise<TokenizeResult> {
  const worker = await getTokenizerWorker()
  bindWorkerHandlers(worker)
  return new Promise((resolve, reject) => {
    const id = ++requestId
    pending.set(id, {
      resolve: (value) => resolve(value as TokenizeResult),
      reject,
    })
    worker.postMessage({ type: 'tokenize', id, payload: job }, [
      job.sourceBuffer,
    ])
  })
}

function bindWorkerHandlers(worker: Worker) {
  if (messageBound) {
    return
  }

  messageBound = true

  worker.on('message', (message) => {
    const { type, id, payload, error } = message || {}
    if (typeof id !== 'number') {
      return
    }
    const entry = pending.get(id)
    if (!entry) {
      return
    }
    pending.delete(id)
    if (type === 'initialize:ok' || type === 'tokenize:ok') {
      entry.resolve(payload)
      return
    }
    if (type === 'tokenize:error' || type === 'initialize:error') {
      entry.reject(new Error(error || 'Worker error'))
      return
    }
  })

  worker.on('error', (error) => {
    for (const [, entry] of pending) {
      entry.reject(error)
    }
    pending.clear()
  })
}
