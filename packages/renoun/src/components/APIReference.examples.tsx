/** @jsxImportSource restyle */
import React from 'react'
import {
  APIReference,
  CodeBlock,
  CodeInline,
  Markdown,
  getTypeReference,
  getTypeReferenceComponents,
  parseCodeProps,
  parsePreProps,
} from 'renoun/components'
import { rehypePlugins, remarkPlugins } from 'renoun/mdx'
import type { TypeOfKind } from 'renoun/utils'

export function Table() {
  return (
    <div css={{ width: '100%' }}>
      <APIReference
        source="./examples/Button.tsx"
        workingDirectory={import.meta.url}
        components={{
          Markdown: (props) => (
            <Markdown
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
        <DocumentationNodeRouter />
      </APIReference>
    </div>
  )
}

const theme = {
  color: {
    text: '#000',
    textMuted: '#737373',
    border: '#e5e5e5',
    borderDark: '#2a2a2a',
    hover: 'rgba(0,0,0,0.04)',
    hoverDark: 'rgba(255,255,255,0.05)',
  },
  font: {
    body: { fontSize: 14 },
    heading: { fontSize: 20, fontWeight: 600 },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 24,
    xl: 32,
    sectionGap: 96,
  },
} as const

export function DocumentationNodeRouter() {
  const node = getTypeReference()

  if (node === null) {
    return null
  }

  const components = getTypeReferenceComponents()

  switch (node.kind) {
    case 'Component':
      return <ComponentSection node={node} components={components} />
    case 'Object':
      return <ObjectSection node={node} components={components} />
    case 'Union':
      return <UnionSection node={node} />
    case 'Function':
      return <FunctionSection node={node} components={components} />
    case 'Class':
      return <ClassSection node={node} components={components} />
    default:
      return null
  }
}

function ArrowIcon({
  open: isOpen,
  hovered: isHovered,
  ...svgProperties
}: {
  open: boolean
  hovered?: boolean
} & React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 10 10"
      css={{
        width: 10,
        height: 10,
        transition: 'transform 150ms, opacity 150ms',
        transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
        opacity: isHovered || isOpen ? 1 : 0,
        flexShrink: 0,
      }}
      {...svgProperties}
    >
      <path d="M2 1 L8 5 L2 9 Z" fill="currentColor" />
    </svg>
  )
}

function Section({
  label,
  id,
  children,
}: {
  label: string
  id?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      css={{
        containerType: 'inline-size',
        marginTop: theme.spacing.sectionGap,
        paddingBottom: theme.spacing.xl,
        borderBottom: `1px solid ${theme.color.border}`,
        ':first-of-type': {
          marginTop: 0,
        },
        '@media (prefers-color-scheme: dark)': {
          borderBottom: `1px solid ${theme.color.borderDark}`,
        },
      }}
    >
      <p
        css={{
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontSize: 12,
          color: theme.color.textMuted,
          marginBottom: theme.spacing.sm,
        }}
      >
        {label}
      </p>
      {children}
    </section>
  )
}

function DefinitionGrid({
  label,
  children,
}: {
  label: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      css={{
        display: 'grid',
        gridTemplateColumns: '12rem minmax(0, 1fr)',
        columnGap: theme.spacing.lg,
        rowGap: theme.spacing.xs,
        fontSize: theme.font.body.fontSize,
        marginBottom: theme.spacing.md,
        '@container (max-width: 600px)': {
          gridTemplateColumns: '1fr',
          rowGap: theme.spacing.sm,
        },
      }}
    >
      <h3>{label}</h3>
      <div>{children}</div>
    </div>
  )
}

function DataTable<RowType>({
  rows,
  headers,
  renderRow,
}: {
  rows: readonly RowType[]
  headers?: readonly React.ReactNode[]
  renderRow: (row: RowType, index: number) => React.ReactNode
}) {
  return (
    <table
      css={{
        width: '100%',
        fontSize: theme.font.body.fontSize,
        borderBottom: `1px solid ${theme.color.border}`,
        '@media (prefers-color-scheme: dark)': {
          borderBottom: `1px solid ${theme.color.borderDark}`,
        },
      }}
    >
      {headers && (
        <thead>
          <tr
            css={{
              borderBottom: `1px solid ${theme.color.border}`,
              '@media (prefers-color-scheme: dark)': {
                borderBottom: `1px solid ${theme.color.borderDark}`,
              },
            }}
          >
            {headers.map(function renderHeader(header, index) {
              return (
                <th
                  key={index}
                  css={{
                    textAlign: index === headers.length - 1 ? 'right' : 'left',
                    fontWeight: 500,
                    padding: `${theme.spacing.sm}px 0`,
                    color: theme.color.textMuted,
                  }}
                >
                  {header}
                </th>
              )
            })}
          </tr>
        </thead>
      )}

      <tbody>
        {rows.map(function renderBodyRow(row, index) {
          return (
            <tr
              key={index}
              css={{
                borderBottom:
                  index === rows.length - 1
                    ? 'none'
                    : `1px solid ${theme.color.border}`,
                '@media (prefers-color-scheme: dark)': {
                  borderBottom:
                    index === rows.length - 1
                      ? 'none'
                      : `1px solid ${theme.color.borderDark}`,
                },
              }}
            >
              {renderRow(row, index)}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Disclosure({
  summary,
  children,
}: {
  summary: React.ReactNode
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [isHovered, setIsHovered] = React.useState(false)

  return (
    <div
      onMouseEnter={function handleMouseEnter() {
        setIsHovered(true)
      }}
      onMouseLeave={function handleMouseLeave() {
        setIsHovered(false)
      }}
    >
      <button
        aria-expanded={isOpen}
        onClick={function handleToggle() {
          setIsOpen((previousValue) => !previousValue)
        }}
        css={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'none',
          border: 'none',
          padding: `${theme.spacing.sm}px ${theme.spacing.sm}px`,
          fontSize: theme.font.body.fontSize,
          textAlign: 'left',
          cursor: 'pointer',
          ':hover': { background: theme.color.hover },
          '@media (prefers-color-scheme: dark)': {
            ':hover': { background: theme.color.hoverDark },
          },
        }}
      >
        <span>{summary}</span>
        <ArrowIcon open={isOpen} hovered={isHovered} />
      </button>
      {isOpen && <div css={{ paddingLeft: theme.spacing.lg }}>{children}</div>}
    </div>
  )
}

type ComponentsType = ReturnType<typeof getTypeReferenceComponents>

function ComponentSection({
  node,
  components,
}: {
  node: TypeOfKind<'Component'>
  components: ComponentsType
}) {
  return (
    <Section label="component" id={node.name}>
      <h2 css={{ ...theme.font.heading, marginBottom: theme.spacing.xl }}>
        {node.name}
      </h2>
      <DefinitionGrid label="Properties">
        <components.CodeInline>
          {node.signatures[0]?.parameter?.text ?? '—'}
        </components.CodeInline>
      </DefinitionGrid>
    </Section>
  )
}

function ObjectSection({
  node,
  components,
}: {
  node: TypeOfKind<'Object'>
  components: ComponentsType
}) {
  return (
    <Section label="object" id={node.name}>
      <h2 css={{ ...theme.font.heading, marginBottom: theme.spacing.xl }}>
        {node.name}
      </h2>

      <DefinitionGrid label="Properties">
        <DataTable
          rows={node.properties}
          headers={['Property', 'Type', 'Default Value']}
          renderRow={function renderRow(property) {
            return (
              <>
                <td
                  css={{
                    padding: `${theme.spacing.sm}px ${theme.spacing.lg}px`,
                    whiteSpace: 'nowrap',
                    verticalAlign: 'top',
                  }}
                >
                  {property.name}
                  {property.isOptional ? '?' : ''}
                </td>
                <td css={{ padding: theme.spacing.sm }}>
                  <components.CodeInline>{property.text}</components.CodeInline>
                </td>
                <td
                  css={{
                    padding: theme.spacing.sm,
                    textAlign: 'right',
                    color: theme.color.textMuted,
                  }}
                >
                  <DefaultValue
                    value={property.defaultValue}
                    components={components}
                  />
                </td>
              </>
            )
          }}
        />

        {node.indexSignatures?.length && (
          <>
            <h4
              css={{
                fontWeight: 500,
                marginTop: theme.spacing.lg,
                marginBottom: theme.spacing.xs,
              }}
            >
              Additional properties
            </h4>
            {node.indexSignatures.map(
              function renderIndexSignature(signature, index) {
                return (
                  <components.CodeInline key={index}>
                    {[signature.key.text, signature.value.text].join(': ')}
                  </components.CodeInline>
                )
              }
            )}
          </>
        )}
      </DefinitionGrid>
    </Section>
  )
}

function UnionSection({ node }: { node: TypeOfKind<'Union'> }) {
  return (
    <Section label="union" id={node.name}>
      <h2 css={{ ...theme.font.heading, marginBottom: theme.spacing.xl }}>
        {node.name}
      </h2>
      <DefinitionGrid label="Members">
        {node.members.map(function renderMember(member, index) {
          return (
            <React.Fragment key={index}>
              {index > 0 && ' | '}
              <code>{member.text}</code>
            </React.Fragment>
          )
        })}
      </DefinitionGrid>
    </Section>
  )
}

function renderParameterRow(
  parameter: TypeOfKind<'Function'>['signatures'][0]['parameters'][number],
  index: number,
  components: ComponentsType
) {
  return (
    <>
      <td
        css={{
          padding: `${theme.spacing.sm}px ${theme.spacing.lg}px`,
          whiteSpace: 'nowrap',
          verticalAlign: 'top',
        }}
      >
        {parameter.name}
        {parameter.isOptional ? '?' : ''}
      </td>
      <td css={{ padding: theme.spacing.sm }}>
        <components.CodeInline>{parameter.text}</components.CodeInline>
      </td>
      <td
        css={{
          padding: theme.spacing.sm,
          textAlign: 'right',
          color: theme.color.textMuted,
        }}
      >
        <DefaultValue value={parameter.defaultValue} components={components} />
      </td>
    </>
  )
}

function FunctionSection({
  node,
  components,
}: {
  node: TypeOfKind<'Function'>
  components: ComponentsType
}) {
  const signature = node.signatures[0]

  return (
    <Section label="function" id={node.name}>
      <h2 css={{ ...theme.font.heading, marginBottom: theme.spacing.xl }}>
        {node.name}
      </h2>

      {signature.parameters.length > 0 && (
        <DefinitionGrid label="Parameters">
          <DataTable
            rows={signature.parameters}
            headers={['Parameter', 'Type', 'Default Value']}
            renderRow={function renderRow(parameter, index) {
              return renderParameterRow(parameter, index, components)
            }}
          />
        </DefinitionGrid>
      )}

      <DefinitionGrid label="Returns">
        <components.CodeInline>{signature.returnType}</components.CodeInline>
      </DefinitionGrid>
    </Section>
  )
}

function renderClassPropertyRow(
  property: NonNullable<TypeOfKind<'Class'>['properties']>[number],
  index: number,
  components: ComponentsType
) {
  return (
    <>
      <td
        css={{
          padding: `${theme.spacing.sm}px ${theme.spacing.lg}px`,
          whiteSpace: 'nowrap',
          verticalAlign: 'top',
        }}
      >
        {property.name}
        {property.isOptional ? '?' : ''}
      </td>
      <td css={{ padding: theme.spacing.sm }}>
        <components.CodeInline>{property.text}</components.CodeInline>
      </td>
      <td
        css={{
          padding: theme.spacing.sm,
          textAlign: 'right',
          color: theme.color.textMuted,
        }}
      >
        <DefaultValue value={property.defaultValue} components={components} />
      </td>
    </>
  )
}

function renderMethod(
  method: NonNullable<TypeOfKind<'Class'>['methods']>[number],
  components: ComponentsType
) {
  const signature = method.signatures[0]

  function renderMethodParameterRow(
    parameter: (typeof signature.parameters)[number],
    index: number
  ) {
    return renderParameterRow(parameter, index, components)
  }

  return (
    <Disclosure
      key={method.name}
      summary={<components.CodeInline>{signature.text}</components.CodeInline>}
    >
      {signature.parameters.length > 0 && (
        <DefinitionGrid label="Parameters">
          <DataTable
            rows={signature.parameters}
            headers={['Parameter', 'Type', 'Default Value']}
            renderRow={renderMethodParameterRow}
          />
        </DefinitionGrid>
      )}

      <DefinitionGrid label="Returns">
        <components.CodeInline>{signature.returnType}</components.CodeInline>
      </DefinitionGrid>
    </Disclosure>
  )
}

function ClassSection({
  node,
  components,
}: {
  node: TypeOfKind<'Class'>
  components: ComponentsType
}) {
  return (
    <Section label="class" id={node.name}>
      <h2 css={{ ...theme.font.heading, marginBottom: theme.spacing.xl }}>
        {node.name}
      </h2>

      {node.properties?.length && (
        <DefinitionGrid label="Properties">
          <DataTable
            rows={node.properties}
            headers={['Property', 'Type', 'Default Value']}
            renderRow={function renderRow(property, index) {
              return renderClassPropertyRow(property, index, components)
            }}
          />
        </DefinitionGrid>
      )}

      {node.methods?.length && (
        <DefinitionGrid label="Methods">
          {node.methods.map(function renderClassMethod(method) {
            return renderMethod(method, components)
          })}
        </DefinitionGrid>
      )}

      {(node.extends || node.implements?.length) && (
        <DefinitionGrid label="Heritage">
          {node.extends && (
            <div
              css={{
                display: 'flex',
                flexDirection: 'column',
                gap: theme.spacing.sm,
              }}
            >
              <h3
                css={{
                  fontWeight: 500,
                  marginBottom: theme.spacing.sm,
                  marginTop: theme.spacing.xl,
                }}
              >
                Extends
              </h3>
              <components.CodeInline>{node.extends.text}</components.CodeInline>
            </div>
          )}

          {node.implements?.length && (
            <div
              css={{
                display: 'flex',
                flexDirection: 'column',
                gap: theme.spacing.sm,
              }}
            >
              <h3
                css={{
                  fontWeight: 500,
                  marginBottom: theme.spacing.sm,
                  marginTop: theme.spacing.xl,
                }}
              >
                Implements
              </h3>
              {node.implements.map(
                function renderImplements(implemented, index) {
                  return (
                    <React.Fragment key={index}>
                      {index > 0 && ', '}
                      <components.CodeInline>
                        {implemented.text}
                      </components.CodeInline>
                    </React.Fragment>
                  )
                }
              )}
            </div>
          )}
        </DefinitionGrid>
      )}
    </Section>
  )
}

function DefaultValue({
  value,
  components,
}: {
  value: unknown
  components: ReturnType<typeof getTypeReferenceComponents>
}) {
  if (value === undefined) return <>—</>

  const valueType = typeof value
  if (
    valueType === 'string' ||
    valueType === 'number' ||
    valueType === 'boolean'
  ) {
    return <>{String(value)}</>
  }

  try {
    return (
      <components.CodeInline>{JSON.stringify(value)}</components.CodeInline>
    )
  } catch {
    return <components.CodeInline>{String(value)}</components.CodeInline>
  }
}
