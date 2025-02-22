import React, { Fragment, Suspense } from 'react'
import { resolve } from 'node:path'
import {
  CodeInline,
  MDXRenderer,
  type CodeInlineProps,
} from '../components/index.js'
import {
  JavaScriptFile,
  type JavaScriptFileExport,
} from '../file-system/index.js'
import {
  isParameterType,
  isPropertyType,
  type ClassAccessorType,
  type ClassMethodType,
  type FunctionSignatureType,
  type ResolvedType,
  type SymbolFilter,
} from '../utils/resolve-type.js'
import { createContext, getContext } from '../utils/context.js'
import { createSlug } from '../utils/create-slug.js'

export interface APIReferenceComponents {
  CodeInline: React.ComponentType<CodeInlineProps>
  MDXRenderer: React.ComponentType<React.ComponentProps<typeof MDXRenderer>>
}

const APIReferenceConfigContext = createContext<APIReferenceComponents>({
  CodeInline: CodeInline,
  MDXRenderer: MDXRenderer,
})

function useAPIReferenceConfig() {
  return getContext(APIReferenceConfigContext)
}

const APIReferenceDataContext = createContext<
  ResolvedType | ResolvedType[] | undefined
>(undefined)

function useAPIReferenceData() {
  return getContext(APIReferenceDataContext)
}

export interface APIReferenceProps {
  /** The source of the API reference data. */
  source: string | JavaScriptFile<any> | JavaScriptFileExport<any>

  /** Optional filter for symbols. */
  filter?: SymbolFilter

  /** Optional working directory for relative source paths. */
  workingDirectory?: string

  /**
   * Override default components.
   * e.g. { MDXRenderer: ({ value }) => <MDXRenderer value={value} /> }
   */
  components?: Partial<APIReferenceComponents>

  children?: React.ReactNode
}

