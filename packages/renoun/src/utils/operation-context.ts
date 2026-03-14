import { AsyncLocalStorage } from 'node:async_hooks'

import { getDebugLogger } from './debug.ts'
import { createAbortError } from './errors.ts'
import type { Telemetry } from './telemetry.ts'

export interface OperationLogger {
  error(message: string, context?: () => any): void
  warn(message: string, context?: () => any): void
  info(message: string, context?: () => any): void
  debug(message: string, context?: () => any): void
  trace(message: string, context?: () => any): void
}

export interface OperationContext {
  signal?: AbortSignal
  operation?: string
  tags?: Record<string, string>
  telemetry?: Telemetry
  logger?: OperationLogger
}

const operationContextStorage = new AsyncLocalStorage<OperationContext>()

function mergeContexts(
  parent: OperationContext | undefined,
  next: OperationContext
): OperationContext {
  if (!parent) {
    return next
  }

  const mergedTags =
    parent.tags || next.tags
      ? {
          ...(parent.tags ?? {}),
          ...(next.tags ?? {}),
        }
      : undefined

  return {
    ...parent,
    ...next,
    tags: mergedTags,
  }
}

export function runWithContext<Type>(
  context: OperationContext,
  fn: () => Type
): Type {
  const parent = operationContextStorage.getStore()
  const merged = mergeContexts(parent, context)
  return operationContextStorage.run(merged, fn)
}

export function getContext(): OperationContext | undefined {
  return operationContextStorage.getStore()
}

export function getOperationLogger(): OperationLogger {
  return (
    getContext()?.logger ?? (getDebugLogger() as unknown as OperationLogger)
  )
}

export function throwIfAborted(signal?: AbortSignal): void {
  const effectiveSignal = signal ?? getContext()?.signal
  if (!effectiveSignal?.aborted) {
    return
  }

  throw createAbortError(effectiveSignal.reason)
}
