import React, { Suspense } from 'react'
import { dirname, resolve } from 'node:path'

import {
  JavaScriptFile,
  type JavaScriptFileExport,
} from '../file-system/index.js'
import {
  type Kind,
  type SymbolFilter,
  type TypeOfKind,
} from '../utils/resolve-type.js'
import { Collapse } from './Collapse/index.js'
import { WorkingDirectoryContext } from './Context.js'

type ElementTags =
  | 'section'
  | 'div'
  | 'h3'
  | 'h4'
  | 'p'
  | 'code'
  | 'table'
  | 'thead'
  | 'tbody'
  | 'tr'
  | 'th'
  | 'td'

type ElementPropOverrides = {
  div: {
    'data-type'?: 'column' | 'row' | 'detail' | 'signatures'
    'data-gap'?: 'small' | 'medium' | 'large'
  }
  p: {
    'data-type'?: 'description'
  }
  tr: {
    'data-type'?: 'sub-row'
  }
}

type ElementProps<Tag extends ElementTags> =
  Tag extends keyof ElementPropOverrides
    ? React.ComponentProps<Tag> & ElementPropOverrides[Tag]
    : React.ComponentProps<Tag>

export type APIReferenceComponents = {
  [Tag in ElementTags]: Tag | React.ComponentType<ElementProps<Tag>>
}

const defaultComponents: APIReferenceComponents = {
  section: 'section',
  div: 'div',
  h3: 'h3',
  h4: 'h4',
  p: 'p',
  code: 'code',
  table: 'table',
  thead: 'thead',
  tbody: 'tbody',
  tr: (props) =>
    props['data-type'] === 'sub-row' ? (
      <Collapse.Content as="tr" {...props} />
    ) : (
      <tr {...props} />
    ),
  th: 'th',
  td: 'td',
}

export interface APIReferenceProps {
  /** The file path, `JavaScriptFile`, or `JavaScriptFileExport` type reference to resolve. */
  source: string | JavaScriptFile<any> | JavaScriptFileExport<any>

  /** Optional filter for exported symbols. */
  filter?: SymbolFilter

  /** Base directory for relative `source` values. */
  baseDirectory?: string

  /** Override default component renderers. */
  components?: Partial<APIReferenceComponents>
}

// TODO: add badges like rendering environment, deprecation, unstable, overloaded etc.
// TODO: remove data attributes and use specific components from component prop instead Block, Inline, Detail, Signatures, Collapse, etc. this way props are typed for each component
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
  baseDirectory,
  components = {},
}: APIReferenceProps) {
  let filePath: string | undefined = undefined

  if (typeof source === 'string') {
    if (baseDirectory) {
      if (URL.canParse(baseDirectory)) {
        const { pathname } = new URL(baseDirectory)
        baseDirectory = pathname.slice(0, pathname.lastIndexOf('/'))
      }
      filePath = resolve(baseDirectory, source)
    } else {
      filePath = source
    }
    source = new JavaScriptFile({ path: filePath })
  }

  let resolvedType: Kind.All | Kind.All[] | undefined

  if (source instanceof JavaScriptFile) {
    const exported = await Promise.all(
      (await source.getExports()).map((fileExport) =>
        fileExport.getType(filter)
      )
    )
    resolvedType = exported.filter(Boolean) as Kind.All[]
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
      {Array.isArray(resolvedType) ? (
        resolvedType.map((type, index) => (
          <TypeNodeRouter
            key={index}
            node={type}
            components={mergedComponents}
          />
        ))
      ) : (
        <TypeNodeRouter node={resolvedType} components={mergedComponents} />
      )}
    </WorkingDirectoryContext>
  )
}

