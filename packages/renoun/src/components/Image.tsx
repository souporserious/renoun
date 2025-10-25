import React, { cache } from 'react'

import { getConfig } from './Config/ServerConfigContext.js'
import type { NormalizedFigmaConfig } from './Config/types.js'

const FIGMA_HOST_PATTERN = /\.figma\.com$/
const FIGMA_PROTOCOL = /^figma:/i

type RemoteComponentMeta = {
  node_id: string
  name: string
  description?: string | null
  containing_frame?: { name?: string | null }
  containing_page?: { name?: string | null }
}

type ComponentMetadata = {
  nodeId: string
  name: string
  description?: string
  pageName?: string
  frameName?: string
}

const fetchFigmaImageUrl = cache(
  async (
    fileId: string,
    nodeId: string,
    queryKey: string,
    token: string
  ): Promise<string> => {
    const searchParams = new URLSearchParams(queryKey)
    const url = new URL(`https://api.figma.com/v1/images/${fileId}`)
    url.search = searchParams.toString()

    const response = await fetch(url, {
      headers: {
        'X-Figma-Token': token,
      },
    })

    if (!response.ok) {
      const hints: string[] = []
      if (response.status === 401) {
        hints.push(
          'The FIGMA_TOKEN is missing or invalid. Ensure it is set correctly.'
        )
      } else if (response.status === 403) {
        hints.push(
          'Access denied. Verify:',
          ' - Your FIGMA_TOKEN includes the scope: file_content:read',
          ' - The token owner can open the referenced file in Figma',
          ' - The file ID is correct and belongs to that account/org'
        )
      } else if (response.status === 404) {
        hints.push(
          'Not found. Double-check the file ID and node id (or selector).'
        )
      } else if (response.status === 429) {
        hints.push('Rate limit reached. Try again in a moment.')
      }
      const suffix = hints.length ? `\n${hints.join('\n')}` : ''
      throw new Error(
        `[renoun] Figma images request failed (${response.status}).${suffix}`
      )
    }

    const payload = (await response.json()) as {
      err: string | null
      images: Record<string, string | null>
    }

    if (payload.err) {
      throw new Error(
        `[renoun] Figma API responded with an error: ${payload.err}`
      )
    }

    const imageUrl = payload.images[nodeId]

    if (!imageUrl) {
      throw new Error(
        `[renoun] Figma returned no image for node ${nodeId}. Verify the node exists and is visible.`
      )
    }

    return imageUrl
  }
)

const fetchAsDataUrl = cache(
  async (
    url: string,
    format: 'png' | 'jpg' | 'svg'
  ): Promise<string | null> => {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        return null
      }
      if (format === 'svg') {
        const svgText = await response.text()
        const base64 = Buffer.from(svgText, 'utf8').toString('base64')
        return `data:image/svg+xml;base64,${base64}`
      }
      const arrayBuffer = await response.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      const mime = format === 'png' ? 'image/png' : 'image/jpeg'
      return `data:${mime};base64,${base64}`
    } catch {
      return null
    }
  }
)

const fetchFigmaComponents = cache(
  async (fileId: string, token: string): Promise<ComponentMetadata[]> => {
    const url = new URL(`https://api.figma.com/v1/files/${fileId}/components`)
    const response = await fetch(url, {
      headers: {
        'X-Figma-Token': token,
      },
    })

    if (!response.ok) {
      const hints: string[] = []
      if (response.status === 401) {
        hints.push(
          'The FIGMA_TOKEN is missing or invalid. Ensure it is set correctly.'
        )
      } else if (response.status === 403) {
        hints.push(
          'Access denied. Verify:',
          ' - Your FIGMA_TOKEN includes the scope: file_content:read',
          ' - Add library scopes if needed: library_content:read (and team_library_content:read for team libraries)',
          ' - The token owner can open the referenced file in Figma',
          ' - Add library scopes if needed: library_content:read (and team_library_content:read for team libraries)',
          ' - The token owner can open the referenced file in Figma',
          ' - The file ID is correct and belongs to that account/org'
        )
      } else if (response.status === 404) {
        hints.push('Not found. Double-check the file ID.')
      } else if (response.status === 429) {
        hints.push('Rate limit reached. Try again in a moment.')
      }
      const suffix = hints.length ? `\n${hints.join('\n')}` : ''
      throw new Error(
        `[renoun] Figma components request failed (${response.status}).${suffix}`
      )
    }

    const payload = (await response.json()) as {
      meta?: { components?: RemoteComponentMeta[] }
    }

    const components = payload.meta?.components ?? []

    return components.map((component) => ({
      nodeId: component.node_id,
      name: component.name,
      description: component.description ?? undefined,
      pageName: component.containing_page?.name ?? undefined,
      frameName: component.containing_frame?.name ?? undefined,
    }))
  }
)