export function APIReference(props: APIReferenceProps) {
  return (
    <Suspense fallback="Loading API references...">
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
  const data = await resolveSourceTypeData({
    source,
    filter,
    workingDirectory,
  })
  const mergedComponents: APIReferenceComponents = {
    MDXRenderer: components?.MDXRenderer || MDXRenderer,
    CodeInline: components?.CodeInline || CodeInline,
  }

  if (!data) {
    return null
  }

  if (Array.isArray(data)) {
    return (
      <APIReferenceConfigContext value={mergedComponents}>
        {data.map((type, index) => (
          <TypeProvider key={index} type={type}>
            {children}
          </TypeProvider>
        ))}
      </APIReferenceConfigContext>
    )
  }

  return (
    <APIReferenceConfigContext value={mergedComponents}>
      <TypeProvider type={data}>{children}</TypeProvider>
    </APIReferenceConfigContext>
  )
}

async function resolveSourceTypeData({
  source,
  filter,
  workingDirectory,
}: APIReferenceProps) {
  if (typeof source === 'string') {
    if (workingDirectory) {
      if (URL.canParse(workingDirectory)) {
        const { pathname } = new URL(workingDirectory)
        workingDirectory = pathname.slice(0, pathname.lastIndexOf('/'))
      }
      source = new JavaScriptFile({
        path: resolve(workingDirectory, source),
      })
    } else {
      source = new JavaScriptFile({ path: source })
    }
  }

  let data: ResolvedType | ResolvedType[] | undefined = undefined

  if (source instanceof JavaScriptFile) {
    const exportedTypes = await Promise.all(
      (await source.getExports()).map((fileExport) =>
        fileExport.getType(filter)
      )
    )
    data = exportedTypes.filter((exportedType): exportedType is ResolvedType =>
      Boolean(exportedType)
    )
  } else {
    data = await source.getType(filter)
  }

  return data
}

const CurrentTypeContext = createContext<
  | ResolvedType
  | ClassAccessorType
  | ClassMethodType
  | FunctionSignatureType
  | null
>(null)

function useCurrentType() {
  return getContext(CurrentTypeContext)
}

function TypeProvider({
  type,
  children,
}: {
  type:
    | ResolvedType
    | ClassAccessorType
    | ClassMethodType
    | FunctionSignatureType
  children?: React.ReactNode
}) {
  return <CurrentTypeContext value={type}>{children}</CurrentTypeContext>
}

export function TypeDisplay() {
  const type = useCurrentType()
  const { MDXRenderer, CodeInline } = useAPIReferenceConfig()

  if (!type) {
    return null
  }

  return (
    <div>
      <h3 id={type.name ? createSlug(type.name, 'kebab') : undefined}>
        {type.name}
      </h3>

      <CodeInline value={type.text} language="typescript" />

      {type.description &&
      type.kind !== 'Function' &&
      type.kind !== 'Component' ? (
        <MDXRenderer value={type.description} />
      ) : null}

      <TypeChildren />
    </div>
  )
}

export function TypeChildren() {
  const type = useCurrentType()
  const { CodeInline } = useAPIReferenceConfig()

  if (!type) {
    return null
  }

  if (
    type.kind === 'Enum' ||
    type.kind === 'Symbol' ||
    type.kind === 'UtilityReference' ||
    type.kind === 'Reference'
  ) {
    return <CodeInline value={type.text} language="typescript" />
  }

  if (
    type.kind === 'Object' ||
    type.kind === 'Intersection' ||
    type.kind === 'Union'
  ) {
    return <TypeProperties />
  }

  if (type.kind === 'Class') {
    return <ClassKind />
  }

  if (type.kind === 'Component') {
    return <ComponentKind />
  }

  if (type.kind === 'Function') {
    return <FunctionKind />
  }

  if (type.kind === 'Utility') {
    if (type.type) {
      return (
        <TypeProvider type={type.type}>
          <TypeChildren />
        </TypeProvider>
      )
    }
    return <CodeInline value={type.text} language="typescript" />
  }

  return null
}

export function TypeProperties() {
  const type = useCurrentType()

  if (!type) {
    return null
  }

  if (type.kind === 'Union') {
    return (
      <div>
        {type.members.map((member, index) => {
          if (
            member.kind === 'Object' ||
            member.kind === 'Intersection' ||
            member.kind === 'Union'
          ) {
            return (
              <TypeProvider key={index} type={member}>
                <TypeProperties />
              </TypeProvider>
            )
          }
          if (member.kind === 'Reference') {
            return <Fragment key={index}>{member.text}</Fragment>
          }
          return (
            <TypeProvider key={index} type={member}>
              <TypeValue />
            </TypeProvider>
          )
        })}
      </div>
    )
  }

  if (
    (type.kind === 'Object' || type.kind === 'Intersection') &&
    type.properties?.length
  ) {
    return (
      <div>
        <h5>Properties</h5>
        {type.properties.map((prop, index) => (
          <TypeProvider key={index} type={prop}>
            <TypeValue />
          </TypeProvider>
        ))}
      </div>
    )
  }

  return null
}

export function TypeValue() {
  const type = useCurrentType()
  const { MDXRenderer, CodeInline } = useAPIReferenceConfig()

  if (!type) {
    return null
  }

  const isNameSameAsType = type.name === type.text
  let isRequired = false
  let defaultValue

  if (isParameterType(type) || isPropertyType(type)) {
    isRequired = !type.isOptional
    defaultValue = type.defaultValue
  }

  return (
    <div>
      <div>
        <strong>{type.name}</strong> {isRequired && <span>*</span>}
        {!isNameSameAsType && (
          <>
            {' '}
            <CodeInline value={type.text} language="typescript" />
          </>
        )}
        {defaultValue !== undefined && (
          <>
            {' = '}
            <CodeInline
              value={JSON.stringify(defaultValue)}
              language="typescript"
            />
          </>
        )}
      </div>

      {type.description && (
        <div>
          <MDXRenderer value={type.description} />
        </div>
      )}

      {/* Nested object properties */}
      {type.kind === 'Object' && type.properties
        ? type.properties.map((child, index) => (
            <TypeProvider key={index} type={child}>
              <div style={{ marginLeft: '1.5rem' }}>
                <TypeValue />
              </div>
            </TypeProvider>
          ))
        : null}

      {/* If it's a function, render signatures/parameters */}
      {type.kind === 'Function' && type.signatures
        ? type.signatures.map((sig, index) => (
            <Fragment key={index}>
              {sig.parameters.map((param, i2) => (
                <TypeProvider key={i2} type={param}>
                  <div style={{ marginLeft: '1.5rem' }}>
                    <TypeValue />
                  </div>
                </TypeProvider>
              ))}
            </Fragment>
          ))
        : null}
    </div>
  )
}

export function ClassKind() {
  const type = useCurrentType()

  if (!type) {
    return null
  }

  if (type.kind === 'Class') {
    return (
      <div>
        {type.accessors && type.accessors.length > 0 && (
          <div>
            <h4>Accessors</h4>
            {type.accessors.map((accessorType, index) => (
              <TypeProvider key={index} type={accessorType}>
                <TypeValue />
              </TypeProvider>
            ))}
          </div>
        )}

        {type.constructors && type.constructors.length > 0 && (
          <div>
            <h4>Constructors</h4>
            {type.constructors.map((constructorType, index) => (
              <TypeProvider key={index} type={constructorType}>
                <TypeValue />
              </TypeProvider>
            ))}
          </div>
        )}

        {type.methods && type.methods.length > 0 && (
          <div>
            <h4>Methods</h4>
            {type.methods.map((methodType, index) => (
              <TypeProvider key={index} type={methodType}>
                <TypeValue />
              </TypeProvider>
            ))}
          </div>
        )}

        {type.properties && type.properties.length > 0 && (
          <div>
            <h5>Properties</h5>
            {type.properties.map((propertyType, index) => (
              <TypeProvider key={index} type={propertyType}>
                <TypeValue />
              </TypeProvider>
            ))}
          </div>
        )}
      </div>
    )
  }

  return null
}

export function FunctionKind() {
  const { MDXRenderer, CodeInline } = useAPIReferenceConfig()
  const type = useCurrentType()

  if (!type || type.kind !== 'Function') {
    return null
  }

  const { signatures } = type
  return (
    <div>
      {signatures.length > 1 && <h4>Overloads</h4>}
      {signatures.map((signature, index) => (
        <Fragment key={index}>
          <hr />
          <CodeInline value={signature.text} language="typescript" />
          {signature.description && (
            <div>
              <MDXRenderer value={signature.description} />
            </div>
          )}
          {signature.parameters.length > 0 && (
            <div>
              <h5>Parameters</h5>
              {signature.parameters.map((param, i2) => (
                <TypeProvider key={i2} type={param}>
                  <TypeValue />
                </TypeProvider>
              ))}
            </div>
          )}
          {signature.returnType && (
            <div>
              <h5>Returns</h5>
              <CodeInline value={signature.returnType} language="typescript" />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  )
}

export function ComponentKind() {
  const { MDXRenderer, CodeInline } = useAPIReferenceConfig()
  const type = useCurrentType()

  if (!type || type.kind !== 'Component') {
    return null
  }

  const { signatures } = type
  return (
    <div>
      {signatures.length > 1 && <h4>Overloads</h4>}
      {signatures.map((signature, index) => (
        <Fragment key={index}>
          <hr />
          <CodeInline value={signature.text} language="typescript" />
          {signature.description ? (
            <MDXRenderer value={signature.description} />
          ) : null}
          {signature.parameter && (
            <div>
              <h5>Parameters</h5>
              {signature.parameter.kind === 'Object' ? (
                <TypeProvider type={signature.parameter}>
                  <TypeProperties />
                </TypeProvider>
              ) : signature.parameter.kind === 'Reference' ? (
                <CodeInline
                  value={signature.parameter.text}
                  language="typescript"
                />
              ) : (
                <TypeProvider type={signature.parameter}>
                  <TypeValue />
                </TypeProvider>
              )}
            </div>
          )}
          {signature.returnType && (
            <div>
              <h5>Returns</h5>
              {signature.returnType}
            </div>
          )}
        </Fragment>
      ))}
    </div>
  )
}
