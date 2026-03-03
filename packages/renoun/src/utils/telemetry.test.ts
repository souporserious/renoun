import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  emitTelemetryCounter,
  emitTelemetryEvent,
  emitTelemetryHistogram,
  type Telemetry,
  withTelemetrySpan,
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

  test('falls back to direct execution when span hook throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fn = vi.fn(async () => 'ok')
    const telemetry: Telemetry = {
      emit() {},
      span(_name, spanFn) {
        void spanFn()
        throw new Error('span sink failed')
      },
    }

    await expect(
      withTelemetrySpan('renoun.test.span', fn, undefined, {
        telemetry,
      })
    ).resolves.toBe('ok')

    expect(fn).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  test('does not rerun void operation when span hook throws after callback', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fn = vi.fn(() => {})
    const telemetry: Telemetry = {
      emit() {},
      span(_name, spanFn) {
        spanFn()
        throw new Error('span sink failed')
      },
    }

    await expect(
      withTelemetrySpan('renoun.test.span.void', fn, undefined, {
        telemetry,
      })
    ).resolves.toBeUndefined()

    expect(fn).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  test('does not rerun operation when span hook throws after sync callback error', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const operationError = new Error('operation failed')
    const fn = vi.fn(() => {
      throw operationError
    })
    const telemetry: Telemetry = {
      emit() {},
      span(_name, spanFn) {
        try {
          spanFn()
        } catch {
          // simulate a sink throwing while handling callback failure
        }
        throw new Error('span sink failed')
      },
    }

    await expect(
      withTelemetrySpan('renoun.test.span.sync-error', fn, undefined, {
        telemetry,
      })
    ).rejects.toThrow('span sink failed')

    expect(fn).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})
