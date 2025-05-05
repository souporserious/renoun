import React, { Fragment, Suspense } from 'react'
import { dirname, resolve } from 'node:path'

import {
  JavaScriptFile,
  type JavaScriptFileExport,
} from '../file-system/index.js'
import {
  isMemberType,
  type ClassAccessorType,
  type ClassMethodType,
  type FunctionSignatureType,
  type ResolvedType,
  type SymbolFilter,
} from '../utils/resolve-type.js'
import { createContext, getContext } from '../utils/context.js'
import { createSlug } from '../utils/create-slug.js'
import {
  CodeInline as CodeInlineDefault,
  type CodeInlineProps,
} from './CodeInline.js'
import { MDXRenderer as MDXRendererDefault } from './MDXRenderer.js'
import { WorkingDirectoryContext } from './Context.js'

export interface APIReferenceComponents {
  CodeInline: React.ComponentType<CodeInlineProps>
  MDXRenderer: React.ComponentType<
    React.ComponentProps<typeof MDXRendererDefault>
  >
  TypeValue: React.ComponentType
  TypeProperties: React.ComponentType<any>
  FunctionKind: React.ComponentType
  ComponentKind: React.ComponentType
}

const defaultComponents: APIReferenceComponents = {
  CodeInline: CodeInlineDefault,
  MDXRenderer: MDXRendererDefault,
  TypeValue: () => null,
  TypeProperties: () => null,
  FunctionKind: () => null,
  ComponentKind: () => null,
}

const APIReferenceConfigContext =
  createContext<APIReferenceComponents>(defaultComponents)

export function getAPIReferenceConfig() {
  return getContext(APIReferenceConfigContext)
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
      <APIReferenceConfigContext value={mergedComponents}>
        {Array.isArray(resolvedType) ? (
          resolvedType.map((type, index) => (
            <TypeContext key={index} value={type}>
              {children}
            </TypeContext>
          ))
        ) : (
          <TypeContext value={resolvedType}>{children}</TypeContext>
        )}
      </APIReferenceConfigContext>
    </WorkingDirectoryContext>
  )
}

async function resolveSourceType({
  source,
  filter,
  workingDirectory,
}: Pick<APIReferenceProps, 'source' | 'filter' | 'workingDirectory'>) {
  if (typeof source === 'string') {
    let path = source
    if (workingDirectory) {
      if (URL.canParse(workingDirectory)) {
        const { pathname } = new URL(workingDirectory)
        workingDirectory = pathname.slice(0, pathname.lastIndexOf('/'))
      }
      path = resolve(workingDirectory, source)
    }
    source = new JavaScriptFile({ path })
  }

  if (source instanceof JavaScriptFile) {
    const exported = await Promise.all(
      (await source.getExports()).map((fileExport) =>
        fileExport.getType(filter)
      )
    )
    return exported.filter(Boolean) as ResolvedType[]
  }

  return source.getType(filter)
}

/* ──────────────────────────────────────────────────────────────────────────
 *  3. Type context
 * ──────────────────────────────────────────────────────────────────────── */

export const TypeContext = createContext<
  | ResolvedType
  | ClassAccessorType
  | ClassMethodType
  | FunctionSignatureType
  | null
>(null)

export function getAPIReferenceType() {
  return getContext(TypeContext)
}

/* ──────────────────────────────────────────────────────────────────────────
 *  4. Leaf renderers – overridable wrappers
 *      • Each wrapper consults context for a replacement
 *      • If none, falls back to its “Base” implementation
 * ──────────────────────────────────────────────────────────────────────── */

function withOverride<K extends keyof APIReferenceComponents>(
  key: K,
  Base: React.ComponentType<any>
): React.ComponentType<any> {
  function Wrapper(props: any) {
    const Comp = getAPIReferenceConfig()[key] || Base
    // Avoid infinite loop if user sets Comp === Wrapper
    return Comp === Wrapper ? <Base {...props} /> : <Comp {...props} />
  }
  Wrapper.displayName = `APIReference(${key})`
  return Wrapper
}

/* ———————————————————————————————————————————— 4a. TypeValue ———————— */

