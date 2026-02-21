import {
  effect,
  setActiveSub,
  signal,
  trigger,
} from 'alien-signals'
import { normalizePathKey } from './path.ts'

type MutableSignal<Value> = {
  (): Value
  (value: Value): void
}

interface ReactiveNodeRecord {
  stop: () => void
  dirty: MutableSignal<boolean>
  dependencyKeys: string[]
}

interface PathDependencyNode {
  children: Map<string, PathDependencyNode>
  dependencyKeys: Set<string>
}

interface IndexedPathDependency {
  kind: 'file' | 'dir'
  pathKey: string
}

const DIRECTORY_SNAPSHOT_PATH_PREFIX = 'const:dir-snapshot-path:'
const DEPENDENCY_SIGNAL_SWEEP_THRESHOLD = 1_024

function createPathDependencyNode(): PathDependencyNode {
  return {
    children: new Map(),
    dependencyKeys: new Set(),
  }
}

function runUntracked<Value>(task: () => Value): Value {
  const previousSub = setActiveSub(undefined)
  try {
    return task()
  } finally {
    setActiveSub(previousSub)
  }
}

export class ReactiveDependencyGraph {
  readonly #dependencySignals = new Map<string, MutableSignal<string | undefined>>()
  readonly #dependencySignalsPendingCleanup = new Set<string>()
  readonly #nodes = new Map<string, ReactiveNodeRecord>()
  readonly #dirtyNodeKeys = new Set<string>()
  readonly #nodeKeysByDependency = new Map<string, Set<string>>()
  readonly #dependencyRefCountByKey = new Map<string, number>()
  readonly #indexedPathDependencyByKey = new Map<string, IndexedPathDependency>()
  #filePathDependencies = createPathDependencyNode()
  #directoryPathDependencies = createPathDependencyNode()

