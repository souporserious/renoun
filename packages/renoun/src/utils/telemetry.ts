import { getDebugLogger } from './debug.ts'
import { getContext } from './operation-context.ts'

export type TelemetryTags = Record<string, string>
export type TelemetryFields = Record<string, number | string | boolean>
export type TelemetryLevel = 'metrics' | 'trace'

export interface TelemetryEvent {
  name: string
  at: number
  tags?: TelemetryTags
  fields?: TelemetryFields
}

export interface Telemetry {
  enabled?(level?: TelemetryLevel): boolean
  emit(event: TelemetryEvent): void
  counter?(name: string, value?: number, tags?: TelemetryTags): void
  histogram?(name: string, value: number, tags?: TelemetryTags): void
  event?(name: string, fields?: TelemetryFields, tags?: TelemetryTags): void
  span?<Type>(
    name: string,
    fn: () => Promise<Type> | Type,
    tags?: TelemetryTags
  ): Promise<Type> | Type
}

function mergeTags(
  contextTags: TelemetryTags | undefined,
  eventTags: TelemetryTags | undefined
): TelemetryTags | undefined {
  if (!contextTags && !eventTags) {
    return undefined
  }

  return {
    ...(contextTags ?? {}),
    ...(eventTags ?? {}),
  }
}

function toTelemetryFieldValue(
  value: unknown
): number | string | boolean | undefined {
  if (
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  return undefined
}

function toTelemetryFields(
  input: Record<string, unknown> | undefined
): TelemetryFields | undefined {
  if (!input) {
    return undefined
  }

  const fields: TelemetryFields = {}
  for (const [key, value] of Object.entries(input)) {
    const fieldValue = toTelemetryFieldValue(value)
    if (fieldValue !== undefined) {
      fields[key] = fieldValue
    }
  }

  return Object.keys(fields).length > 0 ? fields : undefined
}

function emitDebugTelemetry(event: TelemetryEvent): void {
  if (!getDebugLogger().isEnabled('debug')) {
    return
  }

  getDebugLogger().debug(`telemetry:${event.name}`, () => ({
    operation: 'telemetry',
    data: {
      at: event.at,
      tags: event.tags,
      fields: event.fields,
    },
  }))
}

function createDebugTelemetrySink(): Telemetry {
  return {
    enabled(level = 'metrics') {
      if (level === 'trace') {
        return getDebugLogger().isEnabled('trace')
      }
      return getDebugLogger().isEnabled('debug')
    },
    emit(event) {
      emitDebugTelemetry(event)
    },
    counter(name, value = 1, tags) {
      emitDebugTelemetry({
        name,
        at: Date.now(),
        tags,
        fields: {
          value,
          kind: 'counter',
        },
      })
    },
    histogram(name, value, tags) {
      emitDebugTelemetry({
        name,
        at: Date.now(),
        tags,
        fields: {
          value,
          kind: 'histogram',
        },
      })
    },
    event(name, fields, tags) {
      emitDebugTelemetry({
        name,
        at: Date.now(),
        tags,
        fields,
      })
    },
  }
}

export const NoopTelemetry: Telemetry = {
  enabled() {
    return false
  },
  emit() {},
}

let globalTelemetry: Telemetry | undefined
const debugTelemetrySink = createDebugTelemetrySink()
const warnedTelemetryFailureBySink = new WeakSet<Telemetry>()

export function setGlobalTelemetry(telemetry: Telemetry | undefined): void {
  globalTelemetry = telemetry
}

export function getGlobalTelemetry(): Telemetry | undefined {
  return globalTelemetry
}

function resolveTelemetry(explicit?: Telemetry): Telemetry {
  return explicit ?? getContext()?.telemetry ?? globalTelemetry ?? debugTelemetrySink
}

function toTelemetryErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message
  }
  return String(error ?? 'unknown error')
}

function reportTelemetryFailure(
  telemetry: Telemetry,
  operation: string,
  error: unknown
): void {
  if (telemetry === debugTelemetrySink) {
    return
  }

  const errorMessage = toTelemetryErrorMessage(error)

  if (!warnedTelemetryFailureBySink.has(telemetry)) {
    warnedTelemetryFailureBySink.add(telemetry)
    try {
      console.warn(
        `[renoun] Telemetry sink failed during ${operation}. Continuing without failing the caller: ${errorMessage}`
      )
    } catch {
      // Ignore logging failures while reporting telemetry sink errors.
    }
  }

  if (!getDebugLogger().isEnabled('debug')) {
    return
  }

  try {
    getDebugLogger().debug('Telemetry sink failure', () => ({
      operation: 'telemetry',
      data: {
        telemetryOperation: operation,
        error: errorMessage,
      },
    }))
  } catch {
    // Ignore debug-logging failures while reporting telemetry sink errors.
  }
}

function isTelemetryEnabled(
  telemetry: Telemetry | undefined,
  level: TelemetryLevel = 'metrics'
): boolean {
  if (!telemetry) {
    return false
  }
  if (typeof telemetry.enabled === 'function') {
    try {
      return telemetry.enabled(level)
    } catch (error) {
      reportTelemetryFailure(telemetry, 'enabled', error)
      return false
    }
  }
  return true
}