function TypeValueBase() {
  const type = getAPIReferenceType()
  const { CodeInline, MDXRenderer } = getAPIReferenceConfig()
  if (!type) return null

  const isNameSameAsType = type.name === type.text
  const isRequired = isMemberType(type) ? !type.isOptional : false
  const defaultValue = isMemberType(type) ? type.defaultValue : undefined

  return (
    <div>
      <div>
        <strong>{type.name}</strong>
        {isRequired && <span>*</span>}
        {!isNameSameAsType && (
          <>
            {' '}
            <CodeInline children={type.text} language="typescript" />
          </>
        )}
        {defaultValue !== undefined && (
          <>
            {' = '}
            <CodeInline
              children={JSON.stringify(defaultValue)}
              language="typescript"
            />
          </>
        )}
      </div>

      {type.description && (
        <div>
          <MDXRenderer children={type.description} />
        </div>
      )}
    </div>
  )
}

export const TypeValue = withOverride('TypeValue', TypeValueBase)

/* ———————————————————————————————————————————— 4b. TypeProperties ———— */

export function TypeProperties({
  Value,
}: {
  /** How to render a leaf member/property */
  Value?: React.ComponentType
}) {
  const type = getAPIReferenceType()
  const { TypeValue: DefaultValue } = getAPIReferenceConfig()
  const Leaf = Value || DefaultValue || TypeValueBase
  if (!type) return null

  const recurse = (child: any, key: React.Key) => (
    <TypeContext key={key} value={child}>
      <TypeProperties Value={Leaf} />
    </TypeContext>
  )

  // Unions
  if (type.kind === 'Union') {
    return type.members.map((m, i) => {
      if (
        m.kind === 'Object' ||
        m.kind === 'Intersection' ||
        m.kind === 'Union'
      )
        return recurse(m, i)
      if (m.kind === 'Reference') return <Fragment key={i}>{m.text}</Fragment>
      return (
        <TypeContext key={i} value={m}>
          <Leaf />
        </TypeContext>
      )
    })
  }

  // Objects / Intersections
  if (
    (type.kind === 'Object' || type.kind === 'Intersection') &&
    type.properties?.length
  ) {
    return type.properties.map((p, i) => (
      <TypeContext key={i} value={p}>
        <Leaf />
      </TypeContext>
    ))
  }

  // Components → drill into props parameter
  if (type.kind === 'Component' && type.signatures?.length) {
    const sig = type.signatures[0]
    if (sig.parameter) {
      const param = sig.parameter

      if (param.kind === 'Object') return recurse(param, 'comp-param')
      return (
        <TypeContext value={param}>
          <Leaf />
        </TypeContext>
      )
    }
    return null
  }

  // Functions → list parameters
  if (type.kind === 'Function' && type.signatures?.length) {
    const sig = type.signatures[0]
    if (sig.parameters?.length) {
      return sig.parameters.map((p, i) => (
        <TypeContext key={i} value={p}>
          {p.kind === 'Object' ||
          p.kind === 'Intersection' ||
          p.kind === 'Union' ? (
            <TypeProperties Value={Leaf} />
          ) : (
            <Leaf />
          )}
        </TypeContext>
      ))
    }
    return null
  }

  return null
}
defaultComponents.TypeProperties = TypeProperties // attach default

/* ———————————————————————————————————————————— 4c. FunctionKind ———— */

