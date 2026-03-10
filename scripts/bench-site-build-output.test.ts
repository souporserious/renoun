import { describe, expect, test } from 'vitest'

import { createOutputParser } from './bench-site-build-output.mjs'

describe('bench site build output parser', () => {
  test('counts cache telemetry events without double-counting operation counters', () => {
    const parser = createOutputParser()

    parser.write('[renoun:DEBUG] [telemetry] telemetry:renoun.cache.operation_')
    parser.write(
      'count\n{\n  "tags": {\n    "operation": "hit"\n  },\n  "fields": {\n    "kind": "counter",\n    "value": "1"\n  }\n}\n'
    )
    parser.write('[renoun:DEBUG] [telemetry] telemetry:renoun.cache.hit\n')
    parser.write(
      '{\n  "tags": {\n    "operation": "hit"\n  },\n  "fields": {\n    "nodeKeyHash": "abc"\n  }\n}\n'
    )
    parser.write('[renoun:DEBUG] [telemetry] telemetry:renoun.cache.miss\n')
    parser.write(
      '{\n  "tags": {\n    "operation": "miss"\n  },\n  "fields": {\n    "nodeKeyHash": "def"\n  }\n}\n'
    )
    parser.write('[renoun:DEBUG] [telemetry] telemetry:renoun.cache.set\n')
    parser.write('[renoun:DEBUG] [telemetry] telemetry:renoun.cache.clear\n')
    parser.write('Compiled successfully in 3.420s\n')
    parser.write('Generating static pages (5/5) in 1.250s\n')

    expect(parser.finish()).toMatchObject({
      compileSeconds: 3.42,
      staticSeconds: 1.25,
      routeTotal: 5,
      cacheHits: 1,
      cacheMisses: 1,
      cacheSets: 1,
      cacheClears: 1,
    })
  })

  test('keeps parsing legacy cache log lines', () => {
    const parser = createOutputParser()

    parser.write('[cache] Cache hit key=docs\n')
    parser.write('[cache] Cache miss key=docs\n')
    parser.write('[cache] Cache set key=docs\n')
    parser.write('[cache] Cache clear key=docs\n')

    expect(parser.finish()).toMatchObject({
      cacheHits: 1,
      cacheMisses: 1,
      cacheSets: 1,
      cacheClears: 1,
    })
  })
})
