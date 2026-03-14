import type { ProjectOptions as TsMorphProjectOptions } from '../utils/ts-morph.ts'

export type AnalysisOptions = Pick<
  Partial<TsMorphProjectOptions>,
  'compilerOptions' | 'tsConfigFilePath' | 'useInMemoryFileSystem'
> & {
  /** A unique identifier that scopes program and analysis caches. */
  analysisScopeId?: string
}
