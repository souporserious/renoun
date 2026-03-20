import { Cache } from '../file-system/Cache.ts'
import type { FileSystem } from '../file-system/FileSystem.ts'
import { FileSystemSnapshot } from '../file-system/Snapshot.ts'
import { Session } from '../file-system/Session.ts'
import { isProductionEnvironment } from '../utils/env.ts'
import { normalizePathKey } from '../utils/path.ts'
import { hashString, stableStringify } from '../utils/stable-serialization.ts'

export type RuntimeAnalysisFileSystem = FileSystem

export interface RuntimeAnalysisSession {
  session: Session
  fileSystem: RuntimeAnalysisFileSystem
  scopePathKey: string
  analysisScopeId: string | null
}

let runtimeAnalysisFileSystem: RuntimeAnalysisFileSystem | null | undefined
let runtimeAnalysisFileSystemPromise:
  | Promise<RuntimeAnalysisFileSystem | null>
  | undefined
let runtimeAnalysisNonPersistentCache: Cache | undefined
const runtimeAnalysisSessionByScopeKey = new Map<string, RuntimeAnalysisSession>()
const RUNTIME_ANALYSIS_SESSION_MAX_ENTRIES = 64

function toRuntimeAnalysisScopePathKey(
  fileSystem: RuntimeAnalysisFileSystem,
  scopePath?: string
): string {
  if (typeof scopePath !== 'string' || scopePath.length === 0) {
    return 'default'
  }

  return normalizePathKey(fileSystem.getAbsolutePath(scopePath))
}

function toRuntimeAnalysisScopeKey(
  scopePathKey: string,
  analysisScopeId?: string
): string {
  if (typeof analysisScopeId === 'string' && analysisScopeId.length > 0) {
    return `${scopePathKey}#${analysisScopeId}`
  }

  return scopePathKey
}

function toRuntimeAnalysisSnapshotId(options: {
  scopePathKey: string
  analysisScopeId?: string
}): string {
  const descriptor = {
    version: 2,
    scopePathKey: options.scopePathKey,
    analysisScopeId: options.analysisScopeId ?? null,
  }
  return `runtime:${hashString(stableStringify(descriptor)).slice(0, 16)}`
}

function pathsIntersect(firstPath: string, secondPath: string): boolean {
  return (
    firstPath === secondPath ||
    firstPath.startsWith(`${secondPath}/`) ||
    secondPath.startsWith(`${firstPath}/`)
  )
}

class RuntimeAnalysisSnapshot extends FileSystemSnapshot {
}

async function getRuntimeAnalysisFileSystem(): Promise<
  RuntimeAnalysisFileSystem | undefined
> {
  if (runtimeAnalysisFileSystem !== undefined) {
    return runtimeAnalysisFileSystem ?? undefined
  }

  if (!runtimeAnalysisFileSystemPromise) {
    runtimeAnalysisFileSystemPromise = (async () => {
      try {
        const { NodeFileSystem } =
          await import('../file-system/NodeFileSystem.ts')
        return new NodeFileSystem() satisfies RuntimeAnalysisFileSystem
      } catch {
        return null
      }
    })()
  }

  runtimeAnalysisFileSystem = await runtimeAnalysisFileSystemPromise
  return runtimeAnalysisFileSystem ?? undefined
}

function getRuntimeAnalysisCache(cache?: Cache): Cache | undefined {
  if (cache) {
    return cache
  }

  if (isProductionEnvironment()) {
    return undefined
  }

  runtimeAnalysisNonPersistentCache ??= new Cache({
    persistence: undefined,
  })
  return runtimeAnalysisNonPersistentCache
}

function touchRuntimeAnalysisSession(
  scopeKey: string,
  runtimeAnalysisSession: RuntimeAnalysisSession
): RuntimeAnalysisSession {
  runtimeAnalysisSessionByScopeKey.delete(scopeKey)
  runtimeAnalysisSessionByScopeKey.set(scopeKey, runtimeAnalysisSession)
  return runtimeAnalysisSession
}

