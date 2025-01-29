/** @jsxImportSource restyle */
/** @jsxRuntime automatic */
import { Fragment, Suspense } from 'react'
import type { CSSObject } from 'restyle'
import { resolve } from 'node:path'

import {
  JavaScriptFile,
  type JavaScriptFileExport,
} from '../file-system/index.js'
import { createSlug } from '../utils/create-slug.js'
import type {
  AllTypes,
  ResolvedType,
  SymbolFilter,
  TypeOfKind,
} from '../utils/resolve-type.js'
import { isParameterType, isPropertyType } from '../utils/resolve-type.js'
import { CodeBlock } from './CodeBlock/index.js'
import { CodeInline } from './CodeInline.js'
import { MDXRenderer } from './MDXRenderer.js'
import type { MDXComponents } from '../mdx/index.js'

const mdxComponents = {
  pre: (props) => {
    const { value, language } = CodeBlock.parsePreProps(props)
    return <CodeBlock allowErrors value={value} language={language} />
  },
  code: (props) => {
    return <CodeInline value={props.children} language="typescript" />
  },
  p: (props) => <p {...props} css={{ margin: 0 }} />,
} satisfies MDXComponents

interface SourceString {
  /** The file path to the source code. */
  source: string

  /** The working directory to resolve the file path from. Will use the base URL if a URL is provided. */
  workingDirectory?: string
}

interface SourceExport {
  /** The export source from a collection export source to get types from. */
  source: JavaScriptFile<any> | JavaScriptFileExport<any>
}

interface Filter {
  /** A filter to apply to the exported types. */
  filter?: SymbolFilter
}

export type APIReferenceProps =
  | (SourceString & Filter)
  | (SourceExport & Filter)

/** Displays type documentation for all types exported from a file path, `JavaScriptFile`, or `JavaScriptFileExport`. */
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
  ...props
}: APIReferenceProps) {
  if (typeof source === 'string') {
    let workingDirectory: string | undefined

    if ('workingDirectory' in props && props.workingDirectory) {
      if (URL.canParse(props.workingDirectory)) {
        const { pathname } = new URL(props.workingDirectory)
        workingDirectory = pathname.slice(0, pathname.lastIndexOf('/'))
      } else {
        workingDirectory = props.workingDirectory
      }
    }

    source = new JavaScriptFile({
      path: workingDirectory ? resolve(workingDirectory, source) : source,
    })
  }

  if (source instanceof JavaScriptFile) {
    const exportedTypes = await Promise.all(
      (await source.getExports()).map((exportSource) =>
        exportSource.getType(filter)
      )
    )

    return exportedTypes
      .filter((type): type is ResolvedType => Boolean(type))
      .map((type) => (
        <div
          key={type.name}
          css={{
            display: 'flex',
            flexDirection: 'column',
            padding: '1.6rem 0',
            borderBottom: '1px solid var(--color-separator-secondary)',
          }}
        >
          <div
            css={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.8rem',
            }}
          >
            <div
              css={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <h3
                id={type.name ? createSlug(type.name, 'kebab') : undefined}
                css={{ flexShrink: 0, margin: '0 !important' }}
              >
                {type.name}
              </h3>

              <CodeInline value={type.text} language="typescript" />

              {/* {type.path && <ViewSource href={type.path} />} */}
            </div>

            {type.description ? (
              <MDXRenderer
                value={type.description}
                components={mdxComponents}
              />
            ) : null}
          </div>

          <div css={{ display: 'flex' }}>
            <TypeChildren type={type} css={{ marginTop: '2rem' }} />
          </div>
        </div>
      ))
  }

  const type = await source.getType(filter)

  if (type === undefined) {
    return null
  }

  return (
    <div
      key={type.name}
      css={{
        display: 'flex',
        flexDirection: 'column',
        padding: '1.6rem 0',
        borderBottom: '1px solid var(--color-separator-secondary)',
      }}
    >
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.8rem',
        }}
      >
        <div
          css={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <h3
            id={type.name ? createSlug(type.name, 'kebab') : undefined}
            css={{ flexShrink: 0, margin: 0 }}
          >
            {type.name}
          </h3>

          <CodeInline value={type.text} language="typescript" />

          {/* {type.path && <ViewSource href={type.path} />} */}
        </div>

        {type.description &&
        type.kind !== 'Function' &&
        type.kind !== 'Component' ? (
          <MDXRenderer value={type.description} components={mdxComponents} />
        ) : null}
      </div>

      <div css={{ display: 'flex' }}>
        <TypeChildren type={type} css={{ marginTop: '2rem' }} />
      </div>
    </div>
  )
}