function TypeNodeRouter({
  node,
  components,
}: {
  node: Kind.All
  components: APIReferenceComponents
}) {
  switch (node.kind) {
    case 'Class':
      return <ClassSection node={node} components={components} />
    case 'Component':
      return <ComponentSection node={node} components={components} />
    case 'Function':
      return <FunctionSection node={node} components={components} />
    case 'Interface':
      return <MembersSection node={node} components={components} />
    case 'TypeAlias':
      if (node.type.kind === 'TypeLiteral') {
        return (
          <MembersSection
            node={node as Kind.TypeAlias<Kind.TypeLiteral>}
            components={components}
          />
        )
      }
      return <TypeAliasSection node={node} components={components} />
    case 'MappedType':
      return <MappedSection node={node} components={components} />
    case 'IntersectionType':
      return <IntersectionSection node={node} components={components} />
    case 'UnionType':
    case 'Array':
    case 'Tuple':
    case 'TypeLiteral':
    case 'TypeReference':
    case 'String':
    case 'Number':
    case 'Boolean':
    case 'Symbol':
    case 'Any':
    case 'Unknown':
      return <TypeExpressionSection node={node} components={components} />
    default:
      throw new Error(
        `[renoun]: A render does not currently exist for type kind "${node.kind}". Please file an issue if you see this error.`
      )
  }
}

function TypeSection({
  label,
  title,
  description,
  id,
  children,
  components,
}: {
  label: string
  title?: string
  description?: string
  id?: string
  children: React.ReactNode
  components: APIReferenceComponents
}) {
  return (
    <Collapse.Provider>
      <components.section id={id}>
        <components.h3 aria-label={`${title} ${label}`}>
          <span>{label}</span> {title}
        </components.h3>
        <Collapse.Content>
          {description ? (
            <components.div data-type="column" data-gap="large">
              <components.p data-type="description">{description}</components.p>
              {children}
            </components.div>
          ) : (
            children
          )}
        </Collapse.Content>
      </components.section>
    </Collapse.Provider>
  )
}

function TypeDetail({
  label,
  children,
  components,
}: {
  label?: React.ReactNode
  children: React.ReactNode
  components: APIReferenceComponents
}) {
  return (
    <components.div data-type="detail">
      {label ? <components.h4>{label}</components.h4> : null}
      {children}
    </components.div>
  )
}

function TypeTable<RowType>({
  rows,
  headers,
  renderRow,
  renderSubRow,
  components,
}: {
  rows: readonly RowType[]
  headers?: readonly React.ReactNode[]
  renderRow: (row: RowType, index: number) => React.ReactNode
  renderSubRow?: (row: RowType, index: number) => React.ReactNode
  components: APIReferenceComponents
}) {
  return (
    <components.table>
      {headers ? (
        <components.thead>
          <components.tr>
            {headers.map((header, index) => (
              <components.th key={index}>{header}</components.th>
            ))}
          </components.tr>
        </components.thead>
      ) : null}

      <components.tbody>
        {rows.map((row, index) => {
          const subRow = renderSubRow?.(row, index)

          return (
            <Collapse.Provider key={index}>
              <components.tr>{renderRow(row, index)}</components.tr>
              {subRow ? (
                <components.tr data-type="sub-row">
                  <components.td colSpan={3}>{subRow}</components.td>
                </components.tr>
              ) : null}
            </Collapse.Provider>
          )
        })}
      </components.tbody>
    </components.table>
  )
}

function renderClassPropertyRow(
  property: NonNullable<TypeOfKind<'Class'>['properties']>[number],
  components: APIReferenceComponents
) {
  return (
    <>
      <components.td>
        {property.name}
        {property.isOptional ? '?' : ''}
      </components.td>
      <components.td>
        <components.code>{property.text}</components.code>
      </components.td>
      <components.td>
        <InitializerValue
          initializer={property.initializer}
          components={components}
        />
      </components.td>
    </>
  )
}

function renderMethodRow(
  method: NonNullable<TypeOfKind<'Class'>['methods']>[number],
  components: APIReferenceComponents
) {
  const signature = method.signatures[0]

  return (
    <>
      <components.td>{method.name}</components.td>
      <components.td colSpan={2}>
        <components.code>{signature.text}</components.code>
      </components.td>
    </>
  )
}

function renderMethodSubRow(
  method: NonNullable<TypeOfKind<'Class'>['methods']>[number],
  components: APIReferenceComponents
) {
  // TODO: Handle multiple signatures
  const signature = method.signatures[0]

  return (
    <>
      {signature.parameters.length ? (
        <TypeDetail components={components}>
          <TypeTable
            rows={signature.parameters}
            headers={['Parameter', 'Type', 'Default Value']}
            renderRow={(parameter) => renderParameterRow(parameter, components)}
            components={components}
          />
        </TypeDetail>
      ) : null}

      {signature.returnType ? (
        <TypeDetail components={components}>
          <components.code>{signature.returnType.text}</components.code>
        </TypeDetail>
      ) : null}
    </>
  )
}

