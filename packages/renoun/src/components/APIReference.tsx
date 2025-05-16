import React, { Suspense } from 'react'
import { dirname, resolve } from 'node:path'

import {
  JavaScriptFile,
  type JavaScriptFileExport,
} from '../file-system/index.js'
import { type ResolvedType, type SymbolFilter } from '../utils/resolve-type.js'
import { createContext, getContext } from '../utils/context.js'
import {
  CodeInline as CodeInlineDefault,
  type CodeInlineProps,
} from './CodeInline.js'
import { Markdown as MarkdownDefault, type MarkdownProps } from './Markdown.js'
import { WorkingDirectoryContext } from './Context.js'

export type APIReferenceComponents = any
// TODO: this is causing error in type resolver
// export interface APIReferenceComponents {
//   CodeInline: React.ComponentType<CodeInlineProps>
//   Markdown: React.ComponentType<MarkdownProps>
// }

const defaultComponents: APIReferenceComponents = {
  CodeInline: CodeInlineDefault,
  Markdown: MarkdownDefault,
}

const TypeReferenceComponentsContext =
  createContext<APIReferenceComponents>(defaultComponents)

export function getTypeReferenceComponents() {
  return getContext(TypeReferenceComponentsContext)
}

export const TypeReferenceContext = createContext<ResolvedType | null>(null)

export function getTypeReference(): ResolvedType
export function getTypeReference<Kind extends ResolvedType['kind']>(
  kind: Kind
): Extract<ResolvedType, { kind: Kind }>
export function getTypeReference<Kind extends ResolvedType['kind']>(
  kind?: Kind
): ResolvedType | null {
  const type = getContext(TypeReferenceContext)
  if (type === null) {
    return null
  }
  if (kind && type.kind !== kind) {
    throw new Error(
      `[renoun] Expected type kind "${kind}", but got "${type.kind}".`
    )
  }

  return kind ? (type as Extract<ResolvedType, { kind: Kind }>) : type
}

export interface APIReferenceProps {
  /** The file path, source file, or export type reference to resolve. */
  source: string | JavaScriptFile<any> | JavaScriptFileExport<any>

  /** Optional filter for exported symbols. */
  filter?: SymbolFilter

  /** Base directory for relative `source` values. */
  workingDirectory?: string

  /**
   * Override default component renderers.
   *
   * ```tsx
   * <APIReference
   *   source="./Button.tsx"
   *   components={{ CodeInline: CustomCodeInline, TypeValue: CustomTypeValue }}
   * />
   * ```
   */
  components?: Partial<APIReferenceComponents>

  /** Optional children to override the default rendering. */
  children?: React.ReactNode
}

export function APIReference(props: APIReferenceProps) {
  return (
    <Suspense>
      <APIReferenceAsync {...props} />
    </Suspense>
  )
}

async function APIReferenceAsync({
  source,
  filter,
  workingDirectory,
  components,
  children,
}: APIReferenceProps) {
  let filePath: string | undefined = undefined

  if (typeof source === 'string') {
    if (workingDirectory) {
      if (URL.canParse(workingDirectory)) {
        const { pathname } = new URL(workingDirectory)
        workingDirectory = pathname.slice(0, pathname.lastIndexOf('/'))
      }
      filePath = resolve(workingDirectory, source)
    } else {
      filePath = source
    }
    source = new JavaScriptFile({ path: filePath })
  }

  let resolvedType: ResolvedType | ResolvedType[] | undefined

  if (source instanceof JavaScriptFile) {
    const exported = await Promise.all(
      (await source.getExports()).map((fileExport) =>
        fileExport.getType(filter)
      )
    )
    resolvedType = exported.filter(Boolean) as ResolvedType[]
  } else {
    resolvedType = await source.getType(filter)
  }

  if (!resolvedType) {
    return null
  }

  const mergedComponents: APIReferenceComponents = {
    ...defaultComponents,
    ...components,
  }

  return (
    <WorkingDirectoryContext value={filePath ? dirname(filePath) : undefined}>
      <TypeReferenceComponentsContext value={mergedComponents}>
        {Array.isArray(resolvedType) ? (
          resolvedType.map((type, index) => (
            <TypeReferenceContext key={index} value={type}>
              {children}
            </TypeReferenceContext>
          ))
        ) : (
          <TypeReferenceContext value={resolvedType}>
            {children}
          </TypeReferenceContext>
        )}
      </TypeReferenceComponentsContext>
    </WorkingDirectoryContext>
  )
}