/** Determines how to render the immediate type children based on its kind. */
function TypeChildren({
  type,
  css: cssProp,
}: {
  type: ResolvedType
  css: CSSObject
}) {
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
    return <TypeProperties type={type} css={cssProp} />
  }

  if (type.kind === 'Class') {
    return (
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: '1.5rem',
          gap: '1.2rem',
          minWidth: 0,
          ...cssProp,
        }}
      >
        {type.accessors && type.accessors.length > 0 ? (
          <div>
            <h4 css={{ margin: 0 }}>Accessors</h4>
            {type.accessors.map((accessor, index) => (
              <TypeValue key={index} type={accessor} />
            ))}
          </div>
        ) : null}

        {type.constructors && type.constructors.length > 0 ? (
          <div>
            <h4 css={{ margin: 0 }}>Constructors</h4>
            {type.constructors.map((constructor, index) => (
              <TypeValue key={index} type={constructor} />
            ))}
          </div>
        ) : null}

        {type.methods && type.methods.length > 0 ? (
          <div>
            <h4 css={{ margin: 0 }}>Methods</h4>
            {type.methods.map((method, index) => (
              <TypeValue key={index} type={method} />
            ))}
          </div>
        ) : null}

        {type.properties && type.properties.length > 0 ? (
          <div>
            <h5 css={{ margin: 0 }}>Properties</h5>
            {type.properties.map((property, index) => (
              <TypeValue key={index} type={property} />
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  if (type.kind === 'Component') {
    return (
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: '1.5rem',
          gap: '1.2rem',
          minWidth: 0,
          ...cssProp,
        }}
      >
        {type.signatures.length > 1 ? (
          <h4 css={{ margin: 0, marginBottom: '1rem' }}>Overloads</h4>
        ) : null}
        {type.signatures.map((signature, index) => {
          return (
            <Fragment key={index}>
              <hr
                css={{
                  border: 'none',
                  borderTop: '1px solid var(--color-separator-secondary)',
                }}
              />
              <CodeInline value={signature.text} language="typescript" />
              {signature.description ? (
                <MDXRenderer
                  value={signature.description}
                  components={mdxComponents}
                />
              ) : null}
              {signature.parameter ? (
                <div>
                  <h5 css={{ margin: '0' }}>Parameters</h5>
                  {signature.parameter.kind === 'Object' ? (
                    <TypeProperties type={signature.parameter} />
                  ) : signature.parameter.kind === 'Reference' ? (
                    <CodeInline
                      value={signature.parameter.text}
                      language="typescript"
                      css={{ display: 'inline-block', marginTop: '1.5rem' }}
                    />
                  ) : (
                    <TypeValue type={signature.parameter} />
                  )}
                </div>
              ) : null}
              {signature.returnType ? (
                <div>
                  <h5 css={{ margin: 0, marginBottom: '1.5rem' }}>Returns</h5>
                  {signature.returnType}
                </div>
              ) : null}
            </Fragment>
          )
        })}
      </div>
    )
  }

  if (type.kind === 'Function') {
    return (
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: '1.5rem',
          gap: '1.2rem',
          minWidth: 0,
          ...cssProp,
        }}
      >
        {type.signatures.length > 1 ? (
          <h4 css={{ margin: 0, marginBottom: '1rem' }}>Overloads</h4>
        ) : null}
        {type.signatures.map((signature, index) => {
          return (
            <Fragment key={index}>
              <hr
                css={{
                  border: 'none',
                  borderTop: '1px solid var(--color-separator-secondary)',
                }}
              />
              <CodeInline value={signature.text} language="typescript" />
              {signature.description ? (
                <MDXRenderer
                  value={signature.description}
                  components={mdxComponents}
                />
              ) : null}
              {signature.parameters.length > 0 ? (
                <div>
                  <h5 css={{ margin: 0 }}>Parameters</h5>
                  {signature.parameters.map((parameter, index) => (
                    <TypeValue key={index} type={parameter} />
                  ))}
                </div>
              ) : null}
              {signature.returnType ? (
                <div
                  css={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'start',
                  }}
                >
                  <h5 css={{ margin: 0, marginBottom: '1.5rem' }}>Returns</h5>
                  <CodeInline
                    value={signature.returnType}
                    language="typescript"
                    css={{ maxWidth: '-webkit-fill-available' }}
                  />
                </div>
              ) : null}
            </Fragment>
          )
        })}
      </div>
    )
  }

  if (type.kind === 'Utility') {
    if (type.type) {
      return <TypeChildren type={type.type} css={{ marginTop: '2rem' }} />
    } else {
      return <CodeInline value={type.text} language="typescript" />
    }
  }

  console.log('[APIReference:TypeChildren] Did not render: ', type)

  return null
}

