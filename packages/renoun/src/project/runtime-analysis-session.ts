import type { Cache } from '../file-system/Cache.ts'
import type { FileSystem } from '../file-system/FileSystem.ts'
import { FileSystemSnapshot } from '../file-system/Snapshot.ts'
import { Session } from '../file-system/Session.ts'
import { normalizePathKey } from '../utils/path.ts'
import { hashString, stableStringify } from '../utils/stable-serialization.ts'

export type RuntimeAnalysisFileSystem = FileSystem

export interface RuntimeAnalysisSession {
  session: Session
  fileSystem: RuntimeAnalysisFileSystem
}

let runtimeAnalysisFileSystem: RuntimeAnalysisFileSystem | null | undefined
let runtimeAnalysisFileSystemPromise:
  | Promise<RuntimeAnalysisFileSystem | null>
  | undefined
const runtimeAnalysisSessionByScopeKey = new Map<string, RuntimeAnalysisSession>()

function toRuntimeAnalysisScopeKey(
  fileSystem: RuntimeAnalysisFileSystem,
  scopePath?: string
): string {
  if (typeof scopePath !== 'string' || scopePath.length === 0) {
    return 'default'
  }

  return normalizePathKey(fileSystem.getAbsolutePath(scopePath))
}

function toRuntimeAnalysisSnapshotId(scopeKey: string): string {
  const descriptor = {
    version: 1,
    scopeKey,
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

export async function getRuntimeAnalysisSession(
  cache?: Cache,
  scopePath?: string
): Promise<RuntimeAnalysisSession | undefined> {
  const fileSystem = await getRuntimeAnalysisFileSystem()
  if (!fileSystem) {
    return undefined
  }

  const scopeKey = toRuntimeAnalysisScopeKey(fileSystem, scopePath)
  const existing = runtimeAnalysisSessionByScopeKey.get(scopeKey)
  if (existing) {
    return existing
  }

  const snapshot = new FileSystemSnapshot(
    fileSystem,
    toRuntimeAnalysisSnapshotId(scopeKey)
  )
  const session = Session.for(fileSystem, snapshot, cache)
  const created = {
    session,
    fileSystem,
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
    normalizedPaths.add(toRuntimeAnalysisScopeKey(fileSystem, path))
  }

  if (normalizedPaths.size === 0) {
    return []
  }

  const sessions: RuntimeAnalysisSession[] = []
  for (const [scopeKey, runtimeSession] of runtimeAnalysisSessionByScopeKey) {
    if (scopeKey === 'default') {
      sessions.push(runtimeSession)
      continue
    }

    for (const normalizedPath of normalizedPaths) {
      if (pathsIntersect(scopeKey, normalizedPath)) {
        sessions.push(runtimeSession)
        break
      }
    }
  }

  return sessions
}
