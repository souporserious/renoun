import type { SyntaxKind } from '../utils/ts-morph.ts'

import type { ConfigurationOptions } from '../components/Config/types.ts'
import {
  createHighlighter,
  type Highlighter,
} from '../utils/create-highlighter.ts'
import type {
  ModuleExport,
  getFileExportMetadata as baseGetFileExportMetadata,
} from '../utils/get-file-exports.ts'
import type { GetTokensOptions, TokenizedLines } from '../utils/get-tokens.ts'
import type {
  GetSourceTextMetadataOptions,
  SourceTextMetadata,
} from '../utils/get-source-text-metadata.ts'
import type { FileRegion } from '../utils/get-file-regions.ts'
import type { Kind, TypeFilter } from '../utils/resolve-type.ts'
import type { resolveTypeAtLocation as baseResolveTypeAtLocation } from '../utils/resolve-type-at-location.ts'
import type { DistributiveOmit } from '../types.ts'
import { WebSocketClient } from './rpc/client.ts'
import { getProject } from './get-project.ts'
import type { ProjectOptions } from './types.ts'

let client: WebSocketClient | undefined

function getClient(): WebSocketClient | undefined {
  if (!client && process.env.RENOUN_SERVER_PORT) {
    client = new WebSocketClient(process.env.RENOUN_SERVER_ID!)
  }
  return client
}

/**
 * Parses and normalizes source text metadata. This also optionally formats the
 * source text using the project's installed formatter.
 * @internal
 */
export async function getSourceTextMetadata(
  options: DistributiveOmit<GetSourceTextMetadataOptions, 'project'> & {
    projectOptions?: ProjectOptions
  }
): Promise<SourceTextMetadata> {
  const client = getClient()
  if (client) {
    return client.callMethod<
      DistributiveOmit<GetSourceTextMetadataOptions, 'project'> & {
        projectOptions?: ProjectOptions
      },
      SourceTextMetadata
    >('getSourceTextMetadata', options)
  }

  /* Switch to synchronous analysis when building for production to prevent timeouts. */
  const { projectOptions, ...getSourceTextMetadataOptions } = options
  const project = getProject(projectOptions)

  return import('../utils/get-source-text-metadata.ts').then(
    ({ getSourceTextMetadata }) => {
      return getSourceTextMetadata({
        ...getSourceTextMetadataOptions,
        project,
      })
    }
  )
}

let currentHighlighter: { current: Highlighter | null } = { current: null }
let highlighterPromise: Promise<void> | null = null

/** Wait for the highlighter to be loaded. */
function untilHighlighterLoaded(
  options: Partial<Pick<ConfigurationOptions, 'theme' | 'languages'>>
): Promise<void> {
  if (highlighterPromise) {
    return highlighterPromise
  }

  highlighterPromise = createHighlighter({
    theme: options.theme,
    languages: options.languages,
  }).then((highlighter) => {
    currentHighlighter.current = highlighter
  })

  return highlighterPromise
}

/**
 * Tokenize source text based on a language and return highlighted tokens.
 * @internal
 */
export async function getTokens(
  options: Omit<GetTokensOptions, 'highlighter' | 'project'> & {
    languages?: ConfigurationOptions['languages']
    projectOptions?: ProjectOptions
  }
): Promise<TokenizedLines> {
  const client = getClient()
  if (client) {
    return client.callMethod<
      Omit<GetTokensOptions, 'highlighter' | 'project'> & {
        projectOptions?: ProjectOptions
      },
      TokenizedLines
    >('getTokens', options)
  }

  const { projectOptions, languages, ...getTokensOptions } = options
  const project = getProject(projectOptions)
  await untilHighlighterLoaded({
    theme: getTokensOptions.theme,
    languages,
  })

  return import('../utils/get-tokens.ts').then(({ getTokens }) => {
    if (currentHighlighter.current === null) {
      throw new Error('[renoun] Highlighter is not initialized in "getTokens"')
    }

    return getTokens({
      ...getTokensOptions,
      highlighter: currentHighlighter.current,
      project,
    })
  })
}

/**
 * Resolve the type of an expression at a specific location.
 * @internal
 */
export async function resolveTypeAtLocation(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  filter?: TypeFilter,
  projectOptions?: ProjectOptions
): Promise<Kind | undefined> {
  const client = getClient()
  if (client) {
    return client.callMethod<
      {
        filePath: string
        position: number
        kind: SyntaxKind
        filter?: string
        projectOptions?: ProjectOptions
      },
      ReturnType<typeof baseResolveTypeAtLocation>
    >('resolveTypeAtLocation', {
      filePath,
      position,
      kind,
      filter: filter ? JSON.stringify(filter) : undefined,
      projectOptions,
    })
  }

  return import('../utils/resolve-type-at-location.ts').then(
    async ({ resolveTypeAtLocation }) => {
      const project = getProject(projectOptions)

      return resolveTypeAtLocation(
        project,
        filePath,
        position,
        kind,
        filter,
        projectOptions?.useInMemoryFileSystem
      )
    }
  )
}

const fileExportsCache = new Map<string, ModuleExport[]>()

/**
 * Get the exports of a file.
 * @internal
 */