type FigmaNode = {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
}

const fetchFigmaFile = cache(
  async (fileId: string, token: string): Promise<{ document: FigmaNode }> => {
    const url = new URL(`https://api.figma.com/v1/files/${fileId}`)
    const response = await fetch(url, {
      headers: {
        'X-Figma-Token': token,
      },
    })

    if (!response.ok) {
      const hints: string[] = []
      if (response.status === 401) {
        hints.push(
          'The FIGMA_TOKEN is missing or invalid. Ensure it is set correctly.'
        )
      } else if (response.status === 403) {
        hints.push(
          'Access denied. Verify:',
          ' - Your FIGMA_TOKEN includes the scope: file_content:read',
          ' - Add library scopes if needed: library_content:read (and team_library_content:read for team libraries)',
          ' - The token owner can open the referenced file in Figma',
          ' - The file ID is correct and belongs to that account/org'
        )
      } else if (response.status === 404) {
        hints.push('Not found. Double-check the file ID.')
      } else if (response.status === 429) {
        hints.push('Rate limit reached. Try again in a moment.')
      }
      const suffix = hints.length ? `\n${hints.join('\n')}` : ''
      throw new Error(
        `[renoun] Figma file request failed (${response.status}).${suffix}`
      )
    }

    const payload = (await response.json()) as { document: FigmaNode }
    return payload
  }
)

function collectComponentNodes(
  node: FigmaNode,
  path: string[] = []
): Array<{
  id: string
  name: string
  pageName?: string
  frameName?: string
  fullPath: string
}> {
  const results: Array<{
    id: string
    name: string
    pageName?: string
    frameName?: string
    fullPath: string
  }> = []

  const nextPath = [...path, node.name]
  const isComponent = node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
  if (isComponent) {
    const pageName = path.length > 0 ? path[1] : undefined // [0] is DOCUMENT
    const frameName = path.length > 2 ? path[path.length - 1] : undefined
    results.push({
      id: node.id,
      name: node.name,
      pageName,
      frameName,
      fullPath: nextPath.join('/'),
    })
  }

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      results.push(...collectComponentNodes(child, nextPath))
    }
  }

  return results
}

function decodeNodeId(nodeId: string): string {
  let decoded: string
  try {
    decoded = decodeURIComponent(nodeId.trim())
  } catch {
    decoded = nodeId.trim()
  }

  const trimmed = decoded
  if (!trimmed) {
    throw new Error('[renoun] Figma node id cannot be empty.')
  }
  if (trimmed.includes(':')) {
    return trimmed
  }
  // Only convert hyphens to colons for numeric node ids (e.g. 915-1075 → 915:1075)
  // Preserve hyphens in component names (e.g. arrow-down)
  if (/^[0-9-]+$/.test(trimmed)) {
    return trimmed.replace(/-/g, ':')
  }
  return trimmed
}

function isLikelyFileId(value: string): boolean {
  return /^[A-Za-z0-9]{10,}$/.test(value)
}

function resolveFileId(
  config: NormalizedFigmaConfig | undefined,
  alias: string | undefined,
  source: string
): string {
  if (alias) {
    const trimmedAlias = alias.trim()
    if (!trimmedAlias) {
      throw new Error(
        `[renoun] Figma source ${source} is missing a file alias before the node id.`
      )
    }
    const fromConfig = config?.files?.[trimmedAlias]
    if (fromConfig) {
      return fromConfig
    }
    if (isLikelyFileId(trimmedAlias)) {
      return trimmedAlias
    }
    throw new Error(
      `[renoun] Unknown Figma file alias "${trimmedAlias}". Configure it in <RootProvider figma={{ ${trimmedAlias}: 'FILE_ID' }}> or provide a direct file id.`
    )
  }

  if (config) {
    const { defaultFile, files } = config
    if (defaultFile && files[defaultFile]) {
      return files[defaultFile]
    }
    const aliases = Object.keys(files)
    if (aliases.length === 1) {
      return files[aliases[0]]
    }
  }

  throw new Error(
    [
      `[renoun] Unable to determine the Figma file for source "${source}" in the Image component.`,
      'Configure a file in <RootProvider figma={{ alias: "FILE_ID" }}> (and optionally set defaultFile),',
      'or include the alias in the source, e.g. figma:icons/123:456.',
      'Also verify the file ID is correct and that your FIGMA_TOKEN has access to that file.',
    ].join('\n')
  )
}

