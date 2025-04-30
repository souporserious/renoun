import React, { Fragment, Suspense } from 'react'
import { resolve } from 'node:path'

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
import { CodeInline, type CodeInlineProps } from './CodeInline.js'
import { MDXRenderer } from './MDXRenderer.js'

export interface APIReferenceComponents {
  CodeInline: React.ComponentType<CodeInlineProps>
  MDXRenderer: React.ComponentType<React.ComponentProps<typeof MDXRenderer>>
}

const APIReferenceConfigContext = createContext<APIReferenceComponents>({
  CodeInline: CodeInline,
  MDXRenderer: MDXRenderer,
})

export function getAPIReferenceConfig() {
  return getContext(APIReferenceConfigContext)
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

  /** Optional children to render the API reference data. */
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

export const APIReferenceTypeContext = createContext<
  | ResolvedType
  | ClassAccessorType
  | ClassMethodType
  | FunctionSignatureType
  | null
>(null)

export function getAPIReferenceType() {
  return getContext(APIReferenceTypeContext)
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
  return (
    <APIReferenceTypeContext value={type}>{children}</APIReferenceTypeContext>
  )
}

export function TypeDisplay() {
  const type = getAPIReferenceType()
  const { MDXRenderer, CodeInline } = getAPIReferenceConfig()

  if (!type) {
    return null
  }

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

  if (!type) {
    return null
  }

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
    return <CodeInline children={type.text} language="typescript" />
  }

  return null
}

export function TypeProperties({
  Value = TypeValue,
}: {
  Value?: React.ComponentType
}) {
  const type = getAPIReferenceType()

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
                <TypeProperties Value={Value} />
              </TypeProvider>
            )
          }
          if (member.kind === 'Reference') {
            return <Fragment key={index}>{member.text}</Fragment>
          }
          return (
            <TypeProvider key={index} type={member}>
              <Value />
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
            <Value />
          </TypeProvider>
        ))}
      </div>
    )
  }

  return null
}

export function TypeValue() {
  const type = getAPIReferenceType()
  const { MDXRenderer, CodeInline } = getAPIReferenceConfig()

  if (!type) {
    return null
  }

  const isNameSameAsType = type.name === type.text
  let isRequired = false
  let defaultValue

  if (isMemberType(type)) {
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
  const type = getAPIReferenceType()

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
  const { MDXRenderer, CodeInline } = getAPIReferenceConfig()
  const type = getAPIReferenceType()

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
          <CodeInline children={signature.text} language="typescript" />
          {signature.description && (
            <div>
              <MDXRenderer children={signature.description} />
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
              <CodeInline
                children={signature.returnType}
                language="typescript"
              />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  )
}

export function ComponentKind() {
  const { MDXRenderer, CodeInline } = getAPIReferenceConfig()
  const type = getAPIReferenceType()

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
          <CodeInline children={signature.text} language="typescript" />
          {signature.description ? (
            <MDXRenderer children={signature.description} />
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
                  children={signature.parameter.text}
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
