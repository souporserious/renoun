import type { SyntaxKind } from '../utils/ts-morph.ts'

import type { ConfigurationOptions } from '../components/Config/types.ts'
import {
  createHighlighter,
  type Highlighter,
} from '../utils/create-highlighter.ts'
import { TokenMetadata, FontStyle } from '../utils/textmate.ts'
import type {
  ModuleExport,
  getFileExportMetadata as baseGetFileExportMetadata,
} from '../utils/get-file-exports.ts'
import type { GetTokensOptions, TokenizedLines } from '../utils/get-tokens.ts'
import type {
  GetSourceTextMetadataOptions,
  SourceTextMetadata,
} from '../utils/get-source-text-metadata.ts'
import type { OutlineRange } from '../utils/get-outline-ranges.ts'
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

interface StreamInitialMessage {
  type: 'init'
  colorMap: string[]
  baseColor?: string
  theme: string
}

interface StreamStateMessage {
  type: 'state'
  state: any
}

type StreamMessage =
  | StreamInitialMessage
  | StreamStateMessage
  | Uint32Array
  | any[]

function decodeBinaryChunk(
  chunk: Uint32Array,
  lines: string[],
  startLine: number,
  colorMap: string[],
  baseColor?: string
): { tokens: TokenizedLines; nextLine: number } {
  let position = 0
  let lineIndex = startLine
  const decoded: TokenizedLines = []

  while (position < chunk.length) {
    const count = chunk[position++] ?? 0
    const endPosition = position + count
    // Use subarray() instead of slice() to avoid copying
    const lineTokenData = chunk.subarray(position, endPosition)
    position = endPosition

    const lineText = lines[lineIndex] ?? ''
    const lineTokens: any[] = []

    for (let index = 0; index < lineTokenData.length; index += 2) {
      const start = lineTokenData[index]
      const metadata = lineTokenData[index + 1]
      const end =
        index + 2 < lineTokenData.length
          ? lineTokenData[index + 2]
          : lineText.length

      // Use TokenMetadata decoder instead of manual bit math
      const colorId = TokenMetadata.getForegroundId(metadata)
      const color = colorMap[colorId] || ''
      const fontFlags = TokenMetadata.getFontStyle(metadata)

      const fontStyle = fontFlags & FontStyle.Italic ? 'italic' : ''
      const fontWeight = fontFlags & FontStyle.Bold ? 'bold' : ''
      let textDecoration = ''
      if (fontFlags & FontStyle.Underline) textDecoration = 'underline'
      if (fontFlags & FontStyle.Strikethrough) {
        textDecoration = textDecoration
          ? `${textDecoration} line-through`
          : 'line-through'
      }

      const isBaseColor =
        !color ||
        (baseColor && color.toLowerCase?.() === baseColor.toLowerCase?.())

      const style: Record<string, string> = {}
      if (color && !isBaseColor) style['color'] = color
      if (fontStyle) style['fontStyle'] = fontStyle
      if (fontWeight) style['fontWeight'] = fontWeight
      if (textDecoration) style['textDecoration'] = textDecoration

      lineTokens.push({
        value: lineText.slice(start, end),
        start,
        end,
        hasTextStyles: !!fontFlags,
        isBaseColor,
        isWhiteSpace: /^\s*$/.test(lineText.slice(start, end)),
        isDeprecated: false,
        isSymbol: false,
        style,
      })
    }

    decoded.push(lineTokens)
    lineIndex++
  }

  return { tokens: decoded, nextLine: lineIndex }
}

/**
 * Stream tokens as binary chunks (Uint32Array) over RPC.
 */
export async function* streamTokens(
  options: Omit<GetTokensOptions, 'highlighter' | 'project'> & {
    languages?: ConfigurationOptions['languages']
    projectOptions?: ProjectOptions
  }
): AsyncGenerator<TokenizedLines> {
  const client = getClient()
  const lines = (options.value || '').split(/\r?\n/)
  if (!client) {
    // Fallback to single-shot tokenization locally.
    yield await getTokens(options)
    return
  }

  let colorMap: string[] = []
  let baseColor: string | undefined
  let lineIndex = 0

  for await (const rawMessage of client.callStream<
    Parameters<typeof getTokens>[0],
    StreamMessage
  >('getTokens', { ...options, stream: true } as any)) {
    if (Array.isArray(rawMessage)) {
      const chunk = Uint32Array.from(rawMessage)
      const { tokens, nextLine } = decodeBinaryChunk(
        chunk,
        lines,
        lineIndex,
        colorMap,
        baseColor
      )
      lineIndex = nextLine
      yield tokens
      continue
    }

    if (rawMessage instanceof Uint32Array) {
      const { tokens, nextLine } = decodeBinaryChunk(
        rawMessage,
        lines,
        lineIndex,
        colorMap,
        baseColor
      )
      lineIndex = nextLine
      yield tokens
      continue
    }

    if (rawMessage && typeof rawMessage === 'object') {
      if (rawMessage.type === 'init') {
        const init = rawMessage as StreamInitialMessage
        colorMap = init.colorMap || []
        baseColor = init.baseColor
      }
      // state frames are currently ignored client-side, but kept for future resume support
      continue
    }
  }
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
 * Get outlining ranges for a file.
 * @internal
 */
export async function getOutlineRanges(
  filePath: string,
  projectOptions?: ProjectOptions
): Promise<OutlineRange[]> {
  const client = getClient()
  if (client) {
    return client.callMethod<
      { filePath: string; projectOptions?: ProjectOptions },
      OutlineRange[]
    >('getOutlineRanges', { filePath, projectOptions })
  }

  return import('../utils/get-outline-ranges.ts').then(
    ({ getOutlineRanges }) => {
      const project = getProject(projectOptions)
      return getOutlineRanges(filePath, project)
    }
  )
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
