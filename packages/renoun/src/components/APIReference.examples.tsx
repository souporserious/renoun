/** @jsxImportSource restyle */
import {
  APIReference,
  CodeBlock,
  CodeInline,
  MDXRenderer,
  getAPIReferenceConfig,
  getAPIReferenceType,
  parseCodeProps,
  parsePreProps,
} from 'renoun/components'
import { rehypePlugins, remarkPlugins } from 'renoun/mdx'
import { isMemberType } from 'renoun/utils'

export function Table() {
  return (
    <div
      css={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, auto)',
        columnGap: '2rem',
        rowGap: '3rem',
      }}
    >
      <APIReference
        source="./examples/Button.tsx"
        workingDirectory={import.meta.url}
        components={{
          MDXRenderer: (props) => (
            <MDXRenderer
              components={{
                pre: (props) => <CodeBlock {...parsePreProps(props)} />,
                code: (props) => <CodeInline {...parseCodeProps(props)} />,
              }}
              rehypePlugins={rehypePlugins}
              remarkPlugins={remarkPlugins}
              {...props}
            />
          ),
        }}
      >
        <Kind />
      </APIReference>
    </div>
  )
}

function Kind() {
  const prop = getAPIReferenceType()

  console.log(prop)

  switch (prop?.kind) {
    case 'Class':
      return <ClassKind />
    case 'Component':
      return <ComponentKind />
    case 'Function':
      return <FunctionKind />
    case 'Object':
      return <ObjectKind />
    case 'Union':
      return <UnionKind />
    case 'Reference':
      return <ReferenceKind />
    case 'UtilityReference':
      return <UtilityReferenceKind />
    default:
      return null
  }
}

