import { describe, expect, test } from 'vitest'

import { ReactiveDependencyGraph } from './reactive-dependency-graph.ts'

describe('ReactiveDependencyGraph', () => {
  test('returns indexed dependency keys for an invalidated path', () => {
    const graph = new ReactiveDependencyGraph()

    graph.registerNode('node:src:a', ['file:src/a.ts', 'dir:src'])
    graph.registerNode('node:src:b', ['file:src/nested/b.ts', 'dir:src/nested'])
    graph.registerNode('node:docs', ['file:docs/readme.md', 'dir:docs'])

    expect(graph.getPathDependencyKeys('src/a.ts')).toEqual([
      'dir:src',
      'file:src/a.ts',
    ])
    expect(graph.getPathDependencyKeys('src')).toEqual([
      'dir:src',
      'dir:src/nested',
      'file:src/a.ts',
      'file:src/nested/b.ts',
    ])
  })

  test('sweeps dependency signals when dependencies are unregistered', () => {
    const graph = new ReactiveDependencyGraph()

    expect(graph.getDependencySignalCount()).toBe(0)

    for (let index = 0; index < 25; index += 1) {
      const nodeKey = `node:cleanup:${index}`
      const dependencyKey = `file:src/${index}.ts`

      graph.registerNode(nodeKey, [dependencyKey])
      expect(graph.getDependencySignalCount()).toBe(1)

      graph.unregisterNode(nodeKey)
      expect(graph.getDependencySignalCount()).toBe(1)
      expect(graph.sweepUnreferencedDependencySignals()).toBe(1)
      expect(graph.getDependencySignalCount()).toBe(0)
      expect(graph.getPathDependencyKeys(`src/${index}.ts`)).toEqual([])
    }
  })
})
