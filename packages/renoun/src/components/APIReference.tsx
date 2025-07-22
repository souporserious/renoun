import React, { Suspense } from 'react'
import { dirname, resolve } from 'node:path'

import {
  JavaScriptFile,
  type JavaScriptFileExport,
} from '../file-system/index.js'
import {
  type Kind,
  type TypeFilter,
  type TypeOfKind,
} from '../utils/resolve-type.js'
import { WorkingDirectoryContext } from './Context.js'

export type APIReferenceComponents = {
  Section: React.ElementType
  SectionHeading: React.ElementType
  SectionBody: React.ComponentType<{
    hasDescription: boolean
    children: React.ReactNode
  }>
  Block: React.ComponentType<{
    gap?: 'small' | 'medium' | 'large'
    children: React.ReactNode
  }>
  Inline: React.ComponentType<{
    gap?: 'small' | 'medium' | 'large'
    children: React.ReactNode
  }>
  Code: React.ElementType
  Description: React.ElementType
  Detail: React.ElementType
  Signatures: React.ElementType
  DetailHeading: React.ElementType
  Table: React.ElementType
  TableHead: React.ElementType
  TableBody: React.ElementType
  TableRow: React.ElementType
  TableRowGroup: React.ComponentType<{
    hasSubRow: boolean
    children: React.ReactNode
  }>
  TableSubRow: React.ElementType
  TableHeader: React.ElementType
  TableData: React.ElementType
}

const defaultGaps = {
  small: '0.25rem',
  medium: '0.5rem',
  large: '2rem',
}

/** Default implementations for every slot. */
const defaultComponents: APIReferenceComponents = {
  Section: 'section',
  SectionHeading: 'h3',
  SectionBody: ({ children }) => children,
  Block: ({ gap, children }) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: gap ? defaultGaps[gap] : undefined,
      }}
      children={children}
    />
  ),
  Inline: ({ gap, children }) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: gap ? defaultGaps[gap] : undefined,
      }}
      children={children}
    />
  ),
  Code: 'code',
  Description: 'p',
  Detail: 'div',
  DetailHeading: 'h4',
  Signatures: 'div',
  Table: 'table',
  TableHead: 'thead',
  TableHeader: 'th',
  TableBody: 'tbody',
  TableData: 'td',
  TableRow: 'tr',
  TableSubRow: 'tr',
  TableRowGroup: ({ children }) => children,
}

export interface APIReferenceProps {
  /** The file path, `JavaScriptFile`, or `JavaScriptFileExport` type reference to resolve. */
  source: string | JavaScriptFile<any> | JavaScriptFileExport<any>

  /** Optional filter for including additional properties from referenced types. */
  filter?: TypeFilter

  /** Base directory for relative `source` values. */
  baseDirectory?: string

  /** Override default component renderers. */
  components?: Partial<APIReferenceComponents>
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

  let resolvedType: Kind | Kind[] | undefined