function parseFigmaProtocol(
  rawSource: string,
  config: NormalizedFigmaConfig | undefined
): { fileId: string; nodeId: string } {
  const value = rawSource.slice('figma:'.length)
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('[renoun] figma: sources must include a node id.')
  }

  const slashIndex = trimmed.indexOf('/')
  const alias = slashIndex === -1 ? undefined : trimmed.slice(0, slashIndex)
  const rawNodeId = slashIndex === -1 ? trimmed : trimmed.slice(slashIndex + 1)

  if (!rawNodeId.trim()) {
    throw new Error(
      `[renoun] figma: sources must include a node id after the alias. Received ${rawSource}.`
    )
  }

  const fileId = resolveFileId(config, alias, rawSource)
  const nodeId = decodeNodeId(rawNodeId)
  return { fileId, nodeId }
}

function parseFigmaUrl(
  source: string
): { fileId: string; nodeId: string } | null {
  let url: URL
  try {
    url = new URL(source)
  } catch {
    return null
  }

  if (!FIGMA_HOST_PATTERN.test(url.hostname.toLowerCase())) {
    return null
  }

  const nodeIdParam =
    url.searchParams.get('node-id') ?? url.searchParams.get('nodeId')

  if (!nodeIdParam) {
    return null
  }

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length === 0) {
    return null
  }

  const prefixes = new Set(['file', 'design', 'proto', 'embed'])
  let fileId: string | undefined

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    if (prefixes.has(segment) && index + 1 < segments.length) {
      fileId = segments[index + 1]
      break
    }
  }

  if (!fileId) {
    fileId = segments[0]
  }

  if (!fileId) {
    return null
  }

  return { fileId, nodeId: decodeNodeId(nodeIdParam) }
}

function isLikelyNodeId(value: string): boolean {
  return /^[0-9:]+$/.test(value)
}

function namesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function matchesSelector(
  component: ComponentMetadata,
  selector: string
): boolean {
  if (component.name === selector) {
    return true
  }

  const segments = selector.split('/').filter(Boolean)
  if (segments.length === 0) {
    return false
  }

  const componentName = segments[segments.length - 1]
  if (!namesEqual(componentName, component.name)) {
    return false
  }

  const scope = segments.slice(0, -1).join('/')
  if (!scope) {
    return false
  }

  const possibilities = new Set<string>()
  if (component.pageName) {
    possibilities.add(component.pageName)
  }
  if (component.frameName) {
    possibilities.add(component.frameName)
  }
  if (component.pageName && component.frameName) {
    possibilities.add(`${component.pageName}/${component.frameName}`)
  }

  return possibilities.has(scope)
}

