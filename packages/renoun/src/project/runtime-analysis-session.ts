import type { Cache } from '../file-system/Cache.ts'
import type { FileSystem } from '../file-system/FileSystem.ts'
import { Session } from '../file-system/Session.ts'

export type RuntimeAnalysisFileSystem = FileSystem

export interface RuntimeAnalysisSession {
  session: Session
  fileSystem: RuntimeAnalysisFileSystem
}

let runtimeAnalysisFileSystem: RuntimeAnalysisFileSystem | null | undefined
let runtimeAnalysisFileSystemPromise:
  | Promise<RuntimeAnalysisFileSystem | null>
  | undefined

async function getRuntimeAnalysisFileSystem(): Promise<
  RuntimeAnalysisFileSystem | undefined
> {
  if (runtimeAnalysisFileSystem !== undefined) {
    return runtimeAnalysisFileSystem ?? undefined
  }

  if (!runtimeAnalysisFileSystemPromise) {
    runtimeAnalysisFileSystemPromise = (async () => {
      try {
        const { NodeFileSystem } = await import('../file-system/NodeFileSystem.ts')
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
  cache?: Cache
): Promise<RuntimeAnalysisSession | undefined> {
  const fileSystem = await getRuntimeAnalysisFileSystem()
  if (!fileSystem) {
    return undefined
  }

  return {
    session: Session.for(fileSystem, undefined, cache),
    fileSystem,
  }
}