  if (source instanceof JavaScriptFile) {
    const exported = await Promise.all(
      (await source.getExports()).map((fileExport) =>
        fileExport.getType(filter)
      )
    )
    resolvedType = exported.filter(Boolean) as Kind[]
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
  const slug = source.getSlug()

  return (
    <WorkingDirectoryContext value={filePath ? dirname(filePath) : undefined}>
      {Array.isArray(resolvedType) ? (
        resolvedType.map((type, index) => (
          <TypeNodeRouter
            key={index}
            node={type}
            components={mergedComponents}
            slug={slug}
          />
        ))
      ) : (
        <TypeNodeRouter
          node={resolvedType}
          components={mergedComponents}
          slug={slug}
        />
      )}
    </WorkingDirectoryContext>
  )
}

function TypeNodeRouter({
  node,
  components,
  slug,
}: {
  node: Kind
  components: APIReferenceComponents
  slug: string
}) {
  switch (node.kind) {
    case 'Variable':
      return <VariableSection node={node} components={components} slug={slug} />
    case 'Class':
      return <ClassSection node={node} components={components} slug={slug} />
    case 'Component':
      return (
        <ComponentSection node={node} components={components} slug={slug} />
      )
    case 'Function':
      return <FunctionSection node={node} components={components} slug={slug} />
    case 'Interface':
      return <MembersSection node={node} components={components} slug={slug} />
    case 'TypeAlias':
      if (node.type.kind === 'TypeLiteral') {
        return (
          <MembersSection
            node={node as Kind.TypeAlias<Kind.TypeLiteral>}
            components={components}
            slug={slug}
          />
        )
      }
      return (
        <TypeAliasSection node={node} components={components} slug={slug} />
      )
    case 'MappedType':
      return <MappedSection node={node} components={components} slug={slug} />
    case 'IntersectionType':
      return (
        <IntersectionSection node={node} components={components} slug={slug} />
      )
    case 'UnionType':
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
    <components.Section id={id}>
      <components.SectionHeading aria-label={`${title} ${label}`}>
        <span>{label}</span> {title}
      </components.SectionHeading>
      <components.SectionBody hasDescription={!!description}>
        {description ? (
          <components.Block gap="large">
            <components.Description>{description}</components.Description>
            {children}
          </components.Block>
        ) : (
          children
        )}
      </components.SectionBody>
    </components.Section>
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
    <components.Detail>
      {label ? (
        <components.DetailHeading>{label}</components.DetailHeading>
      ) : null}
      {children}
    </components.Detail>
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
    <components.Table>
      {headers ? (
        <components.TableHead>
          <components.TableRow>
            {headers.map((header, index) => (
              <components.TableHeader key={index}>
                {header}
              </components.TableHeader>
            ))}
          </components.TableRow>
        </components.TableHead>
      ) : null}

      <components.TableBody>
        {rows.map((row, index) => {
          const subRow = renderSubRow?.(row, index)

          return (
            <components.TableRowGroup key={index} hasSubRow={!!subRow}>
              <components.TableRow>{renderRow(row, index)}</components.TableRow>
              {subRow ? (
                <components.TableSubRow>
                  <components.TableData colSpan={3}>
                    {subRow}
                  </components.TableData>
                </components.TableSubRow>
              ) : null}
            </components.TableRowGroup>
          )
        })}
      </components.TableBody>
    </components.Table>
  )
}

function VariableSection({
  node,
  components,
  slug,
}: {
  node: TypeOfKind<'Variable'>
  components: APIReferenceComponents
  slug: string
}) {
  return (
    <TypeSection
      label="Variable"
      title={node.name}
      description={node.description}
      id={slug}
      components={components}
    >
      <TypeDetail label="Type" components={components}>
        <components.Code>{node.text}</components.Code>
      </TypeDetail>
    </TypeSection>
  )
}

function renderClassPropertyRow(
  property: NonNullable<TypeOfKind<'Class'>['properties']>[number],
  components: APIReferenceComponents
) {
  return (
    <>
      <components.TableData>
        {property.name}
        {property.isOptional ? '?' : ''}
      </components.TableData>
      <components.TableData>
        <components.Code>{property.text}</components.Code>
      </components.TableData>
      <components.TableData>
        <InitializerValue
          initializer={property.initializer}
          components={components}
        />
      </components.TableData>
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
      <components.TableData>{method.name}</components.TableData>
      <components.TableData colSpan={2}>
        <components.Code>{signature.text}</components.Code>
      </components.TableData>
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
          <components.Code>{signature.returnType.text}</components.Code>
        </TypeDetail>
      ) : null}
    </>
  )
}

