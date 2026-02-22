import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  emitTelemetryCounter,
  emitTelemetryEvent,
  emitTelemetryHistogram,
  type Telemetry,
} from './telemetry.ts'

describe('telemetry', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('does not throw when event emission fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const telemetry: Telemetry = {
      emit() {},
      event() {
        throw new Error('event sink failed')
      },
    }

    expect(() => {
      emitTelemetryEvent({
        name: 'renoun.test.event',
        telemetry,
      })
    }).not.toThrow()

    expect(() => {
      emitTelemetryEvent({
        name: 'renoun.test.event',
        telemetry,
      })
    }).not.toThrow()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  test('does not throw when counter emission fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const telemetry: Telemetry = {
      emit() {},
      counter() {
        throw new Error('counter sink failed')
      },
    }

    expect(() => {
      emitTelemetryCounter({
        name: 'renoun.test.counter',
        telemetry,
      })
    }).not.toThrow()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  test('does not throw when histogram emission fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const telemetry: Telemetry = {
      emit() {},
      histogram() {
        throw new Error('histogram sink failed')
      },
    }

    expect(() => {
      emitTelemetryHistogram({
        name: 'renoun.test.histogram',
        value: 1,
        telemetry,
      })
    }).not.toThrow()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  test('treats throwing enabled hook as disabled telemetry', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const emitSpy = vi.fn()
    const telemetry: Telemetry = {
      emit: emitSpy,
      enabled() {
        throw new Error('enabled failed')
      },
    }

    expect(() => {
      emitTelemetryEvent({
        name: 'renoun.test.enabled',
        telemetry,
      })
    }).not.toThrow()
    expect(emitSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})