async function resolveComponentBySelector(
  fileId: string,
  selector: string,
  token: string
): Promise<ComponentMetadata | null> {
  const trimmed = selector.trim()
  if (!trimmed) {
    return null
  }

  let components: ComponentMetadata[]
  try {
    components = await fetchFigmaComponents(fileId, token)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `[renoun] Error while resolving selector "${selector}" in file "${fileId}" in Image component.\n\n${
        message.includes('[renoun] ')
          ? message.slice('[renoun] '.length)
          : message
      }`
    )
  }

  const exactMatches = components.filter((component) =>
    namesEqual(component.name, trimmed)
  )

  if (exactMatches.length === 1) {
    return exactMatches[0]
  }

  if (exactMatches.length > 1) {
    throw new Error(
      `[renoun] Multiple components share the name "${trimmed}" in file ${fileId}. ` +
        'Provide the containing page or frame as part of the selector (e.g. page/component).'
    )
  }

  const scopedMatches = components.filter((component) =>
    matchesSelector(component, trimmed)
  )

  if (scopedMatches.length === 1) {
    return scopedMatches[0]
  }

  if (scopedMatches.length > 1) {
    throw new Error(
      `[renoun] The selector "${trimmed}" is ambiguous in file ${fileId}. ` +
        'Refine it by including both the page and frame names (e.g. page/frame/component).'
    )
  }

  // Fallback: crawl the file document to find components by name if the components endpoint didn't return it
  try {
    const file = await fetchFigmaFile(fileId, token)
    const nodes = collectComponentNodes(file.document)
    const fromFileExact = nodes.find((n) => namesEqual(n.name, trimmed))
    if (fromFileExact) {
      return {
        nodeId: fromFileExact.id,
        name: fromFileExact.name,
        description: undefined,
        pageName: fromFileExact.pageName,
        frameName: fromFileExact.frameName,
      }
    }

    const fromFileScoped = nodes.find((n) =>
      matchesSelector(
        {
          nodeId: n.id,
          name: n.name,
          description: undefined,
          pageName: n.pageName,
          frameName: n.frameName,
        },
        trimmed
      )
    )
    if (fromFileScoped) {
      return {
        nodeId: fromFileScoped.id,
        name: fromFileScoped.name,
        description: undefined,
        pageName: fromFileScoped.pageName,
        frameName: fromFileScoped.frameName,
      }
    }
  } catch {
    // ignore and fall through to error
  }

  // Build a small list of similar names to help debug
  const sample = components
    .map((c) => c.name)
    .filter((name, index, arr) => arr.indexOf(name) === index)
    .filter((name) => name.toLowerCase().includes(trimmed.toLowerCase()))
    .slice(0, 8)
  const suggestions =
    sample.length > 0 ? `\nSimilar components: ${sample.join(', ')}` : ''
  throw new Error(
    `[renoun] Could not find a component named "${trimmed}" in file "${fileId}".` +
      '\n- Ensure the name matches exactly (case-insensitive).\n' +
      '- If multiple components share a name, scope it with page/frame (e.g. Page/Frame/Component).' +
      suggestions
  )
}

function buildFigmaQuery(
  nodeId: string,
  options: Pick<
    FigmaImageOptions,
    'format' | 'scale' | 'background' | 'useAbsoluteBounds'
  >
): URLSearchParams {
  const params = new URLSearchParams()
  params.set('ids', nodeId)

  if (options.format) {
    params.set('format', options.format)
  }

  if (options.scale !== undefined) {
    const numericScale = Number(options.scale)
    if (!Number.isFinite(numericScale) || numericScale <= 0) {
      throw new Error('[renoun] The <Image /> scale must be a positive number.')
    }
    params.set('scale', numericScale.toString())
  }

  if (options.background) {
    params.set('background', options.background)
  }

  if (options.useAbsoluteBounds) {
    params.set('use_absolute_bounds', 'true')
  }

  return params
}

type FigmaSource =
  | `figma:${string}`
  | `https://${string}.figma.com${string}`
  | `http://${string}.figma.com${string}`

type SharedImageProps = Omit<
  React.ComponentProps<'img'>,
  'alt' | 'src' | 'srcSet'
> & {
  /** Optional description for accessibility. */
  description?: string
}

type FigmaImageOptions = {
  /** Desired output format when rendering from Figma. Defaults to `png`. */
  format?: 'png' | 'jpg' | 'svg' | 'pdf'

  /** Resolution scale to request from Figma. */
  scale?: number

  /** Background color when requesting raster formats from Figma. */
  background?: string

  /** Whether to use the absolute bounding box when exporting from Figma. */
  useAbsoluteBounds?: boolean
}

type NonFigmaImageOptions = {
  format?: never
  scale?: never
  background?: never
  useAbsoluteBounds?: never
}

export type ImageProps<Source extends string = string> = SharedImageProps &
  (Source extends FigmaSource
    ? { source: Source } & FigmaImageOptions
    : { source: Source } & NonFigmaImageOptions)

