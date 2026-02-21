import { getDebugLogger } from './debug.ts'
import { getContext } from './operation-context.ts'

export interface TelemetryEvent {
  name: string
  at: number
  tags?: Record<string, string>
  fields?: Record<string, number | string | boolean>
}

export interface Telemetry {
  emit(event: TelemetryEvent): void
  span?<Type>(
    name: string,
    fn: () => Promise<Type> | Type,
    tags?: Record<string, string>
  ): Promise<Type> | Type
}

function mergeTags(
  contextTags: Record<string, string> | undefined,
  eventTags: Record<string, string> | undefined
): Record<string, string> | undefined {
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
): Record<string, number | string | boolean> | undefined {
  if (!input) {
    return undefined
  }

  const fields: Record<string, number | string | boolean> = {}
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

export function emitTelemetryEvent(event: {
  name: string
  at?: number
  tags?: Record<string, string>
  fields?: Record<string, unknown>
}): void {
  const context = getContext()
  const at = typeof event.at === 'number' ? event.at : Date.now()
  const mergedTags = mergeTags(context?.tags, event.tags)
  const telemetryEvent: TelemetryEvent = {
    name: event.name,
    at,
    tags: mergedTags,
    fields: toTelemetryFields(event.fields),
  }

  if (context?.telemetry) {
    context.telemetry.emit(telemetryEvent)
    return
  }

  emitDebugTelemetry(telemetryEvent)
}

export async function withTelemetrySpan<Type>(
  name: string,
  fn: () => Promise<Type> | Type,
  tags?: Record<string, string>
): Promise<Type> {
  const context = getContext()

  if (context?.telemetry?.span) {
    return Promise.resolve(context.telemetry.span(name, fn, tags))
  }

  const startedAt = Date.now()
  emitTelemetryEvent({ name: `${name}.start`, tags, at: startedAt })

  try {
    const value = await fn()
    emitTelemetryEvent({
      name: `${name}.end`,
      tags,
      fields: {
        durationMs: Date.now() - startedAt,
      },
    })
    return value
  } catch (error) {
    emitTelemetryEvent({
      name: `${name}.error`,
      tags,
      fields: {
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      },
    })
    throw error
  }
}