function ClassSection({
  node,
  components,
  slug,
}: {
  node: TypeOfKind<'Class'>
  components: APIReferenceComponents
  slug: string
}) {
  return (
    <TypeSection
      label="Class"
      title={node.name}
      description={node.description}
      id={slug}
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
            <components.Block gap="medium">
              <components.DetailHeading>Extends</components.DetailHeading>
              <components.Code>{node.extends.text}</components.Code>
            </components.Block>
          ) : null}

          {node.implements?.length ? (
            <components.Block gap="medium">
              <components.DetailHeading>Implements</components.DetailHeading>
              {node.implements.map((implementation, index) => (
                <React.Fragment key={index}>
                  {index > 0 ? ', ' : null}
                  <components.Code>{implementation.text}</components.Code>
                </React.Fragment>
              ))}
            </components.Block>
          ) : null}
        </TypeDetail>
      ) : null}
    </TypeSection>
  )
}

function ComponentSection({
  node,
  components,
  slug,
}: {
  node: TypeOfKind<'Component'>
  components: APIReferenceComponents
  slug: string
}) {
  return (
    <TypeSection
      label="Component"
      title={node.name}
      description={node.description}
      id={slug}
      components={components}
    >
      <components.Signatures>
        {node.signatures.map((signature, index) => {
          return (
            <components.Block gap="large" key={index}>
              <TypeDetail label="Properties" components={components}>
                {signature.parameter?.type.kind === 'TypeLiteral' ? (
                  <TypeTable
                    rows={signature.parameter.type.members}
                    headers={['Property', 'Type', 'Default Value']}
                    renderRow={(property) =>
                      property.kind === 'PropertySignature' ? (
                        <>
                          <components.TableData>
                            {property.name}
                            {property.isOptional ? '?' : ''}
                          </components.TableData>
                          <components.TableData>
                            <components.Code>
                              {property.type.text}
                            </components.Code>
                          </components.TableData>
                          <components.TableData>
                            {/* TODO: immediate type literals should have an initializer e.g. function Button({ variant = 'outline' }: { variant: 'fill' | 'outline' }) {}, this could be a special ImmediateTypeLiteral/Object kind that provides it. */}
                            {/* <InitializerValue
                          value={property.initializer}
                          components={components}
                        /> */}
                          </components.TableData>
                        </>
                      ) : (
                        <components.TableData colSpan={3}>
                          <components.Code>{property.text}</components.Code>
                        </components.TableData>
                      )
                    }
                    components={components}
                  />
                ) : (
                  <components.Code>
                    {getParameterText(signature.parameter)}
                  </components.Code>
                )}
              </TypeDetail>
            </components.Block>
          )
        })}
      </components.Signatures>
    </TypeSection>
  )
}

function renderParameterRow(
  parameter: TypeOfKind<'Parameter'>,
  components: APIReferenceComponents
) {
  return (
    <>
      <components.TableData>
        {parameter.name}
        {parameter.isOptional ? '?' : ''}
      </components.TableData>
      <components.TableData>
        <components.Code>{getParameterText(parameter)}</components.Code>
      </components.TableData>
      <components.TableData>
        <InitializerValue
          initializer={parameter.initializer}
          components={components}
        />
      </components.TableData>
    </>
  )
}

function FunctionSection({
  node,
  components,
  slug,
}: {
  node: TypeOfKind<'Function'>
  components: APIReferenceComponents
  slug: string
}) {
  return (
    <TypeSection
      label="Function"
      title={node.name}
      description={node.description}
      id={slug}
      components={components}
    >
      <components.Signatures>
        {node.signatures.map((signature, index) => (
          <components.Block key={index} gap="large">
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
                <components.Code>{signature.returnType.text}</components.Code>
              </TypeDetail>
            ) : null}
          </components.Block>
        ))}
      </components.Signatures>
    </TypeSection>
  )
}

function TypeAliasSection({
  node,
  components,
  slug,
}: {
  node: TypeOfKind<'TypeAlias'>
  components: APIReferenceComponents
  slug: string
}) {
  return (
    <TypeSection
      label={kindToLabel(node.type.kind)}
      title={node.name}
      description={node.description}
      id={slug}
      components={components}
    >
      <TypeDetail label="Type" components={components}>
        <components.Code>{node.text}</components.Code>
      </TypeDetail>
    </TypeSection>
  )
}