/** Display images from Figma files, URLs, or local assets.  */
export async function Image<Source extends string>({
  source,
  format = 'png',
  scale,
  background,
  useAbsoluteBounds,
  description,
  ...props
}: ImageProps<Source>): Promise<React.ReactElement> {
  const trimmedSource = source.trim()

  if (!trimmedSource) {
    throw new Error('[renoun] <Image /> requires a non-empty source.')
  }

  const parsedFigmaUrl = parseFigmaUrl(trimmedSource)
  const isFigmaProtocol = FIGMA_PROTOCOL.test(trimmedSource)

  if (!isFigmaProtocol && !parsedFigmaUrl) {
    return React.createElement('img', {
      ...props,
      src: trimmedSource,
      alt: description ?? '',
    })
  }

  const token = process.env['FIGMA_TOKEN']
  if (!token) {
    const isProduction = process.env.NODE_ENV === 'production'
    const lines: string[] = [
      '[renoun] a FIGMA_TOKEN environment variable is required to load images from Figma.\n',
      'How to fix:',
      '1) In the Figma app, go to Main menu → Help and account → Account settings → Security → Personal access tokens, click "Generate new token", then copy it (see https://www.figma.com/developers/api#access-tokens).',
      '   Required scopes: file_content:read',
    ]

    if (!isProduction) {
      lines.push(
        '2) For local development, create a ".env.local" file at the project root with:',
        '   FIGMA_TOKEN=YOUR_TOKEN',
        '3) Restart your dev server so the env var is picked up.'
      )
      lines.push(
        '',
        'When deploying to production:',
        '   - Vercel (Dashboard): Project → Settings → Environment Variables',
        '   - Vercel (CLI): run "vercel env add FIGMA_TOKEN" (and optionally "vercel env pull .env.local" to sync locally)',
        '   - Netlify (Dashboard): Site configuration → Environment variables',
        '   - Netlify (CLI): run "netlify env:set FIGMA_TOKEN YOUR_TOKEN"',
        '   - Amplify: App settings → Environment variables'
      )
    } else {
      lines.push(
        '2) Set it as the FIGMA_TOKEN environment variable in your hosting provider, then redeploy:',
        '   - Vercel (Dashboard): Project → Settings → Environment Variables',
        '   - Vercel (CLI): run "vercel env add FIGMA_TOKEN"',
        '   - Netlify (Dashboard): Site configuration → Environment variables',
        '   - Netlify (CLI): run "netlify env:set FIGMA_TOKEN YOUR_TOKEN"',
        '   - Amplify: App settings → Environment variables'
      )
    }

    lines.push(
      '\nSee the <Image /> docs for more details: https://renoun.dev/components/image'
    )

    throw new Error(lines.join('\n'))
  }

  const config = await getConfig()
  const figmaConfig = config.figma
  const options = { format, scale, background, useAbsoluteBounds }

  let fileId: string
  let nodeId: string
  let resolvedDescription: string | undefined

  if (isFigmaProtocol) {
    ;({ fileId, nodeId } = parseFigmaProtocol(trimmedSource, figmaConfig))
  } else if (parsedFigmaUrl) {
    ;({ fileId, nodeId } = parsedFigmaUrl)
  } else {
    return React.createElement('img', {
      ...props,
      src: trimmedSource,
      alt: description ?? '',
    })
  }

  let resolvedNodeId = nodeId

  if (!isLikelyNodeId(resolvedNodeId)) {
    const component = await resolveComponentBySelector(
      fileId,
      resolvedNodeId,
      token
    )

    if (!component) {
      throw new Error(
        `[renoun] Could not find a component named "${resolvedNodeId}" in file "${fileId}".`
      )
    }

    resolvedNodeId = component.nodeId
    resolvedDescription = component.description?.trim() || undefined
  }

  if (!resolvedDescription && description === undefined) {
    try {
      const components = await fetchFigmaComponents(fileId, token)
      const metadata = components.find(
        (component) => component.nodeId === resolvedNodeId
      )
      resolvedDescription = metadata?.description?.trim() || undefined
    } catch (error) {
      // If we cannot fetch components metadata (e.g., insufficient permissions),
      // continue without auto-filling the description.
      if (process.env.RENOUN_DEBUG === 'debug') {
        // eslint-disable-next-line no-console
        console.debug('[renoun] Skipping component metadata fetch:', error)
      }
    }
  }

  const params = buildFigmaQuery(resolvedNodeId, options)
  const queryKey = params.toString()
  const imageUrl = await fetchFigmaImageUrl(
    fileId,
    resolvedNodeId,
    queryKey,
    token
  )

  // Avoid using expiring Figma URLs directly when possible by embedding a data URL.
  let src = imageUrl
  if (format === 'png' || format === 'jpg' || format === 'svg') {
    const dataUrl = await fetchAsDataUrl(imageUrl, format)
    if (dataUrl) {
      src = dataUrl
    }
  }

  return React.createElement('img', {
    ...props,
    src,
    alt: description ?? resolvedDescription ?? '',
  })
}