function FunctionKindBase() {
  const { MDXRenderer, CodeInline } = getAPIReferenceConfig()
  const type = getAPIReferenceType()
  if (!type || type.kind !== 'Function') return null

  return (
    <div>
      {type.signatures.length > 1 && <h4>Overloads</h4>}
      {type.signatures.map((sig, i) => (
        <Fragment key={i}>
          <hr />
          <CodeInline children={sig.text} language="typescript" />
          {sig.description && <MDXRenderer children={sig.description} />}
          {sig.parameters.length > 0 && (
            <div>
              <h5>Parameters</h5>
              {sig.parameters.map((p, j) => (
                <TypeContext key={j} value={p}>
                  <TypeValue />
                </TypeContext>
              ))}
            </div>
          )}
          {sig.returnType && (
            <div>
              <h5>Returns</h5>
              <CodeInline children={sig.returnType} language="typescript" />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  )
}
export const FunctionKind = withOverride('FunctionKind', FunctionKindBase)
defaultComponents.FunctionKind = FunctionKind

/* ———————————————————————————————————————————— 4d. ComponentKind ———— */

function ComponentKindBase() {
  const { MDXRenderer, CodeInline } = getAPIReferenceConfig()
  const type = getAPIReferenceType()
  if (!type || type.kind !== 'Component') return null

  return (
    <div>
      {type.signatures.length > 1 && <h4>Overloads</h4>}
      {type.signatures.map((sig, i) => (
        <Fragment key={i}>
          <hr />
          <CodeInline children={sig.text} language="typescript" />
          {sig.description && <MDXRenderer children={sig.description} />}
          {sig.parameter && (
            <div>
              <h5>Parameters</h5>
              {sig.parameter.kind === 'Object' ? (
                <TypeContext value={sig.parameter}>
                  <TypeProperties />
                </TypeContext>
              ) : sig.parameter.kind === 'Reference' ? (
                <CodeInline
                  children={sig.parameter.text}
                  language="typescript"
                />
              ) : (
                <TypeContext value={sig.parameter}>
                  <TypeValue />
                </TypeContext>
              )}
            </div>
          )}
          {sig.returnType && (
            <div>
              <h5>Returns</h5>
              {sig.returnType}
            </div>
          )}
        </Fragment>
      ))}
    </div>
  )
}
export const ComponentKind = withOverride('ComponentKind', ComponentKindBase)
defaultComponents.ComponentKind = ComponentKind

/* ———————————————————————————————————————————— 4e. ClassKind ———— */

export function ClassKind() {
  const type = getAPIReferenceType()
  if (!type || type.kind !== 'Class') return null

  return (
    <div>
      {type.accessors?.length ? (
        <section>
          <h4>Accessors</h4>
          {type.accessors.map((a, i) => (
            <TypeContext key={i} value={a}>
              <TypeValue />
            </TypeContext>
          ))}
        </section>
      ) : null}

      {type.constructors?.length ? (
        <section>
          <h4>Constructors</h4>
          {type.constructors.map((c, i) => (
            <TypeContext key={i} value={c}>
              <TypeValue />
            </TypeContext>
          ))}
        </section>
      ) : null}

      {type.methods?.length ? (
        <section>
          <h4>Methods</h4>
          {type.methods.map((m, i) => (
            <TypeContext key={i} value={m}>
              <TypeValue />
            </TypeContext>
          ))}
        </section>
      ) : null}

      {type.properties?.length ? (
        <section>
          <h5>Properties</h5>
          {type.properties.map((p, i) => (
            <TypeContext key={i} value={p}>
              <TypeValue />
            </TypeContext>
          ))}
        </section>
      ) : null}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 *  5. Generic display components
 * ──────────────────────────────────────────────────────────────────────── */

export function TypeDisplay() {
  const type = getAPIReferenceType()
  const { MDXRenderer, CodeInline } = getAPIReferenceConfig()
  if (!type) return null

  return (
    <div>
      <h3 id={type.name ? createSlug(type.name, 'kebab') : undefined}>
        {type.name}
      </h3>

      <CodeInline children={type.text} language="typescript" />

      {type.description &&
      type.kind !== 'Function' &&
      type.kind !== 'Component' ? (
        <MDXRenderer children={type.description} />
      ) : null}

      <TypeChildren />
    </div>
  )
}

export function TypeChildren() {
  const type = getAPIReferenceType()
  const { CodeInline } = getAPIReferenceConfig()
  if (!type) return null

  if (
    type.kind === 'Enum' ||
    type.kind === 'Symbol' ||
    type.kind === 'UtilityReference' ||
    type.kind === 'Reference'
  ) {
    return <CodeInline children={type.text} language="typescript" />
  }

  if (
    type.kind === 'Object' ||
    type.kind === 'Intersection' ||
    type.kind === 'Union'
  ) {
    return <TypeProperties />
  }

  if (type.kind === 'Class') return <ClassKind />
  if (type.kind === 'Component') return <ComponentKind />
  if (type.kind === 'Function') return <FunctionKind />

  if (type.kind === 'Utility') {
    return type.type ? (
      <TypeContext value={type.type}>
        <TypeChildren />
      </TypeContext>
    ) : (
      <CodeInline children={type.text} language="typescript" />
    )
  }

  return null
}