function ClassKind() {
  const prop = getAPIReferenceType()
  const { CodeInline, MDXRenderer } = getAPIReferenceConfig()

  if (prop?.kind !== 'Class') {
    throw new Error(
      '[renoun] PropsTable only supports function types. Use TypeProperties for other types.'
    )
  }

  return (
    <div
      css={{
        gridColumn: '1 / -1',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <h2 css={{ fontSize: '1.25rem' }}>{prop.name}</h2>
      {prop.description ? <MDXRenderer children={prop.description} /> : null}
      <CodeInline
        children={prop.text}
        language="typescript"
        css={{
          display: 'inline-block',
          maxWidth: '100%',
          whiteSpace: 'nowrap',
        }}
      />
    </div>
  )
}

function UnionKind() {
  const prop = getAPIReferenceType()
  const { CodeInline, MDXRenderer } = getAPIReferenceConfig()

  if (prop?.kind !== 'Union') {
    throw new Error(
      '[renoun] PropsTable only supports function types. Use TypeProperties for other types.'
    )
  }

  return (
    <div
      css={{
        gridColumn: '1 / -1',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <h2 css={{ fontSize: '1.25rem' }}>{prop.name}</h2>
      {prop.description ? <MDXRenderer children={prop.description} /> : null}
      <CodeInline
        children={prop.text}
        language="typescript"
        css={{
          display: 'inline-block',
          maxWidth: '100%',
          whiteSpace: 'nowrap',
        }}
      />
    </div>
  )
}

function FunctionKind() {
  const prop = getAPIReferenceType()
  const { CodeInline, MDXRenderer } = getAPIReferenceConfig()

  if (prop?.kind !== 'Function') {
    throw new Error(
      '[renoun] PropsTable only supports function types. Use TypeProperties for other types.'
    )
  }

  return (
    <div
      css={{
        gridColumn: '1 / -1',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <h2 css={{ fontSize: '1.25rem' }}>{prop.name}</h2>
      {prop.description ? <MDXRenderer children={prop.description} /> : null}
      <CodeInline
        children={prop.text}
        language="typescript"
        css={{
          display: 'inline-block',
          maxWidth: '100%',
          whiteSpace: 'nowrap',
        }}
      />
    </div>
  )
}

/** Renders a component reference type. */
function ComponentKind() {
  const prop = getAPIReferenceType()
  const { MDXRenderer } = getAPIReferenceConfig()

  if (prop?.kind !== 'Component') {
    throw new Error(
      '[renoun] PropsTable only supports components. Use TypeProperties for other types.'
    )
  }

  return (
    <section
      css={{
        gridColumn: '1 / -1',
        display: 'grid',
        gridTemplateColumns: 'subgrid',
        rowGap: '2rem',
      }}
    >
      <div
        css={{
          gridColumn: '1 / -1',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <h2 css={{ fontSize: '1.25rem' }}>{prop.name}</h2>
        {prop.description ? <MDXRenderer children={prop.description} /> : null}
      </div>

      {/* {prop.signatures.map((signature) => {
        if (!signature.parameter) return null

        let childrenToRender: React.ReactNode = null

        switch (signature.parameter.kind) {
          case 'Object':
            childrenToRender = <ObjectKind />
            break
          case 'Reference':
            childrenToRender = <ReferenceKind />
            break
          case 'UtilityReference':
            childrenToRender = <UtilityReferenceKind />
            break
          default:
            return null
        }

        return (
          <TypeContext key={signature.name} value={signature.parameter}>
            {childrenToRender}
          </TypeContext>
        )
      })} */}
    </section>
  )
}

/** Renders an object type e.g. `{ language: 'ts' | 'tsx' }` */
function ObjectKind() {
  const prop = getAPIReferenceType()
  const { CodeInline } = getAPIReferenceConfig()

  if (prop?.kind !== 'Object') {
    throw new Error(
      '[renoun] PropsTable only supports object types. Use TypeProperties for other types.'
    )
  }

  return (
    <section
      css={{
        gridColumn: '1 / -1',
        display: 'grid',
        gridTemplateColumns: 'subgrid',
        rowGap: '2rem',
      }}
    >
      <h2 css={{ fontSize: '1.25rem' }}>{prop.name}</h2>
      {prop.description ? <MDXRenderer children={prop.description} /> : null}
      <CodeInline
        children={prop.text}
        language="typescript"
        css={{
          display: 'inline-block',
          maxWidth: '100%',
          whiteSpace: 'nowrap',
        }}
      />
      <table
        css={{
          gridColumn: '1 / -1',
          display: 'grid',
          gridTemplateColumns: 'subgrid',
          fontSize: '1rem',
          lineHeight: 1.5,
          backgroundColor: 'var(--color-background)',
          color: 'var(--color-foreground)',
        }}
      >
        <thead
          css={{
            gridColumn: '1 / -1',
            display: 'grid',
            gridTemplateColumns: 'subgrid',
          }}
        >
          <tr
            css={{
              gridColumn: '1 / -1',
              display: 'grid',
              gridTemplateColumns: 'subgrid',
              borderBottom: '1px solid var(--color-separator)',
            }}
          >
            {['Prop', 'Type', 'Default'].map((heading, index) => (
              <th
                key={heading}
                css={{
                  gridColumn: index + 1,
                  textAlign: 'left',
                  padding: '12px',
                  fontWeight: 700,
                }}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody
          css={{
            gridColumn: '1 / -1',
            display: 'grid',
            gridTemplateColumns: 'subgrid',
          }}
        >
          {prop.properties.map((property) => {
            const isOptional = isMemberType(property)
              ? property.isOptional
              : false
            const defaultValue = isMemberType(property)
              ? property.defaultValue
              : undefined

            return (
              <tr
                key={property.name}
                css={{
                  gridColumn: '1 / -1',
                  display: 'grid',
                  gridTemplateColumns: 'subgrid',
                  borderBottom: '1px solid var(--color-separator)',
                }}
              >
                <td
                  css={{
                    gridColumn: 1,
                    padding: '12px',
                  }}
                >
                  {property.name || <span>&mdash;</span>}
                  {isOptional ? null : (
                    <span css={{ color: 'oklch(0.8 0.15 36.71)' }}>*</span>
                  )}
                </td>

                <td
                  css={{
                    gridColumn: 2,
                    padding: '12px',
                  }}
                >
                  <CodeInline
                    children={property.text}
                    language="typescript"
                    css={{
                      display: 'inline-block',
                      maxWidth: '100%',
                      whiteSpace: 'nowrap',
                    }}
                  />
                </td>

                <td
                  css={{
                    gridColumn: 3,
                    padding: '12px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {defaultValue ? (
                    <CodeInline
                      children={JSON.stringify(defaultValue)}
                      language="typescript"
                    />
                  ) : (
                    <span css={{ color: 'var(--color-foreground-secondary)' }}>
                      &mdash;
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

/** Renders a link to a reference type e.g. `Languages` in `{ language: Languages }` */
function ReferenceKind() {
  const prop = getAPIReferenceType()

  if (prop?.kind !== 'Reference') {
    throw new Error(
      '[renoun] PropsTable only supports object types. Use TypeProperties for other types.'
    )
  }

  return null
}

/** Renders a utility type reference e.g. React.SVGProps<SVGSVGElement> */
function UtilityReferenceKind() {
  const prop = getAPIReferenceType()
  const { CodeInline } = getAPIReferenceConfig()

  if (prop?.kind !== 'UtilityReference') {
    throw new Error(
      '[renoun] PropsTable only supports object types. Use TypeProperties for other types.'
    )
  }

  return (
    <div
      css={{
        gridColumn: '1 / -1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'start',
        gap: '1rem',
      }}
    >
      <h3 css={{ fontSize: '1rem' }}>Inherited Props</h3>
      <CodeInline children={prop.text} language="typescript" />
    </div>
  )
}
