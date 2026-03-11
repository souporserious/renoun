import { Cache } from '../file-system/Cache.ts'
import type { FileSystem } from '../file-system/FileSystem.ts'
import {
  FileSystemSnapshot,
  type SnapshotContentIdOptions,
} from '../file-system/Snapshot.ts'
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
  override contentId(
    path: string,
    options: SnapshotContentIdOptions = {}
  ): Promise<string> {
    return super.contentId(path, {
      ...options,
      strictHermetic: options.strictHermetic ?? false,
    })
  }
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
    return existing
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

  return created
}

export async function getRuntimeAnalysisSessions(
  paths?: Iterable<string>
): Promise<RuntimeAnalysisSession[]> {
  const fileSystem = await getRuntimeAnalysisFileSystem()
  if (!fileSystem) {
    return []
  }

  if (!paths) {
    return Array.from(runtimeAnalysisSessionByScopeKey.values())
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
  for (const runtimeSession of runtimeAnalysisSessionByScopeKey.values()) {
    for (const normalizedPath of normalizedPaths) {
      if (pathsIntersect(runtimeSession.scopePathKey, normalizedPath)) {
        sessions.push(runtimeSession)
        break
      }
    }
  }

  return sessions
}

export function resetRuntimeAnalysisSessionsForTests(): void {
  for (const runtimeSession of runtimeAnalysisSessionByScopeKey.values()) {
    Session.reset(
      runtimeSession.fileSystem,
      runtimeSession.session.snapshot.id
    )
  }

  runtimeAnalysisSessionByScopeKey.clear()
  runtimeAnalysisFileSystem = undefined
  runtimeAnalysisFileSystemPromise = undefined
  runtimeAnalysisNonPersistentCache = undefined
}
