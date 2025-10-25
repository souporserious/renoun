import React, { Suspense } from 'react'
import { dirname, resolve } from 'node:path'

import {
  JavaScriptFile,
  type JavaScriptModuleExport,
} from '../../file-system/index.js'
import {
  type Kind,
  type TypeFilter,
  type TypeOfKind,
} from '../../utils/resolve-type.js'
import { BaseDirectoryContext } from '../Context.js'

type GapSize = 'small' | 'medium' | 'large'

export interface ReferenceComponents {
  Section: React.ComponentType<{
    id?: string
    kind: Kind['kind']
    children?: React.ReactNode
  }>
  SectionHeading: React.ComponentType<{
    children?: React.ReactNode
    'aria-label'?: string
  }>
  SectionBody: React.ComponentType<{
    hasDescription: boolean
    children: React.ReactNode
  }>
  Column: React.ComponentType<{
    gap?: GapSize
    children: React.ReactNode
  }>
  Row: React.ComponentType<{
    gap?: GapSize
    children: React.ReactNode
  }>
  Code: React.ComponentType<{
    children?: React.ReactNode
  }>
  Description: React.ComponentType<{
    children: string
  }>
  Detail: React.ComponentType<{
    kind: Kind['kind']
    children: React.ReactNode
  }>
  Signatures: React.ComponentType<{
    children: React.ReactNode
  }>
  DetailHeading: React.ComponentType<{
    children?: React.ReactNode
  }>
  Table: React.ComponentType<{
    children?: React.ReactNode
  }>
  TableHead: React.ComponentType<{
    children?: React.ReactNode
  }>
  TableBody: React.ComponentType<{
    children?: React.ReactNode
  }>
  TableRowGroup: React.ComponentType<{
    hasSubRow?: boolean
    children?: React.ReactNode
  }>
  TableRow: React.ComponentType<{
    hasSubRow?: boolean
    children?: React.ReactNode
  }>
  TableSubRow: React.ComponentType<{
    children: React.ReactNode
  }>
  TableHeader: React.ComponentType<{
    children?: React.ReactNode
  }>
  TableData: React.ComponentType<{
    index: number
    hasSubRow?: boolean
    colSpan?: number
    children?: React.ReactNode
  }>
}

type InternalReferenceComponents = {
  [Key in keyof ReferenceComponents]: ReferenceComponents[Key] | string
}

const defaultGaps: Record<GapSize, string> = {
  small: '0.5rem',
  medium: '1rem',
  large: '2rem',
}

/** Default implementations for every slot. */
const defaultComponents: InternalReferenceComponents = {
  Section: ({ id, children }) => <section id={id} children={children} />,
  SectionHeading: 'h3',
  SectionBody: ({ children }) => children,
  Column: ({ gap, children }) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: gap ? defaultGaps[gap] : undefined,
      }}
      children={children}
    />
  ),
  Row: ({ gap, children }) => (
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
  TableHeader: ({ children }) => (
    <th style={{ textAlign: 'left' }}>{children}</th>
  ),
  TableBody: 'tbody',
  TableData: ({ colSpan, children }) => <td colSpan={colSpan}>{children}</td>,
  TableRow: ({ children }) => <tr>{children}</tr>,
  TableSubRow: ({ children }) => (
    <tr>
      <td colSpan={3}>{children}</td>
    </tr>
  ),
  TableRowGroup: ({ children }) => children,
}

export interface ReferenceProps {
  /** The file path, `JavaScriptFile`, or `JavaScriptModuleExport` type reference to resolve. */
  source: string | JavaScriptFile<any> | JavaScriptModuleExport<any>

  /** Optional filter for including additional properties from referenced types. */
  filter?: TypeFilter

  /** Base directory for relative `source` values. Passing `import.meta.url` will resolve the directory of the current file. */
  baseDirectory?: string

  /** Override default component renderers. */
  components?: Partial<ReferenceComponents>
}

/** Resolves TypeScript and JSDoc types from all module exports in a source file. */
export const Reference =
  process.env.NODE_ENV === 'development'
    ? ReferenceWithFallback
    : ReferenceAsync

function ReferenceWithFallback(props: ReferenceProps) {
  return (
    <Suspense>
      <ReferenceAsync {...props} />
    </Suspense>
  )
}

async function ReferenceAsync({
  source,
  filter,
  baseDirectory,
  components = {},
}: ReferenceProps) {
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

  const mergedComponents: InternalReferenceComponents = {
    ...defaultComponents,
    ...components,
  }
  function getSectionId(node: Kind) {
    if ('name' in node && node.name) {
      return node.name
    }

    return undefined
  }

  return (
    <BaseDirectoryContext value={filePath ? dirname(filePath) : undefined}>
      {Array.isArray(resolvedType) ? (
        resolvedType.map((type, index) => (
          <TypeNodeRouter
            key={index}
            node={type}
            components={mergedComponents}
            id={getSectionId(type)}
          />
        ))
      ) : (
        <TypeNodeRouter
          node={resolvedType}
          components={mergedComponents}
          id={getSectionId(resolvedType)}
        />
      )}
    </BaseDirectoryContext>
  )
}