export async function getFileExports(
  filePath: string,
  projectOptions?: ProjectOptions
) {
  let cacheKey: string

  if (process.env.NODE_ENV === 'production') {
    cacheKey = filePath + getProjectOptionsCacheKey(projectOptions)
    if (fileExportsCache.has(cacheKey)) {
      return fileExportsCache.get(cacheKey)!
    }
  }

  const client = getClient()
  if (client) {
    const fileExports = await client.callMethod<
      {
        filePath: string
        projectOptions?: ProjectOptions
      },
      ModuleExport[]
    >('getFileExports', {
      filePath,
      projectOptions,
    })

    if (process.env.NODE_ENV === 'production') {
      fileExportsCache.set(cacheKey!, fileExports)
    }

    return fileExports
  }

  return import('../utils/get-file-exports.ts').then(({ getFileExports }) => {
    const project = getProject(projectOptions)
    const fileExports = getFileExports(filePath, project)

    if (process.env.NODE_ENV === 'production') {
      fileExportsCache.set(cacheKey, fileExports)
    }

    return fileExports
  })
}

/**
 * Get the `//#region` spans for a file.
 * @internal
 */
export async function getFileRegions(
  filePath: string,
  projectOptions?: ProjectOptions
): Promise<FileRegion[]> {
  const client = getClient()
  if (client) {
    return client.callMethod<
      { filePath: string; projectOptions?: ProjectOptions },
      FileRegion[]
    >('getFileRegions', { filePath, projectOptions })
  }

  return import('../utils/get-file-regions.ts').then(({ getFileRegions }) => {
    const project = getProject(projectOptions)
    return getFileRegions(filePath, project)
  })
}

/**
 * Get a specific file export in a source file.
 * @internal
 */
export async function getFileExportMetadata(
  name: string,
  filePath: string,
  position: number,
  kind: SyntaxKind,
  projectOptions?: ProjectOptions
) {
  const client = getClient()
  if (client) {
    return client.callMethod<
      {
        name: string
        filePath: string
        position: number
        kind: SyntaxKind
        projectOptions?: ProjectOptions
      },
      Awaited<ReturnType<typeof baseGetFileExportMetadata>>
    >('getFileExportMetadata', {
      name,
      filePath,
      position,
      kind,
      projectOptions,
    })
  }

  return import('../utils/get-file-exports.ts').then(
    ({ getFileExportMetadata }) => {
      const project = getProject(projectOptions)
      return getFileExportMetadata(name, filePath, position, kind, project)
    }
  )
}

/**
 * Attempt to get a statically analyzable literal value for a file export.
 * @internal
 */
export async function getFileExportStaticValue(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  projectOptions?: ProjectOptions
) {
  const client = getClient()
  if (client) {
    return client.callMethod<
      {
        filePath: string
        position: number
        kind: SyntaxKind
        projectOptions?: ProjectOptions
      },
      unknown
    >('getFileExportStaticValue', {
      filePath,
      position,
      kind,
      projectOptions,
    })
  }

  return import('../utils/get-file-export-static-value.ts').then(
    ({ getFileExportStaticValue }) => {
      const project = getProject(projectOptions)
      return getFileExportStaticValue(filePath, position, kind, project)
    }
  )
}

/**
 * Get a specific file export's text by identifier, optionally including its dependencies.
 * @internal
 */
export async function getFileExportText(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  includeDependencies?: boolean,
  projectOptions?: ProjectOptions
) {
  const client = getClient()
  if (client) {
    return client.callMethod<
      {
        filePath: string
        position: number
        kind: SyntaxKind
        includeDependencies?: boolean
        projectOptions?: ProjectOptions
      },
      string
    >('getFileExportText', {
      filePath,
      position,
      kind,
      includeDependencies,
      projectOptions,
    })
  }

  return import('../utils/get-file-export-text.ts').then(
    ({ getFileExportText }) => {
      const project = getProject(projectOptions)
      return getFileExportText({
        filePath,
        position,
        kind,
        includeDependencies,
        project,
      })
    }
  )
}

/**
 * Create a source file in the project.
 * @internal
 */
export async function createSourceFile(
  filePath: string,
  sourceText: string,
  projectOptions?: ProjectOptions
) {
  const client = getClient()
  if (client) {
    return client.callMethod<
      {
        filePath: string
        sourceText: string
        projectOptions?: ProjectOptions
      },
      void
    >('createSourceFile', {
      filePath,
      sourceText,
      projectOptions,
    })
  }

  const project = getProject(projectOptions)
  project.createSourceFile(filePath, sourceText, { overwrite: true })
}

/**
 * Transpile a source file.
 * @internal
 */
export async function transpileSourceFile(
  filePath: string,
  projectOptions?: ProjectOptions
) {
  const client = getClient()
  if (client) {
    return client.callMethod<
      {
        filePath: string
        projectOptions?: ProjectOptions
      },
      string
    >('transpileSourceFile', {
      filePath,
      projectOptions,
    })
  }

  const project = getProject(projectOptions)

  return import('../utils/transpile-source-file.ts').then(
    ({ transpileSourceFile }) => {
      return transpileSourceFile(filePath, project)
    }
  )
}

/**
 * Generate a cache key for a project's options.
 * @internal
 */
export function getProjectOptionsCacheKey(options?: ProjectOptions): string {
  if (!options) {
    return ''
  }

  let key = ''

  if (options.theme) {
    key += `t:${options.theme};`
  }
  if (options.siteUrl) {
    key += `u:${options.siteUrl};`
  }
  if (options.gitSource) {
    key += `s:${options.gitSource};`
  }
  if (options.gitBranch) {
    key += `b:${options.gitBranch};`
  }
  if (options.gitHost) {
    key += `h:${options.gitHost};`
  }
  if (options.projectId) {
    key += `i:${options.projectId};`
  }
  if (options.tsConfigFilePath) {
    key += `f:${options.tsConfigFilePath};`
  }

  key += `m:${options.useInMemoryFileSystem ? 1 : 0};`

  if (options.compilerOptions) {
    key += 'c:'
    for (const k in options.compilerOptions) {
      const value = options.compilerOptions[k]
      key += `${k}=${value};`
    }
  }

  return key
}