/** Determines how to render the immediate type properties accounting for unions. */
function TypeProperties({
  type,
  css: cssProp,
}: {
  type: TypeOfKind<'Object' | 'Intersection' | 'Union'>
  css?: CSSObject
}) {
  if (type.kind === 'Union') {
    return (
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: '1.5rem',
          gap: '1.2rem',
          minWidth: 0,
          ...cssProp,
        }}
      >
        {type.members.map((member, index) =>
          member.kind === 'Object' ||
          member.kind === 'Intersection' ||
          member.kind === 'Union' ? (
            <TypeProperties key={index} type={member} />
          ) : member.kind === 'Reference' ? (
            member.text
          ) : (
            <TypeValue key={index} type={member} />
          )
        )}
      </div>
    )
  }

  if (type.properties.length) {
    return (
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: '1.5rem',
          gap: '1.2rem',
          minWidth: 0,
          ...cssProp,
        }}
      >
        <h5 css={{ margin: 0, color: 'var(--color-foreground-secondary)' }}>
          Properties
        </h5>
        {type.properties.map((propertyType, index) => (
          <TypeValue key={index} type={propertyType} />
        ))}
      </div>
    )
  }

  console.log('[APIReference:TypeProperties] Did not render: ', type)

  return null
}

/** Renders a type value with its name, type, and description. */
function TypeValue({
  type,
  css: cssProp,
}: {
  type: AllTypes
  css?: CSSObject
}) {
  const isNameSameAsType = type.name === type.text
  let isRequired = false
  let defaultValue

  if (isParameterType(type) || isPropertyType(type)) {
    isRequired = !type.isOptional
    defaultValue = type.defaultValue
  }

  return (
    <div
      key={type.name + type.text}
      css={{
        display: 'flex',
        flexDirection: 'column',
        padding: '1.5rem 0',
        gap: '0.8rem',
        minWidth: 0,
        ...cssProp,
      }}
    >
      <div
        css={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <h4
          css={{
            display: 'flex',
            alignItems: 'flex-start',
            flexShrink: 0,
            margin: 0,
            fontWeight: 400,
            color: 'var(--color-foreground-secondary)',
          }}
        >
          {type.name}{' '}
          {isRequired && (
            <span css={{ color: 'oklch(0.8 0.15 36.71)' }} title="required">
              *
            </span>
          )}
        </h4>
        <div
          css={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            minWidth: 0,
          }}
        >
          {isNameSameAsType ? null : (
            <CodeInline
              value={type.text}
              language="typescript"
              paddingX="0.5rem"
              paddingY="0.2rem"
              css={{ fontSize: 'var(--font-size-body-2)' }}
            />
          )}
          {defaultValue ? (
            <span
              css={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                minWidth: 0,
              }}
            >
              ={' '}
              <CodeInline
                value={JSON.stringify(defaultValue)}
                language="typescript"
              />
            </span>
          ) : null}
        </div>
      </div>

      {type.description && (
        <MDXRenderer value={type.description} components={mdxComponents} />
      )}

      {type.kind === 'Object' && type.properties
        ? type.properties.map((propertyType, index) => (
            <TypeValue
              key={index}
              type={propertyType}
              css={{ paddingLeft: '1.5rem' }}
            />
          ))
        : null}

      {type.kind === 'Function' && type.signatures && type.signatures.length
        ? type.signatures.map((signature) =>
            signature.parameters.map((parameter, index) => (
              <TypeValue
                key={index}
                type={parameter}
                css={{ paddingLeft: '1.5rem' }}
              />
            ))
          )
        : null}
    </div>
  )
}