function TypeNodeRouter({
  node,
  components,
  id,
}: {
  node: Kind
  components: InternalReferenceComponents
  id?: string
}) {
  switch (node.kind) {
    case 'Variable':
      return <VariableSection node={node} components={components} id={id} />
    case 'Class':
      return <ClassSection node={node} components={components} id={id} />
    case 'Component':
      return <ComponentSection node={node} components={components} id={id} />
    case 'Function':
      return <FunctionSection node={node} components={components} id={id} />
    case 'Interface':
      return <MembersSection node={node} components={components} id={id} />
    case 'TypeAlias':
      if (node.type.kind === 'TypeLiteral') {
        return (
          <MembersSection
            node={node as Kind.TypeAlias<Kind.TypeLiteral>}
            components={components}
            id={id}
          />
        )
      }
      if (node.type.kind === 'IntersectionType') {
        return (
          <IntersectionSection
            node={node.type}
            components={components}
            id={id}
            title={node.name}
          />
        )
      }
      return <TypeAliasSection node={node} components={components} id={id} />
    case 'MappedType':
      return <MappedSection node={node} components={components} id={id} />
    case 'IntersectionType':
      return <IntersectionSection node={node} components={components} id={id} />
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
  kind,
  title,
  description,
  id,
  children,
  components,
}: {
  kind: Kind['kind']
  title?: string
  description?: string
  id?: string
  children: React.ReactNode
  components: InternalReferenceComponents
}) {
  const label = kindToLabel(kind)

  return (
    <components.Section id={id} kind={kind}>
      <components.SectionHeading
        aria-label={title ? `${title} ${label}` : label}
      >
        <span>{label}</span> {title}
      </components.SectionHeading>
      <components.SectionBody hasDescription={Boolean(description)}>
        {description ? (
          <components.Column gap="medium">
            <components.Description>{description}</components.Description>
            {children}
          </components.Column>
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
  kind,
}: {
  label?: React.ReactNode
  children: React.ReactNode
  components: InternalReferenceComponents
  kind: Kind['kind']
}) {
  return (
    <components.Detail kind={kind}>
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
  renderRow: (row: RowType, hasSubRow: boolean) => React.ReactNode
  renderSubRow?: (row: RowType, index: number) => React.ReactNode
  components: InternalReferenceComponents
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
          const hasSubRow = Boolean(subRow)

          return (
            <components.TableRowGroup key={index} hasSubRow={hasSubRow}>
              <components.TableRow hasSubRow={hasSubRow}>
                {renderRow(row, hasSubRow)}
              </components.TableRow>
              {subRow ? (
                <components.TableSubRow>{subRow}</components.TableSubRow>
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
  id,
}: {
  node: TypeOfKind<'Variable'>
  components: InternalReferenceComponents
  id?: string
}) {
  return (
    <TypeSection
      kind="Variable"
      title={node.name}
      description={node.description}
      id={id}
      components={components}
    >
      <TypeDetail label="Type" components={components} kind={node.kind}>
        <components.Code>{node.text}</components.Code>
      </TypeDetail>
    </TypeSection>
  )
}

function renderClassPropertyRow(
  property: NonNullable<TypeOfKind<'Class'>['properties']>[number],
  components: InternalReferenceComponents,
  hasSubRow: boolean
) {
  return (
    <>
      <components.TableData index={0} hasSubRow={hasSubRow}>
        {property.name}
        {property.isOptional ? '?' : ''}
      </components.TableData>
      <components.TableData index={1} hasSubRow={hasSubRow}>
        <components.Code>{property.type.text}</components.Code>
      </components.TableData>
      <components.TableData index={2} hasSubRow={hasSubRow}>
        {renderClassMemberModifiers(property, components)}
      </components.TableData>
      <components.TableData index={3} hasSubRow={hasSubRow}>
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
  components: InternalReferenceComponents,
  hasSubRow: boolean
) {
  const signature = method.signatures[0]
  const overloadCount = method.signatures.length - 1

  if (!signature) {
    return null
  }

  return (
    <>
      <components.TableData index={0} hasSubRow={hasSubRow}>
        {method.name}
      </components.TableData>
      <components.TableData index={1} hasSubRow={hasSubRow}>
        <components.Code>
          {signature.text}
          {overloadCount > 0
            ? ` (+${overloadCount} overload${overloadCount > 1 ? 's' : ''})`
            : ''}
        </components.Code>
      </components.TableData>
      <components.TableData index={2} hasSubRow={hasSubRow}>
        {renderClassMemberModifiers(method, components)}
      </components.TableData>
    </>
  )
}

function renderMethodSubRow(
  method: NonNullable<TypeOfKind<'Class'>['methods']>[number],
  components: InternalReferenceComponents
) {
  const documentation = renderDocumentation(method, components)
  const multipleSignatures = method.signatures.length > 1
  const signatureDetails: React.ReactNode[] = []

  method.signatures.forEach((signature, index) => {
    const detail = renderCallSignatureDetails(signature, components, {
      heading: multipleSignatures ? `Overload ${index + 1}` : undefined,
      showSignatureText: multipleSignatures,
      parentDescription: method.description,
    })

    if (detail) {
      signatureDetails.push(
        <React.Fragment key={index}>{detail}</React.Fragment>
      )
    }
  })

  if (!documentation && signatureDetails.length === 0) {
    return null
  }

  return (
    <components.Column gap="large">
      {documentation}
      {signatureDetails}
    </components.Column>
  )
}

function renderClassPropertySubRow(
  property: NonNullable<TypeOfKind<'Class'>['properties']>[number],
  components: InternalReferenceComponents
) {
  return renderDocumentation(property, components)
}

function renderAccessorRow(
  accessor: NonNullable<TypeOfKind<'Class'>['accessors']>[number],
  components: InternalReferenceComponents,
  hasSubRow: boolean
) {
  const accessorTypeText =
    accessor.kind === 'ClassGetAccessor'
      ? accessor.returnType.text
      : accessor.parameter.type.text

  return (
    <>
      <components.TableData index={0} hasSubRow={hasSubRow}>
        {accessor.kind === 'ClassGetAccessor' ? 'get' : 'set'} {accessor.name}
      </components.TableData>
      <components.TableData index={1} hasSubRow={hasSubRow}>
        <components.Code>{accessorTypeText}</components.Code>
      </components.TableData>
      <components.TableData index={2} hasSubRow={hasSubRow}>
        {renderClassMemberModifiers(accessor, components)}
      </components.TableData>
    </>
  )
}

function renderAccessorSubRow(
  accessor: NonNullable<TypeOfKind<'Class'>['accessors']>[number],
  components: InternalReferenceComponents
) {
  const documentation = renderDocumentation(accessor, components)
  const parameterDetail =
    accessor.kind === 'ClassSetAccessor' ? (
      <TypeDetail
        label="Parameter"
        components={components}
        kind={accessor.kind}
      >
        <TypeTable
          rows={[accessor.parameter]}
          headers={['Parameter', 'Type', 'Default Value']}
          renderRow={(parameter, hasSubRow) =>
            renderParameterRow(parameter, components, hasSubRow)
          }
          components={components}
        />
      </TypeDetail>
    ) : null

  if (!documentation && !parameterDetail) {
    return null
  }

  return (
    <components.Column gap="medium">
      {documentation}
      {parameterDetail}
    </components.Column>
  )
}

function renderClassMemberModifiers(
  member:
    | NonNullable<TypeOfKind<'Class'>['accessors']>[number]
    | NonNullable<TypeOfKind<'Class'>['properties']>[number]
    | NonNullable<TypeOfKind<'Class'>['methods']>[number],
  components: InternalReferenceComponents
) {
  const modifiers: string[] = []

  if (member.visibility) {
    modifiers.push(member.visibility)
  }

  if (member.scope) {
    modifiers.push(member.scope)
  }

  if ('isReadonly' in member && member.isReadonly) {
    modifiers.push('readonly')
  }

  if ('isOverride' in member && member.isOverride) {
    modifiers.push('override')
  }

  if (modifiers.length === 0) {
    return <components.Code>—</components.Code>
  }

  return <components.Code>{modifiers.join(' ')}</components.Code>
}

function renderDocumentation(
  documentable: Pick<Kind.SharedDocumentable, 'description'>,
  components: InternalReferenceComponents
) {
  const items: React.ReactNode[] = []

  if (documentable.description) {
    items.push(
      <components.Description key="description">
        {documentable.description}
      </components.Description>
    )
  }

  if (items.length === 0) {
    return null
  }

  return <components.Column gap="medium">{items}</components.Column>
}

function renderCallSignatureDetails(
  signature: TypeOfKind<'CallSignature'>,
  components: InternalReferenceComponents,
  options: {
    heading?: string
    showSignatureText?: boolean
    parentDescription?: string
  } = {}
) {
  const items: React.ReactNode[] = []

  if (options.heading) {
    items.push(
      <components.DetailHeading key="heading">
        {options.heading}
      </components.DetailHeading>
    )
  }

  if (options.showSignatureText) {
    items.push(
      <components.Code key="signature-text">{signature.text}</components.Code>
    )
  }

  const shouldSkipDocumentation =
    options.parentDescription && signature.description
      ? signature.description.trim() === options.parentDescription.trim()
      : false

  const documentation = shouldSkipDocumentation
    ? null
    : renderDocumentation(signature, components)

  if (documentation) {
    items.push(
      <React.Fragment key="documentation">{documentation}</React.Fragment>
    )
  }

  if (signature.typeParameters?.length) {
    items.push(
      <TypeDetail
        key="generics"
        label="Type Parameters"
        components={components}
        kind={signature.kind}
      >
        <components.Column gap="small">
          {signature.typeParameters.map((typeParameter, index) => (
            <components.Code key={typeParameter.name ?? index}>
              {typeParameter.text}
            </components.Code>
          ))}
        </components.Column>
      </TypeDetail>
    )
  }

  if (signature.thisType) {
    items.push(
      <TypeDetail
        key="this"
        label="This Type"
        components={components}
        kind={signature.kind}
      >
        <components.Code>{signature.thisType.text}</components.Code>
      </TypeDetail>
    )
  }

  if (signature.parameters.length) {
    items.push(
      <TypeDetail
        key="parameters"
        label="Parameters"
        components={components}
        kind={signature.kind}
      >
        <TypeTable
          rows={signature.parameters}
          headers={['Parameter', 'Type', 'Default Value']}
          renderRow={(parameter, hasSubRow) =>
            renderParameterRow(parameter, components, hasSubRow)
          }
          components={components}
        />
      </TypeDetail>
    )
  }

  if (signature.returnType) {
    items.push(
      <TypeDetail
        key="returns"
        label="Returns"
        components={components}
        kind={signature.kind}
      >
        <components.Code>{signature.returnType.text}</components.Code>
      </TypeDetail>
    )
  }

  const signatureModifiers: string[] = []

  if (signature.isAsync) {
    signatureModifiers.push('async')
  }

  if (signature.isGenerator) {
    signatureModifiers.push('generator')
  }

  if (signatureModifiers.length) {
    items.push(
      <TypeDetail
        key="modifiers"
        label="Modifiers"
        components={components}
        kind={signature.kind}
      >
        <components.Code>{signatureModifiers.join(', ')}</components.Code>
      </TypeDetail>
    )
  }

  if (items.length === 0) {
    return null
  }

  return <components.Column gap="medium">{items}</components.Column>
}

function renderConstructorSignature(
  signature: TypeOfKind<'CallSignature'>,
  components: InternalReferenceComponents
) {
  const items: React.ReactNode[] = []

  // Signature line
  items.push(
    <components.Code key="signature-text">{signature.text}</components.Code>
  )

  // Parameters table (if any) without enclosing TypeDetail label
  if (signature.parameters.length) {
    items.push(
      <TypeTable
        key="parameters"
        rows={signature.parameters}
        headers={['Parameter', 'Type', 'Default Value']}
        renderRow={(parameter, hasSubRow) =>
          renderParameterRow(parameter, components, hasSubRow)
        }
        components={components}
      />
    )
  }

  // Any documentation or tags appear beneath.
  const documentation = renderDocumentation(signature, components)
  if (documentation) {
    items.push(
      <React.Fragment key="documentation">{documentation}</React.Fragment>
    )
  }

  // Modifiers (async, generator) shown last
  const modifiers: string[] = []
  if (signature.isAsync) modifiers.push('async')
  if (signature.isGenerator) modifiers.push('generator')
  if (modifiers.length) {
    items.push(
      <components.Code key="modifiers">{modifiers.join(' ')}</components.Code>
    )
  }

  return <components.Column gap="medium">{items}</components.Column>
}

function ClassSection({
  node,
  components,
  id,
}: {
  node: TypeOfKind<'Class'>
  components: InternalReferenceComponents
  id?: string
}) {
  return (
    <TypeSection
      kind="Class"
      title={node.name}
      description={node.description}
      id={id}
      components={components}
    >
      {node.constructor ? (
        <TypeDetail
          label="Constructor"
          components={components}
          kind="ClassConstructor"
        >
          {renderDocumentation(node.constructor, components)}
          <components.Signatures>
            {node.constructor.signatures.map((signature, index) => (
              <React.Fragment key={index}>
                {renderConstructorSignature(signature, components)}
              </React.Fragment>
            ))}
          </components.Signatures>
        </TypeDetail>
      ) : null}

      {node.accessors?.length ? (
        <TypeDetail label="Accessors" components={components} kind={node.kind}>
          <TypeTable
            rows={node.accessors}
            headers={['Accessor', 'Type', 'Modifiers']}
            renderRow={(accessor, hasSubRow) =>
              renderAccessorRow(accessor, components, hasSubRow)
            }
            renderSubRow={(accessor) =>
              renderAccessorSubRow(accessor, components)
            }
            components={components}
          />
        </TypeDetail>
      ) : null}

      {node.properties?.length ? (
        <TypeDetail label="Properties" components={components} kind={node.kind}>
          <TypeTable
            rows={node.properties}
            headers={['Property', 'Type', 'Modifiers', 'Default Value']}
            renderRow={(property, hasSubRow) =>
              renderClassPropertyRow(property, components, hasSubRow)
            }
            renderSubRow={(property) =>
              renderClassPropertySubRow(property, components)
            }
            components={components}
          />
        </TypeDetail>
      ) : null}

      {node.methods?.length ? (
        <TypeDetail label="Methods" components={components} kind={node.kind}>
          <TypeTable
            rows={node.methods}
            headers={['Method', 'Type', 'Modifiers']}
            renderRow={(method, hasSubRow) =>
              renderMethodRow(method, components, hasSubRow)
            }
            renderSubRow={(method) => renderMethodSubRow(method, components)}
            components={components}
          />
        </TypeDetail>
      ) : null}

      {node.extends || node.implements?.length ? (
        <TypeDetail components={components} kind={node.kind}>
          {node.extends ? (
            <components.Column gap="small">
              <components.DetailHeading>Extends</components.DetailHeading>
              <components.Code>{node.extends.text}</components.Code>
            </components.Column>
          ) : null}

          {node.implements?.length ? (
            <components.Column gap="small">
              <components.DetailHeading>Implements</components.DetailHeading>
              {node.implements.map((implementation, index) => (
                <React.Fragment key={index}>
                  {index > 0 ? ', ' : null}
                  <components.Code>{implementation.text}</components.Code>
                </React.Fragment>
              ))}
            </components.Column>
          ) : null}
        </TypeDetail>
      ) : null}
    </TypeSection>
  )
}

function ComponentSection({
  node,
  components,
  id,
}: {
  node: TypeOfKind<'Component'>
  components: InternalReferenceComponents
  id?: string
}) {
  return (
    <TypeSection
      kind="Component"
      title={node.name}
      description={node.description}
      id={id}
      components={components}
    >
      <components.Signatures>
        {node.signatures.map((signature, index) => {
          return (
            <components.Column gap="large" key={index}>
              <TypeDetail
                label="Properties"
                components={components}
                kind={node.kind}
              >
                {signature.parameter?.type.kind === 'TypeLiteral' ? (
                  <TypeTable
                    rows={signature.parameter.type.members}
                    headers={['Property', 'Type', 'Default Value']}
                    renderRow={(property, hasSubRow) =>
                      property.kind === 'PropertySignature' ? (
                        <>
                          <components.TableData index={0} hasSubRow={hasSubRow}>
                            {property.name}
                            {property.isOptional ? '?' : ''}
                          </components.TableData>
                          <components.TableData index={1} hasSubRow={hasSubRow}>
                            <components.Code>
                              {property.type.text}
                            </components.Code>
                          </components.TableData>
                          <components.TableData index={2} hasSubRow={hasSubRow}>
                            {/* TODO: immediate type literals should have an initializer e.g. function Button({ variant = 'outline' }: { variant: 'fill' | 'outline' }) {}, this could be a special ImmediateTypeLiteral/Object kind that provides it. */}
                            {/* <InitializerValue
                          value={property.initializer}
                          components={components}
                        /> */}
                          </components.TableData>
                        </>
                      ) : (
                        <components.TableData
                          index={0}
                          hasSubRow={hasSubRow}
                          colSpan={3}
                        >
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
            </components.Column>
          )
        })}
      </components.Signatures>
    </TypeSection>
  )
}

function renderParameterRow(
  parameter: TypeOfKind<'Parameter'>,
  components: InternalReferenceComponents,
  hasSubRow: boolean
) {
  return (
    <>
      <components.TableData index={0} hasSubRow={hasSubRow}>
        {parameter.name}
        {parameter.isOptional ? '?' : ''}
      </components.TableData>
      <components.TableData index={1} hasSubRow={hasSubRow}>
        <components.Code>{getParameterText(parameter)}</components.Code>
      </components.TableData>
      <components.TableData index={2} hasSubRow={hasSubRow}>
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
  id,
}: {
  node: TypeOfKind<'Function'>
  components: InternalReferenceComponents
  id?: string
}) {
  const multipleSignatures = node.signatures.length > 1

  return (
    <TypeSection
      kind="Function"
      title={node.name}
      description={node.description}
      id={id}
      components={components}
    >
      <components.Signatures>
        {node.signatures.map((signature, index) => {
          const detail = renderCallSignatureDetails(signature, components, {
            heading: multipleSignatures ? `Overload ${index + 1}` : undefined,
            showSignatureText: true,
            parentDescription: node.description,
          })

          if (!detail) {
            return null
          }

          return <React.Fragment key={index}>{detail}</React.Fragment>
        })}
      </components.Signatures>
    </TypeSection>
  )
}

function TypeAliasSection({
  node,
  components,
  id,
}: {
  node: TypeOfKind<'TypeAlias'>
  components: InternalReferenceComponents
  id?: string
}) {
  return (
    <TypeSection
      kind="TypeAlias"
      title={node.name}
      description={node.description}
      id={id}
      components={components}
    >
      <TypeDetail label="Type" components={components} kind={node.kind}>
        <components.Code>{node.type.text}</components.Code>
      </TypeDetail>
    </TypeSection>
  )
}

function MembersSection({
  node,
  components,
  id,
}: {
  node: Kind.Interface | Kind.TypeAlias<Kind.TypeLiteral>
  components: InternalReferenceComponents
  id?: string
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
      kind={node.kind}
      title={node.name}
      description={node.description}
      id={id}
      components={components}
    >
      {propertySignatures.length > 0 ? (
        <TypeDetail label="Properties" components={components} kind={node.kind}>
          <TypeTable
            rows={propertySignatures}
            headers={['Property', 'Type']}
            renderRow={(property, hasSubRow) => (
              <>
                <components.TableData index={0} hasSubRow={hasSubRow}>
                  {property.name}
                  {property.isOptional ? '?' : ''}
                </components.TableData>
                <components.TableData
                  index={1}
                  hasSubRow={hasSubRow}
                  colSpan={2}
                >
                  <components.Code>{property.type.text}</components.Code>
                </components.TableData>
              </>
            )}
            components={components}
          />
        </TypeDetail>
      ) : null}

      {methodSignatures.length > 0 ? (
        <TypeDetail label="Methods" components={components} kind={node.kind}>
          <TypeTable
            rows={methodSignatures}
            headers={['Method', 'Type']}
            renderRow={(method, hasSubRow) => (
              <>
                <components.TableData index={0} hasSubRow={hasSubRow}>
                  {method.name}
                </components.TableData>
                <components.TableData
                  index={1}
                  hasSubRow={hasSubRow}
                  colSpan={2}
                >
                  <components.Code>{method.text}</components.Code>
                </components.TableData>
              </>
            )}
            components={components}
          />
        </TypeDetail>
      ) : null}

      {indexSignatures.length > 0 ? (
        <TypeDetail
          label="Index Signatures"
          components={components}
          kind={node.kind}
        >
          <TypeTable
            rows={indexSignatures}
            headers={['Key', 'Type']}
            renderRow={(indexSignature, hasSubRow) => (
              <>
                <components.TableData index={0} hasSubRow={hasSubRow}>
                  <components.Code>
                    {indexSignature.parameter.text}
                  </components.Code>
                </components.TableData>
                <components.TableData
                  index={1}
                  hasSubRow={hasSubRow}
                  colSpan={2}
                >
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
  id,
}: {
  node: TypeOfKind<'MappedType'>
  components: InternalReferenceComponents
  id?: string
}) {
  const parameterText = `${node.typeParameter.name} in ${node.typeParameter.constraintType?.text ?? '?'}`
  const valueText = node.type.text

  // TODO: this needs an incoming name prop that will be provided by the enclosing declaration
  return (
    <TypeSection kind="MappedType" id={id} components={components}>
      <TypeDetail label="Parameter" components={components} kind={node.kind}>
        <components.Code>{parameterText}</components.Code>
      </TypeDetail>
      <TypeDetail label="Type" components={components} kind={node.kind}>
        <components.Code>{valueText}</components.Code>
      </TypeDetail>
      <TypeDetail label="Modifiers" components={components} kind={node.kind}>
        <components.Code>
          {node.isReadonly ? 'readonly ' : null}
          {node.isOptional ? 'optional' : null}
          {!node.isReadonly && !node.isOptional ? '—' : null}
        </components.Code>
      </TypeDetail>
    </TypeSection>
  )
}

type IntersectionPropertyRow = {
  name: string
  text: string
  defaultValue?: unknown
  isOptional?: boolean
  isReadonly?: boolean
}

function isNeverTypeText(typeText?: string): boolean {
  if (!typeText) return false
  return typeText === 'never'
}

function getIntersectionPropertyRows(
  typeExpression: Kind.TypeExpression
): IntersectionPropertyRow[] {
  if (typeExpression.kind === 'TypeLiteral') {
    const rows: IntersectionPropertyRow[] = []

    for (const member of typeExpression.members) {
      if (member.kind === 'PropertySignature') {
        if (isNeverTypeText(member.type.text)) continue
        rows.push({
          name: member.name ?? member.text,
          text: member.type.text,
          isOptional: member.isOptional,
          isReadonly: member.isReadonly,
        })
      } else if (member.kind === 'IndexSignature') {
        if (isNeverTypeText(member.type.text)) continue
        rows.push({
          name: `[${member.parameter.name}: ${member.parameter.type.text}]`,
          text: member.type.text,
          isReadonly: member.isReadonly,
        })
      }
    }

    return rows
  }

  if (typeExpression.kind === 'IntersectionType') {
    return typeExpression.types.flatMap((inner) =>
      getIntersectionPropertyRows(inner)
    )
  }

  if (typeExpression.kind === 'MappedType') {
    if (isNeverTypeText(typeExpression.type.text)) return []
    return [
      {
        name: `[${typeExpression.typeParameter.text}]`,
        text: typeExpression.type.text,
        isOptional: typeExpression.isOptional,
        isReadonly: typeExpression.isReadonly,
      },
    ]
  }

  return []
}

function IntersectionSection({
  node,
  components,
  id,
  title,
}: {
  node: TypeOfKind<'IntersectionType'>
  components: InternalReferenceComponents
  id?: string
  title?: string
}) {
  // Collect base rows (unconditional) and conditional nodes to build a decision tree.
  const baseRows: IntersectionPropertyRow[] = []
  const conditionals: TypeOfKind<'ConditionalType'>[] = []
  const otherTypes: string[] = []

  for (const type of node.types) {
    if (type.kind === 'ConditionalType') {
      conditionals.push(type)
      // Also keep raw conditional text for footer if not never
      const rawText = type.text.trim()
      if (!isNeverTypeText(rawText)) otherTypes.push(rawText)
      continue
    }

    const collected = getIntersectionPropertyRows(type)
    if (collected.length > 0) {
      baseRows.push(...collected)
    } else {
      const text = type.text.trim()
      if (!isNeverTypeText(text) && text) otherTypes.push(text)
    }
  }

  type Branch = {
    guardParts: React.ReactNode[]
    rows: IntersectionPropertyRow[]
  }

  function expandConditionalToLeaves(
    conditional: TypeOfKind<'ConditionalType'>
  ): Branch[] {
    const whenPart = (
      <>
        <components.Code>{conditional.checkType.text}</components.Code> extends{' '}
        <components.Code>{conditional.extendsType.text}</components.Code>
      </>
    )
    const elsePart = (
      <>
        <components.Code>{conditional.checkType.text}</components.Code> does not{' '}
        extend <components.Code>{conditional.extendsType.text}</components.Code>
      </>
    )

    const trueArm = conditional.trueType
    const falseArm = conditional.falseType

    const trueLeaves: Branch[] =
      trueArm.kind === 'ConditionalType'
        ? expandConditionalToLeaves(trueArm).map((leaf) => ({
            guardParts: [whenPart, ...leaf.guardParts],
            rows: leaf.rows,
          }))
        : [
            {
              guardParts: [whenPart],
              rows: getIntersectionPropertyRows(trueArm),
            },
          ]

    const falseLeaves: Branch[] =
      falseArm.kind === 'ConditionalType'
        ? expandConditionalToLeaves(falseArm).map((leaf) => ({
            guardParts: [elsePart, ...leaf.guardParts],
            rows: leaf.rows,
          }))
        : [
            {
              guardParts: [elsePart],
              rows: getIntersectionPropertyRows(falseArm),
            },
          ]

    return [...trueLeaves, ...falseLeaves]
  }

  // Cross-product combine multiple conditional trees into leaf branches
  let leaves: Branch[] = conditionals.length
    ? [{ guardParts: [], rows: [] }]
    : []

  for (const conditional of conditionals) {
    const expanded = expandConditionalToLeaves(conditional)
    const next: Branch[] = []
    for (const prefix of leaves) {
      for (const leaf of expanded) {
        next.push({
          guardParts: [...prefix.guardParts, ...leaf.guardParts],
          rows: [...prefix.rows, ...leaf.rows],
        })
      }
    }
    leaves = next
  }

  // Map rows by name (last wins) and drop `never`
  function rowsToMap(
    rows: IntersectionPropertyRow[]
  ): Map<string, IntersectionPropertyRow> {
    const map = new Map<string, IntersectionPropertyRow>()
    for (const r of rows) {
      if (!isNeverTypeText(r.text)) {
        map.set(r.name, r)
      }
    }
    return map
  }

  const baseMap = rowsToMap(baseRows)

  // Build per-leaf maps including base rows
  const leafMaps: Map<string, IntersectionPropertyRow>[] = leaves.map(
    (leaf) => {
      const combined: IntersectionPropertyRow[] = [...baseRows, ...leaf.rows]
      return rowsToMap(combined)
    }
  )

  // Compute Always-available rows (appear in all leaves with identical type)
  let alwaysRows: IntersectionPropertyRow[] = []
  if (leaves.length === 0) {
    // No conditionals; show base properties as-is
    alwaysRows = baseRows
  } else if (leafMaps.length > 0) {
    // Start from keys of the first map
    const first = leafMaps[0]
    for (const [name, row] of first) {
      let sameInAll = true
      for (let i = 1; i < leafMaps.length; i++) {
        const other = leafMaps[i].get(name)
        if (!other || other.text.trim() !== row.text.trim()) {
          sameInAll = false
          break
        }
      }
      if (sameInAll) {
        alwaysRows.push(row)
      }
    }
  }

  const alwaysNames = new Set(alwaysRows.map((r) => r.name))

  // Compute per-branch deltas: added and overrides (vs base rows)
  type DeltaRow = IntersectionPropertyRow & { overridden?: boolean }

  const branchPanels: {
    label: React.ReactNode
    rows: DeltaRow[]
  }[] = []

  if (leaves.length > 0) {
    leaves.forEach((leaf) => {
      const leafMap = rowsToMap([...baseRows, ...leaf.rows])
      const overrides: DeltaRow[] = []
      const added: DeltaRow[] = []

      for (const [name, row] of leafMap) {
        if (alwaysNames.has(name)) {
          // Already shown in Always with identical type; skip
          continue
        }
        const base = baseMap.get(name)
        if (base && base.text.trim() !== row.text.trim()) {
          overrides.push({ ...row, overridden: true })
          continue
        }
        if (!base) {
          added.push(row)
        }
      }

      const deltaRows: DeltaRow[] = [...overrides, ...added]
      if (deltaRows.length === 0) return

      const label = (
        <>
          {leaf.guardParts.map((part, index) => (
            <React.Fragment key={index}>
              {index > 0 ? ' and ' : null}
              {part}
            </React.Fragment>
          ))}
        </>
      )

      branchPanels.push({ label, rows: deltaRows })
    })
  }

  const renderIntersectionRow = (
    row: IntersectionPropertyRow,
    hasSubRow: boolean
  ) => (
    <>
      <components.TableData index={0} hasSubRow={hasSubRow}>
        {row.name}
        {row.isOptional ? '?' : ''}
      </components.TableData>
      <components.TableData index={1} hasSubRow={hasSubRow} colSpan={2}>
        <components.Code>{row.text}</components.Code>
      </components.TableData>
    </>
  )

  const renderDeltaRow = (row: DeltaRow, hasSubRow: boolean) => (
    <>
      <components.TableData index={0} hasSubRow={hasSubRow}>
        {row.name}
        {row.isOptional ? '?' : ''}
        {row.hasOwnProperty('overridden') && (row as any).overridden
          ? ' (overrides)'
          : ''}
      </components.TableData>
      <components.TableData index={1} hasSubRow={hasSubRow} colSpan={2}>
        <components.Code>{row.text}</components.Code>
      </components.TableData>
    </>
  )

  return (
    <TypeSection
      kind="IntersectionType"
      title={title}
      id={id}
      components={components}
    >
      {alwaysRows.length > 0 ? (
        <TypeDetail label="Properties" components={components} kind={node.kind}>
          <TypeTable
            rows={alwaysRows}
            headers={['Property', 'Type']}
            renderRow={renderIntersectionRow}
            components={components}
          />
        </TypeDetail>
      ) : null}

      {branchPanels.map((panel, index) => (
        <TypeDetail
          key={index}
          label={panel.label}
          components={components}
          kind={node.kind}
        >
          <TypeTable
            rows={panel.rows}
            headers={['Property', 'Type']}
            renderRow={renderDeltaRow}
            components={components}
          />
        </TypeDetail>
      ))}

      {otherTypes.length > 0 ? (
        <TypeDetail label="Intersects" components={components} kind={node.kind}>
          <components.Code>
            {[...new Set(otherTypes)].join(' & ')}
          </components.Code>
        </TypeDetail>
      ) : null}
    </TypeSection>
  )
}

function TypeExpressionSection({
  node,
  components,
}: {
  node: Kind.TypeExpression
  components: InternalReferenceComponents
}) {
  return (
    <TypeSection kind={node.kind} components={components}>
      <TypeDetail label="Type" components={components} kind={node.kind}>
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
  components: InternalReferenceComponents
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
    return parameter.type.text
  }

  return parameter.text
}

/** Convert kind name from PascalCase to space separated label. */
function kindToLabel(kind: string): string {
  return kind.replace(/([a-z])([A-Z])/g, '$1 $2')
}