function emitViaTelemetry(telemetry: Telemetry, event: TelemetryEvent): void {
  try {
    if (telemetry.event) {
      telemetry.event(event.name, event.fields, event.tags)
      return
    }
    telemetry.emit(event)
  } catch (error) {
    reportTelemetryFailure(telemetry, `emit(${event.name})`, error)
  }
}

export function emitTelemetryEvent(event: {
  name: string
  at?: number
  tags?: TelemetryTags
  fields?: Record<string, unknown>
  telemetry?: Telemetry
  level?: TelemetryLevel
}): void {
  const context = getContext()
  const telemetry = resolveTelemetry(event.telemetry)
  if (!isTelemetryEnabled(telemetry, event.level)) {
    return
  }

  const at = typeof event.at === 'number' ? event.at : Date.now()
  const mergedTags = mergeTags(context?.tags, event.tags)
  const telemetryEvent: TelemetryEvent = {
    name: event.name,
    at,
    tags: mergedTags,
    fields: toTelemetryFields(event.fields),
  }
  emitViaTelemetry(telemetry, telemetryEvent)
}

export function emitTelemetryCounter(options: {
  name: string
  value?: number
  tags?: TelemetryTags
  telemetry?: Telemetry
  level?: TelemetryLevel
}): void {
  const telemetry = resolveTelemetry(options.telemetry)
  if (!isTelemetryEnabled(telemetry, options.level)) {
    return
  }

  const tags = mergeTags(getContext()?.tags, options.tags)
  if (telemetry.counter) {
    try {
      telemetry.counter(options.name, options.value ?? 1, tags)
    } catch (error) {
      reportTelemetryFailure(telemetry, `counter(${options.name})`, error)
    }
    return
  }

  emitViaTelemetry(telemetry, {
    name: options.name,
    at: Date.now(),
    tags,
    fields: {
      kind: 'counter',
      value: options.value ?? 1,
    },
  })
}

export function emitTelemetryHistogram(options: {
  name: string
  value: number
  tags?: TelemetryTags
  telemetry?: Telemetry
  level?: TelemetryLevel
}): void {
  const telemetry = resolveTelemetry(options.telemetry)
  if (!isTelemetryEnabled(telemetry, options.level)) {
    return
  }

  const tags = mergeTags(getContext()?.tags, options.tags)
  if (telemetry.histogram) {
    try {
      telemetry.histogram(options.name, options.value, tags)
    } catch (error) {
      reportTelemetryFailure(telemetry, `histogram(${options.name})`, error)
    }
    return
  }

  emitViaTelemetry(telemetry, {
    name: options.name,
    at: Date.now(),
    tags,
    fields: {
      kind: 'histogram',
      value: options.value,
    },
  })
}

export async function withTelemetrySpan<Type>(
  name: string,
  fn: () => Promise<Type> | Type,
  tags?: TelemetryTags,
  options: {
    telemetry?: Telemetry
    level?: TelemetryLevel
    fieldsOnSuccess?: (value: Type) => Record<string, unknown> | undefined
  } = {}
): Promise<Type> {
  const telemetry = resolveTelemetry(options.telemetry)
  if (!isTelemetryEnabled(telemetry, options.level ?? 'metrics')) {
    return fn()
  }

  if (telemetry.span && !options.fieldsOnSuccess) {
    let spanResult: Promise<Type> | Type | undefined
    try {
      return await Promise.resolve(
        telemetry.span(
          name,
          () => {
            spanResult = fn()
            return spanResult
          },
          tags
        )
      )
    } catch (error) {
      reportTelemetryFailure(telemetry, `span(${name})`, error)
      if (spanResult !== undefined) {
        return await Promise.resolve(spanResult)
      }
      return fn()
    }
  }

  const startedAt = Date.now()
  emitTelemetryEvent({
    name: `${name}.start`,
    tags,
    at: startedAt,
    telemetry,
    level: 'trace',
  })

  try {
    const value = await fn()
    const durationMs = Date.now() - startedAt
    const successFields = toTelemetryFields(options.fieldsOnSuccess?.(value))
    emitTelemetryEvent({
      name: `${name}.end`,
      tags,
      fields: {
        durationMs,
        ...(successFields ?? {}),
      },
      telemetry,
      level: options.level ?? 'metrics',
    })
    emitTelemetryHistogram({
      name: `${name}.duration_ms`,
      value: durationMs,
      tags,
      telemetry,
      level: options.level ?? 'metrics',
    })
    return value
  } catch (error) {
    const durationMs = Date.now() - startedAt
    emitTelemetryEvent({
      name: `${name}.error`,
      tags,
      fields: {
        durationMs,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      },
      telemetry,
      level: options.level ?? 'metrics',
    })
    emitTelemetryCounter({
      name: `${name}.error_count`,
      value: 1,
      tags,
      telemetry,
      level: options.level ?? 'metrics',
    })
    throw error
  }
}