function MembersSection({
  node,
  components,
  slug,
}: {
  node: Kind.Interface | Kind.TypeAlias<Kind.TypeLiteral>
  components: APIReferenceComponents
  slug: string
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
      id={slug}
      components={components}
    >
      {propertySignatures.length > 0 ? (
        <TypeDetail label="Properties" components={components}>
          <TypeTable
            rows={propertySignatures}
            headers={['Property', 'Type']}
            renderRow={(property) => (
              <>
                <components.TableData>
                  {property.name}
                  {property.isOptional ? '?' : ''}
                </components.TableData>
                <components.TableData colSpan={2}>
                  <components.Code>{property.type.text}</components.Code>
                </components.TableData>
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
                <components.TableData>{method.name}</components.TableData>
                <components.TableData colSpan={2}>
                  <components.Code>{method.text}</components.Code>
                </components.TableData>
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
                <components.TableData>
                  <components.Code>
                    {indexSignature.parameter.text}
                  </components.Code>
                </components.TableData>
                <components.TableData colSpan={2}>
                  <components.Code>{indexSignature.type.text}</components.Code>
                </components.TableData>
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
  slug,
}: {
  node: TypeOfKind<'MappedType'>
  components: APIReferenceComponents
  slug: string
}) {
  const parameterText = `${node.typeParameter.name} in ${node.typeParameter.constraintType?.text ?? '?'}`
  const valueText = node.type.text

  // TODO: this needs an incoming name prop that will be provided by the enclosing declaration
  return (
    <TypeSection
      label="Mapped Type"
      title="-"
      id={slug}
      components={components}
    >
      <TypeDetail label="Parameter" components={components}>
        <components.Code>{parameterText}</components.Code>
      </TypeDetail>
      <TypeDetail label="Type" components={components}>
        <components.Code>{valueText}</components.Code>
      </TypeDetail>
      <TypeDetail label="Modifiers" components={components}>
        <components.Code>
          {node.isReadonly ? 'readonly ' : null}
          {node.isOptional ? 'optional' : null}
          {!node.isReadonly && !node.isOptional ? '—' : null}
        </components.Code>
      </TypeDetail>
    </TypeSection>
  )
}

function IntersectionSection({
  node,
  components,
  slug,
}: {
  node: TypeOfKind<'IntersectionType'>
  components: APIReferenceComponents
  slug: string
}) {
  // Flatten into one table if every member is either a TypeLiteral or a MappedType kind
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
          name: type.typeParameter.text,
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
        id={slug}
        components={components}
      >
        <TypeDetail label="Properties" components={components}>
          <TypeTable
            rows={rows}
            headers={['Property', 'Type']}
            renderRow={(r) => (
              <>
                <components.TableData>
                  {r.name}
                  {r.isOptional ? '?' : ''}
                </components.TableData>
                <components.TableData colSpan={2}>
                  <components.Code>{r.text}</components.Code>
                </components.TableData>
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
      id={slug}
      components={components}
    >
      <components.Block gap="medium">
        {node.types.map((type, index) => (
          <components.Inline key={index} gap="small">
            <TypeNodeRouter
              node={type}
              components={components}
              slug={`${slug}-${index}`}
            />
          </components.Inline>
        ))}
      </components.Block>
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
        <components.Code>{node.text}</components.Code>
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

  return <components.Code>{valueString}</components.Code>
}

/** Return the preferred text representation for a parameter. */
function getParameterText(parameter?: Kind.Parameter): string {
  if (!parameter) {
    return '—'
  }

  if (parameter.type.kind === 'TypeReference') {
    return parameter.type.name!
  }

  return parameter.text
}

/** Convert kind name from PascalCase to space separated label. */
function kindToLabel(kind: string): string {
  return kind.replace(/([a-z])([A-Z])/g, '$1 $2')
}