function ClassSection({
  node,
  components,
}: {
  node: TypeOfKind<'Class'>
  components: APIReferenceComponents
}) {
  return (
    <TypeSection
      label="Class"
      title={node.name}
      description={node.description}
      id={node.name}
      components={components}
    >
      {node.properties?.length ? (
        <TypeDetail label="Properties" components={components}>
          <TypeTable
            rows={node.properties}
            headers={['Property', 'Type', 'Default Value']}
            renderRow={(property) =>
              renderClassPropertyRow(property, components)
            }
            components={components}
          />
        </TypeDetail>
      ) : null}

      {node.methods?.length ? (
        <TypeDetail label="Methods" components={components}>
          <TypeTable
            rows={node.methods}
            headers={['Method', 'Type']}
            renderRow={(method) => renderMethodRow(method, components)}
            renderSubRow={(method) => renderMethodSubRow(method, components)}
            components={components}
          />
        </TypeDetail>
      ) : null}

      {node.extends || node.implements?.length ? (
        <TypeDetail components={components}>
          {node.extends ? (
            <components.div data-type="column" data-gap="medium">
              <components.h4>Extends</components.h4>
              <components.code>{node.extends.text}</components.code>
            </components.div>
          ) : null}

          {node.implements?.length ? (
            <components.div data-type="column" data-gap="medium">
              <components.h4>Implements</components.h4>
              {node.implements.map((implementation, index) => (
                <React.Fragment key={index}>
                  {index > 0 ? ', ' : null}
                  <components.code>{implementation.text}</components.code>
                </React.Fragment>
              ))}
            </components.div>
          ) : null}
        </TypeDetail>
      ) : null}
    </TypeSection>
  )
}

function ComponentSection({
  node,
  components,
}: {
  node: TypeOfKind<'Component'>
  components: APIReferenceComponents
}) {
  return (
    <TypeSection
      label="Component"
      title={node.name}
      description={node.description}
      id={node.name}
      components={components}
    >
      <components.div data-type="signatures">
        {node.signatures.map((signature, index) => {
          return (
            <components.div data-type="column" data-gap="large" key={index}>
              <TypeDetail label="Properties" components={components}>
                {signature.parameter?.kind === 'TypeLiteral' ? (
                  <TypeTable
                    rows={signature.parameter.members}
                    headers={['Property', 'Type', 'Default Value']}
                    renderRow={(property) =>
                      property.kind === 'PropertySignature' ? (
                        <>
                          <components.td>
                            {property.name}
                            {property.isOptional ? '?' : ''}
                          </components.td>
                          <components.td>
                            <components.code>{property.text}</components.code>
                          </components.td>
                          <components.td>
                            {/* TODO: immediate type literals should have an initializer e.g. function Button({ variant = 'outline' }: { variant: 'fill' | 'outline' }) {}, this could be a special ImmediateTypeLiteral/Object kind that provides it. */}
                            {/* <InitializerValue
                          value={property.initializer}
                          components={components}
                        /> */}
                          </components.td>
                        </>
                      ) : (
                        <components.td colSpan={3}>
                          <components.code>{property.text}</components.code>
                        </components.td>
                      )
                    }
                    components={components}
                  />
                ) : (
                  <components.code>
                    {signature.parameter?.text ?? '—'}
                  </components.code>
                )}
              </TypeDetail>
            </components.div>
          )
        })}
      </components.div>
    </TypeSection>
  )
}

function renderParameterRow(
  parameter: TypeOfKind<'Parameter'>,
  components: APIReferenceComponents
) {
  return (
    <>
      <components.td>
        {parameter.name}
        {parameter.isOptional ? '?' : ''}
      </components.td>
      <components.td>
        <components.code>{parameter.text}</components.code>
      </components.td>
      <components.td>
        <InitializerValue
          initializer={parameter.initializer}
          components={components}
        />
      </components.td>
    </>
  )
}