function shouldRetainRuntimeAnalysisSession(scopeKey: string): boolean {
  return scopeKey === 'default'
}

function pruneRuntimeAnalysisSessions(): void {
  if (
    runtimeAnalysisSessionByScopeKey.size <=
    RUNTIME_ANALYSIS_SESSION_MAX_ENTRIES
  ) {
    return
  }

  for (const [scopeKey, runtimeAnalysisSession] of Array.from(
    runtimeAnalysisSessionByScopeKey.entries()
  )) {
    if (
      runtimeAnalysisSessionByScopeKey.size <=
      RUNTIME_ANALYSIS_SESSION_MAX_ENTRIES
    ) {
      return
    }

    if (shouldRetainRuntimeAnalysisSession(scopeKey)) {
      continue
    }

    if (runtimeAnalysisSession.session.inflight.size > 0) {
      continue
    }

    runtimeAnalysisSessionByScopeKey.delete(scopeKey)
    Session.reset(
      runtimeAnalysisSession.fileSystem,
      runtimeAnalysisSession.session.snapshot.id
    )
  }
}

export async function getRuntimeAnalysisSession(
  cache?: Cache,
  scopePath?: string,
  analysisScopeId?: string
): Promise<RuntimeAnalysisSession | undefined> {
  const fileSystem = await getRuntimeAnalysisFileSystem()
  if (!fileSystem) {
    return undefined
  }

  const scopePathKey = toRuntimeAnalysisScopePathKey(fileSystem, scopePath)
  const scopeKey = toRuntimeAnalysisScopeKey(scopePathKey, analysisScopeId)
  const existing = runtimeAnalysisSessionByScopeKey.get(scopeKey)
  if (existing) {
    return touchRuntimeAnalysisSession(scopeKey, existing)
  }

  const runtimeAnalysisCache = getRuntimeAnalysisCache(cache)
  const snapshot = new RuntimeAnalysisSnapshot(
    fileSystem,
    toRuntimeAnalysisSnapshotId({
      scopePathKey,
      analysisScopeId,
    })
  )
  const session = Session.for(fileSystem, snapshot, runtimeAnalysisCache)
  const created = {
    session,
    fileSystem,
    scopePathKey,
    analysisScopeId: analysisScopeId ?? null,
  } satisfies RuntimeAnalysisSession
  runtimeAnalysisSessionByScopeKey.set(scopeKey, created)
  pruneRuntimeAnalysisSessions()

  return created
}

export async function getRuntimeAnalysisSessions(
  paths?: Iterable<string>
): Promise<RuntimeAnalysisSession[]> {
  const fileSystem = await getRuntimeAnalysisFileSystem()
  if (!fileSystem) {
    return []
  }

  pruneRuntimeAnalysisSessions()

  if (!paths) {
    return Array.from(runtimeAnalysisSessionByScopeKey.entries()).map(
      ([scopeKey, runtimeAnalysisSession]) =>
        touchRuntimeAnalysisSession(scopeKey, runtimeAnalysisSession)
    )
  }

  const normalizedPaths = new Set<string>()
  for (const path of paths) {
    if (typeof path !== 'string' || path.length === 0) {
      continue
    }
    normalizedPaths.add(toRuntimeAnalysisScopePathKey(fileSystem, path))
  }

  if (normalizedPaths.size === 0) {
    return []
  }

  const sessions: RuntimeAnalysisSession[] = []
  for (const [scopeKey, runtimeSession] of Array.from(
    runtimeAnalysisSessionByScopeKey.entries()
  )) {
    for (const normalizedPath of normalizedPaths) {
      if (pathsIntersect(runtimeSession.scopePathKey, normalizedPath)) {
        sessions.push(touchRuntimeAnalysisSession(scopeKey, runtimeSession))
        break
      }
    }
  }

  return sessions
}

export function resetRuntimeAnalysisSessionsForTests(): void {
  runtimeAnalysisSessionByScopeKey.clear()
  runtimeAnalysisFileSystem = undefined
  runtimeAnalysisFileSystemPromise = undefined
  runtimeAnalysisNonPersistentCache = undefined
}