  registerNode(nodeKey: string, dependencyKeys: Iterable<string>): void {
    const previous = this.#nodes.get(nodeKey)
    const dirtySignal = previous?.dirty ?? signal(false)
    if (previous) {
      previous.stop()
      this.#detachNodeDependencies(nodeKey, previous.dependencyKeys)
    }

    const normalizedDependencyKeys = Array.from(
      new Set(Array.from(dependencyKeys).filter(Boolean))
    )

    for (const dependencyKey of normalizedDependencyKeys) {
      this.#linkNodeDependency(nodeKey, dependencyKey)
    }

    runUntracked(() => {
      dirtySignal(false)
    })
    this.#dirtyNodeKeys.delete(nodeKey)

    let isFirstRun = true
    const stop = effect(() => {
      for (const dependencyKey of normalizedDependencyKeys) {
        const dependencySignal = this.#getDependencySignal(dependencyKey)
        dependencySignal()
      }

      if (isFirstRun) {
        isFirstRun = false
        return
      }

      dirtySignal(true)
      this.#dirtyNodeKeys.add(nodeKey)
    })

    this.#nodes.set(nodeKey, {
      stop,
      dirty: dirtySignal,
      dependencyKeys: normalizedDependencyKeys,
    })
  }

  unregisterNode(nodeKey: string): void {
    this.#dirtyNodeKeys.delete(nodeKey)
    const node = this.#nodes.get(nodeKey)
    if (!node) {
      return
    }

    node.stop()
    this.#detachNodeDependencies(nodeKey, node.dependencyKeys)
    this.#nodes.delete(nodeKey)
  }

  setDependencyVersion(depKey: string, depVersion: string): void {
    const dependencySignal = this.#getDependencySignal(depKey)
    const currentVersion = runUntracked(() => dependencySignal())
    if (currentVersion === depVersion) {
      return
    }

    runUntracked(() => {
      dependencySignal(depVersion)
    })
  }

  touchDependency(depKey: string): void {
    const dependencySignal = this.#getDependencySignal(depKey)
    runUntracked(() => {
      trigger(dependencySignal)
    })
  }

  markNodeVersion(nodeKey: string, version: string): void {
    this.setDependencyVersion(this.#toNodeDependencyKey(nodeKey), version)
  }

  markNodeDirty(nodeKey: string): void {
    const node = this.#nodes.get(nodeKey)
    if (node) {
      runUntracked(() => {
        node.dirty(true)
      })
      this.#dirtyNodeKeys.add(nodeKey)
    }

    this.touchDependency(this.#toNodeDependencyKey(nodeKey))
  }

  isNodeDirty(nodeKey: string): boolean {
    const node = this.#nodes.get(nodeKey)
    if (!node) {
      return false
    }

    return runUntracked(() => node.dirty())
  }

  getDirtyNodeKeys(nodeKeyPrefix?: string): string[] {
    if (!nodeKeyPrefix) {
      return Array.from(this.#dirtyNodeKeys)
    }

    const dirtyNodeKeys: string[] = []
    for (const nodeKey of this.#dirtyNodeKeys) {
      if (nodeKey.startsWith(nodeKeyPrefix)) {
        dirtyNodeKeys.push(nodeKey)
      }
    }

    return dirtyNodeKeys
  }

  touchDependencies(
    matcher: (dependencyKey: string) => boolean
  ): number {
    const dependencyKeysToTouch = new Set<string>()
    for (const dependencyKey of this.#nodeKeysByDependency.keys()) {
      if (!matcher(dependencyKey)) {
        continue
      }
      dependencyKeysToTouch.add(dependencyKey)
    }

    for (const dependencyKey of dependencyKeysToTouch) {
      this.touchDependency(dependencyKey)
    }

    return dependencyKeysToTouch.size
  }

  touchPathDependencies(pathKey: string): string[] {
    const normalizedPath = normalizePathKey(pathKey)
    const dependencyKeysToTouch =
      this.#collectMatchingPathDependencyKeys(normalizedPath)
    const affectedNodeKeys =
      this.#collectAffectedNodeKeysForDependencyKeys(dependencyKeysToTouch)

    for (const dependencyKey of dependencyKeysToTouch) {
      this.touchDependency(dependencyKey)
    }

    return Array.from(affectedNodeKeys)
  }

  getAffectedNodeKeysForPathDependency(pathKey: string): string[] {
    const normalizedPath = normalizePathKey(pathKey)
    const dependencyKeysToTouch =
      this.#collectMatchingPathDependencyKeys(normalizedPath)
    return Array.from(
      this.#collectAffectedNodeKeysForDependencyKeys(dependencyKeysToTouch)
    )
  }

  getPathDependencyKeys(pathKey: string): string[] {
    const normalizedPath = normalizePathKey(pathKey)
    const dependencyKeys = this.#collectMatchingPathDependencyKeys(normalizedPath)
    return Array.from(dependencyKeys).sort()
  }

  hasDependencyReferences(depKey: string): boolean {
    return this.#dependencyRefCountByKey.has(depKey)
  }

  getDependencySignalCount(): number {
    return this.#dependencySignals.size
  }

  sweepUnreferencedDependencySignals(): number {
    let removed = 0

    for (const dependencyKey of this.#dependencySignalsPendingCleanup) {
      if (this.#dependencyRefCountByKey.has(dependencyKey)) {
        continue
      }

      if (this.#dependencySignals.delete(dependencyKey)) {
        removed += 1
      }
    }

    this.#dependencySignalsPendingCleanup.clear()
    return removed
  }

  #collectAffectedNodeKeysForDependencyKeys(
    dependencyKeys: Iterable<string>
  ): Set<string> {
    const affectedNodeKeys = new Set<string>()
    const dependencyKeysToVisit = Array.from(new Set(dependencyKeys))
    const dependencyKeysVisited = new Set<string>(dependencyKeysToVisit)

    while (dependencyKeysToVisit.length > 0) {
      const dependencyKey = dependencyKeysToVisit.pop()
      if (!dependencyKey) {
        continue
      }

      const nodeKeys = this.#nodeKeysByDependency.get(dependencyKey)
      if (!nodeKeys) {
        continue
      }

      for (const nodeKey of nodeKeys) {
        if (affectedNodeKeys.has(nodeKey)) {
          continue
        }

        affectedNodeKeys.add(nodeKey)
        const nodeDependencyKey = this.#toNodeDependencyKey(nodeKey)
        if (!dependencyKeysVisited.has(nodeDependencyKey)) {
          dependencyKeysVisited.add(nodeDependencyKey)
          dependencyKeysToVisit.push(nodeDependencyKey)
        }
      }
    }

    return affectedNodeKeys
  }

  clear(): void {
    for (const node of this.#nodes.values()) {
      node.stop()
    }

    this.#nodes.clear()
    this.#dirtyNodeKeys.clear()
    this.#nodeKeysByDependency.clear()
    this.#dependencySignals.clear()
    this.#dependencySignalsPendingCleanup.clear()
    this.#dependencyRefCountByKey.clear()
    this.#indexedPathDependencyByKey.clear()
    this.#filePathDependencies = createPathDependencyNode()
    this.#directoryPathDependencies = createPathDependencyNode()
  }

  #toNodeDependencyKey(nodeKey: string): string {
    return `node:${nodeKey}`
  }

  #getDependencySignal(depKey: string): MutableSignal<string | undefined> {
    const existing = this.#dependencySignals.get(depKey)
    if (existing) {
      return existing
    }

    const created = signal<string | undefined>(undefined)
    this.#dependencySignals.set(depKey, created)
    return created
  }

  #linkNodeDependency(nodeKey: string, dependencyKey: string): void {
    const nodeKeys = this.#nodeKeysByDependency.get(dependencyKey) ?? new Set()
    if (nodeKeys.has(nodeKey)) {
      return
    }

    nodeKeys.add(nodeKey)
    this.#nodeKeysByDependency.set(dependencyKey, nodeKeys)
    this.#incrementDependencyRefCount(dependencyKey)
  }

  #detachNodeDependencies(nodeKey: string, dependencyKeys: Iterable<string>): void {
    for (const dependencyKey of dependencyKeys) {
      const nodeKeys = this.#nodeKeysByDependency.get(dependencyKey)
      if (!nodeKeys) {
        continue
      }

      if (!nodeKeys.delete(nodeKey)) {
        continue
      }

      this.#decrementDependencyRefCount(dependencyKey)
      if (nodeKeys.size === 0) {
        this.#nodeKeysByDependency.delete(dependencyKey)
      }
    }
  }

  #incrementDependencyRefCount(dependencyKey: string): void {
    const nextCount = (this.#dependencyRefCountByKey.get(dependencyKey) ?? 0) + 1
    this.#dependencyRefCountByKey.set(dependencyKey, nextCount)
    this.#dependencySignalsPendingCleanup.delete(dependencyKey)
    if (nextCount === 1) {
      this.#indexPathDependency(dependencyKey)
    }
  }

  #decrementDependencyRefCount(dependencyKey: string): void {
    const currentCount = this.#dependencyRefCountByKey.get(dependencyKey)
    if (!currentCount) {
      return
    }

    if (currentCount <= 1) {
      this.#dependencyRefCountByKey.delete(dependencyKey)
      this.#unindexPathDependency(dependencyKey)
      this.#dependencySignalsPendingCleanup.add(dependencyKey)
      if (
        this.#dependencySignalsPendingCleanup.size >=
        DEPENDENCY_SIGNAL_SWEEP_THRESHOLD
      ) {
        this.sweepUnreferencedDependencySignals()
      }
      return
    }

    this.#dependencyRefCountByKey.set(dependencyKey, currentCount - 1)
  }

  #indexPathDependency(dependencyKey: string): void {
    const parsedDependency = this.#parsePathDependency(dependencyKey)
    if (!parsedDependency) {
      return
    }

    const rootNode =
      parsedDependency.kind === 'file'
        ? this.#filePathDependencies
        : this.#directoryPathDependencies

    this.#addPathDependency(rootNode, parsedDependency.pathKey, dependencyKey)
    this.#indexedPathDependencyByKey.set(dependencyKey, parsedDependency)
  }

  #unindexPathDependency(dependencyKey: string): void {
    const indexedDependency = this.#indexedPathDependencyByKey.get(dependencyKey)
    if (!indexedDependency) {
      return
    }

    const rootNode =
      indexedDependency.kind === 'file'
        ? this.#filePathDependencies
        : this.#directoryPathDependencies

    this.#removePathDependency(rootNode, indexedDependency.pathKey, dependencyKey)
    this.#indexedPathDependencyByKey.delete(dependencyKey)
  }

  #parsePathDependency(dependencyKey: string): IndexedPathDependency | undefined {
    if (dependencyKey.startsWith(DIRECTORY_SNAPSHOT_PATH_PREFIX)) {
      const dependencyPath = dependencyKey.slice(
        DIRECTORY_SNAPSHOT_PATH_PREFIX.length
      )
      const dependencyTypeIndex = dependencyPath.indexOf(':')
      if (dependencyTypeIndex === -1) {
        return undefined
      }

      const dependencyType = dependencyPath.slice(0, dependencyTypeIndex)
      if (dependencyType !== 'file' && dependencyType !== 'dir') {
        return undefined
      }

      const versionSeparatedPath = dependencyPath.slice(
        dependencyTypeIndex + 1
      )
      const versionSeparatorIndex = versionSeparatedPath.lastIndexOf(':')
      if (versionSeparatorIndex <= 0) {
        return undefined
      }

      return {
        kind: dependencyType,
        pathKey: normalizePathKey(
          versionSeparatedPath.slice(0, versionSeparatorIndex)
        ),
      }
    }

    if (dependencyKey.startsWith('file:')) {
      const pathKey = dependencyKey.slice('file:'.length)
      if (!pathKey) {
        return undefined
      }

      return {
        kind: 'file',
        pathKey: normalizePathKey(pathKey),
      }
    }

    if (dependencyKey.startsWith('dir:')) {
      const pathKey = dependencyKey.slice('dir:'.length)
      if (!pathKey) {
        return undefined
      }

      return {
        kind: 'dir',
        pathKey: normalizePathKey(pathKey),
      }
    }

    return undefined
  }

  #collectMatchingPathDependencyKeys(pathKey: string): Set<string> {
    const normalizedPath = normalizePathKey(pathKey)
    const dependencyKeysToTouch = new Set<string>()

    this.#collectExactPathDependencies(
      this.#filePathDependencies,
      normalizedPath,
      dependencyKeysToTouch
    )
    this.#collectDescendantPathDependencies(
      this.#filePathDependencies,
      normalizedPath,
      dependencyKeysToTouch
    )

    const directoryPathsToTouch = new Set<string>()
    this.#collectAncestorPaths(normalizedPath, directoryPathsToTouch)
    for (const directoryPath of directoryPathsToTouch) {
      this.#collectExactPathDependencies(
        this.#directoryPathDependencies,
        directoryPath,
        dependencyKeysToTouch
      )
    }
    this.#collectDescendantPathDependencies(
      this.#directoryPathDependencies,
      normalizedPath,
      dependencyKeysToTouch
    )

    return dependencyKeysToTouch
  }

  #addPathDependency(
    rootNode: PathDependencyNode,
    pathKey: string,
    dependencyKey: string
  ): void {
    let currentNode = rootNode
    for (const segment of this.#getPathSegments(pathKey)) {
      const nextNode = currentNode.children.get(segment)
      if (nextNode) {
        currentNode = nextNode
        continue
      }

      const createdNode = createPathDependencyNode()
      currentNode.children.set(segment, createdNode)
      currentNode = createdNode
    }

    currentNode.dependencyKeys.add(dependencyKey)
  }

  #removePathDependency(
    rootNode: PathDependencyNode,
    pathKey: string,
    dependencyKey: string
  ): void {
    const pathSegments = this.#getPathSegments(pathKey)
    const visitedNodes: PathDependencyNode[] = [rootNode]

    let currentNode = rootNode
    for (const segment of pathSegments) {
      const nextNode = currentNode.children.get(segment)
      if (!nextNode) {
        return
      }

      currentNode = nextNode
      visitedNodes.push(currentNode)
    }

    currentNode.dependencyKeys.delete(dependencyKey)

    for (let index = pathSegments.length - 1; index >= 0; index -= 1) {
      const node = visitedNodes[index + 1]
      if (node.children.size > 0 || node.dependencyKeys.size > 0) {
        break
      }
      visitedNodes[index].children.delete(pathSegments[index])
    }
  }

  #collectExactPathDependencies(
    rootNode: PathDependencyNode,
    pathKey: string,
    target: Set<string>
  ): void {
    const node = this.#getPathNode(rootNode, pathKey)
    if (!node) {
      return
    }

    for (const dependencyKey of node.dependencyKeys) {
      target.add(dependencyKey)
    }
  }

  #collectDescendantPathDependencies(
    rootNode: PathDependencyNode,
    pathKey: string,
    target: Set<string>
  ): void {
    const node = this.#getPathNode(rootNode, pathKey)
    if (!node) {
      return
    }

    const nodesToVisit = [node]
    while (nodesToVisit.length > 0) {
      const currentNode = nodesToVisit.pop()!
      for (const dependencyKey of currentNode.dependencyKeys) {
        target.add(dependencyKey)
      }
      for (const childNode of currentNode.children.values()) {
        nodesToVisit.push(childNode)
      }
    }
  }

  #collectAncestorPaths(pathKey: string, target: Set<string>): void {
    target.add('.')
    if (pathKey === '.') {
      return
    }

    let currentPath = pathKey
    while (currentPath !== '.' && currentPath !== '') {
      target.add(currentPath)
      const separatorIndex = currentPath.lastIndexOf('/')
      currentPath = separatorIndex === -1 ? '.' : currentPath.slice(0, separatorIndex)
    }
  }

  #getPathNode(
    rootNode: PathDependencyNode,
    pathKey: string
  ): PathDependencyNode | undefined {
    let currentNode: PathDependencyNode | undefined = rootNode
    for (const segment of this.#getPathSegments(pathKey)) {
      currentNode = currentNode.children.get(segment)
      if (!currentNode) {
        return undefined
      }
    }
    return currentNode
  }

  #getPathSegments(pathKey: string): string[] {
    if (pathKey === '.') {
      return []
    }

    return pathKey.split('/').filter(Boolean)
  }
}