function FunctionSection({
  node,
  components,
}: {
  node: TypeOfKind<'Function'>
  components: APIReferenceComponents
}) {
  return (
    <TypeSection
      label="Function"
      title={node.name}
      description={node.description}
      id={node.name}
      components={components}
    >
      <components.div data-type="signatures">
        {node.signatures.map((signature, index) => (
          <components.div key={index} data-type="column" data-gap="large">
            {signature.parameters.length > 0 ? (
              <TypeDetail label="Parameters" components={components}>
                <TypeTable
                  rows={signature.parameters}
                  headers={['Parameter', 'Type', 'Default Value']}
                  renderRow={(param) => renderParameterRow(param, components)}
                  components={components}
                />
              </TypeDetail>
            ) : null}

            {signature.returnType ? (
              <TypeDetail label="Returns" components={components}>
                <components.code>{signature.returnType.text}</components.code>
              </TypeDetail>
            ) : null}
          </components.div>
        ))}
      </components.div>
    </TypeSection>
  )
}

function TypeAliasSection({
  node,
  components,
}: {
  node: TypeOfKind<'TypeAlias'>
  components: APIReferenceComponents
}) {
  return (
    <TypeSection
      label={kindToLabel(node.type.kind)}
      title={node.name}
      description={node.description}
      id={node.name}
      components={components}
    >
      <TypeDetail label="Type" components={components}>
        <components.code>{node.text}</components.code>
      </TypeDetail>
    </TypeSection>
  )
}

function MembersSection({
  node,
  components,
}: {
  node: Kind.Interface | Kind.TypeAlias<Kind.TypeLiteral>
  components: APIReferenceComponents
}) {
  const members = node.kind === 'Interface' ? node.members : node.type.members
  let propertySignatures: Kind.PropertySignature[] = []
  let methodSignatures: Kind.MethodSignature[] = []
  let indexSignatures: Kind.IndexSignature[] = []

  for (const member of members) {
    if (member.kind === 'PropertySignature') {
      propertySignatures.push(member)
    } else if (member.kind === 'MethodSignature') {
      methodSignatures.push(member)
    } else if (member.kind === 'IndexSignature') {
      indexSignatures.push(member)
    } else {
      console.warn(
        `[renoun] Unsupported member kind "${member.kind}" in ${node.kind} "${node.name}"`
      )
    }
  }

  return (
    <TypeSection
      label={node.kind === 'Interface' ? 'Interface' : 'Type Literal'}
      title={node.name}
      description={node.description}
      id={node.name}
      components={components}
    >
      {propertySignatures.length > 0 ? (
        <TypeDetail label="Properties" components={components}>
          <TypeTable
            rows={propertySignatures}
            headers={['Property', 'Type']}
            renderRow={(property) => (
              <>
                <components.td>
                  {property.name}
                  {property.isOptional ? '?' : ''}
                </components.td>
                <components.td colSpan={2}>
                  <components.code>{property.text}</components.code>
                </components.td>
              </>
            )}
            components={components}
          />
        </TypeDetail>
      ) : null}

      {methodSignatures.length > 0 ? (
        <TypeDetail label="Methods" components={components}>
          <TypeTable
            rows={methodSignatures}
            headers={['Method', 'Type']}
            renderRow={(method) => (
              <>
                <components.td>{method.name}</components.td>
                <components.td colSpan={2}>
                  <components.code>{method.text}</components.code>
                </components.td>
              </>
            )}
            components={components}
          />
        </TypeDetail>
      ) : null}

      {indexSignatures.length > 0 ? (
        <TypeDetail label="Index Signatures" components={components}>
          <TypeTable
            rows={indexSignatures}
            headers={['Key', 'Type']}
            renderRow={(indexSignature) => (
              <>
                <components.td>
                  <components.code>
                    {indexSignature.parameter.text}
                  </components.code>
                </components.td>
                <components.td colSpan={2}>
                  <components.code>{indexSignature.type.text}</components.code>
                </components.td>
              </>
            )}
            components={components}
          />
        </TypeDetail>
      ) : null}
    </TypeSection>
  )
}

function MappedSection({
  node,
  components,
}: {
  node: TypeOfKind<'MappedType'>
  components: APIReferenceComponents
}) {
  const parameterText = `${node.parameter.name} in ${node.parameter.constraint?.text ?? '?'}`
  const valueText = node.type.text

  // TODO: this needs an incoming name prop that will be provided by the enclosing declaration
  return (
    <TypeSection
      label="Mapped Type"
      title="-"
      id="mapped-type"
      components={components}
    >
      <TypeDetail label="Parameter" components={components}>
        <components.code>{parameterText}</components.code>
      </TypeDetail>
      <TypeDetail label="Type" components={components}>
        <components.code>{valueText}</components.code>
      </TypeDetail>
      <TypeDetail label="Modifiers" components={components}>
        <components.code>
          {node.isReadonly ? 'readonly ' : null}
          {node.isOptional ? 'optional' : null}
          {!node.isReadonly && !node.isOptional ? '—' : null}
        </components.code>
      </TypeDetail>
    </TypeSection>
  )
}

function IntersectionSection({
  node,
  components,
}: {
  node: TypeOfKind<'IntersectionType'>
  components: APIReferenceComponents
}) {
  // Flatten into one table if every member is either an TypeLiteral or a MappedType kind
  if (
    node.types.length > 1 &&
    node.types.every(
      (type) => type.kind === 'TypeLiteral' || type.kind === 'MappedType'
    )
  ) {
    const rows: {
      name: string
      text: string
      defaultValue?: unknown
      isOptional?: boolean
      isReadonly?: boolean
    }[] = []

    for (const type of node.types) {
      if (type.kind === 'TypeLiteral') {
        for (const member of type.members) {
          if (member.kind === 'PropertySignature') {
            rows.push({
              name: member.name!,
              text: member.type.text,
              isOptional: member.isOptional,
              isReadonly: member.isReadonly,
            })
          } else if (member.kind === 'IndexSignature') {
            rows.push({
              name: member.parameter.name,
              text: member.type.text,
              isReadonly: member.isReadonly,
            })
          } else {
            console.warn(
              `[renoun] Unsupported member kind "${member.kind}" in TypeLiteral`
            )
          }
        }
      } else if (type.kind === 'MappedType') {
        rows.push({
          name: type.parameter.text,
          text: type.type.text,
          isOptional: type.isOptional,
          isReadonly: type.isReadonly,
        })
      }
    }

    // TODO: this needs an incoming name prop that will be provided by the enclosing declaration
    return (
      <TypeSection
        label="Type Literal"
        title="-"
        id="Type Literal"
        components={components}
      >
        <TypeDetail label="Properties" components={components}>
          <TypeTable
            rows={rows}
            headers={['Property', 'Type']}
            renderRow={(r) => (
              <>
                <components.td>
                  {r.name}
                  {r.isOptional ? '?' : ''}
                </components.td>
                <components.td colSpan={2}>
                  <components.code>{r.text}</components.code>
                </components.td>
              </>
            )}
            components={components}
          />
        </TypeDetail>
      </TypeSection>
    )
  }

  // TODO: this needs an incoming name prop that will be provided by the enclosing declaration
  return (
    <TypeSection
      label="Intersection"
      title="-"
      id="Intersection"
      components={components}
    >
      <div data-type="column" data-gap="medium">
        {node.types.map((type, index) => (
          <div key={index} data-type="row" data-gap="small">
            <TypeNodeRouter node={type} components={components} />
          </div>
        ))}
      </div>
    </TypeSection>
  )
}

function TypeExpressionSection({
  node,
  components,
}: {
  node: Kind.TypeExpression
  components: APIReferenceComponents
}) {
  const label = kindToLabel(node.kind)

  return (
    <TypeSection label={label} title={'-'} components={components}>
      <TypeDetail label="Type" components={components}>
        <components.code>{node.text}</components.code>
      </TypeDetail>
    </TypeSection>
  )
}

function InitializerValue({
  initializer,
  components,
}: {
  initializer: unknown | undefined
  components: APIReferenceComponents
}) {
  if (initializer === undefined) {
    return '—'
  }

  const valueType = typeof initializer
  let valueString: string | undefined = undefined

  if (
    valueType === 'string' ||
    valueType === 'number' ||
    valueType === 'boolean'
  ) {
    valueString = String(initializer)
  } else {
    try {
      valueString = JSON.stringify(initializer)
    } catch {
      valueString = String(initializer)
    }
  }

  return <components.code>{valueString}</components.code>
}

/** Convert kind name from PascalCase to space separated label. */
function kindToLabel(kind: string): string {
  return kind.replace(/([a-z])([A-Z])/g, '$1 $2')
}
