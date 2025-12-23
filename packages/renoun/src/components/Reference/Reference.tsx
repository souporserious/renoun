import React, { Suspense } from 'react'
import { dirname, resolve } from 'node:path'

import { JavaScriptFile, type ModuleExport } from '../../file-system/index.tsx'
import {
  type Kind,
  type TypeFilter,
  type TypeOfKind,
} from '../../utils/resolve-type.ts'
import { BaseDirectoryContext } from '../Context.tsx'
import { normalizeBaseDirectory } from '../../utils/normalize-base-directory.ts'
import { pathLikeToString, type PathLike } from '../../utils/path.ts'

type GapSize = 'small' | 'medium' | 'large'

export interface ReferenceComponents {
  Section: React.ComponentType<{
    /** The section's ID. */
    id?: string

    /** The kind of the section. */
    kind: Kind['kind']

    /** The content of the section. */
    children?: React.ReactNode
  }>
  SectionHeading: React.ComponentType<{
    /** The kind formatted as a label, e.g. "Type Alias", "Function". */
    label?: string

    /** The section's title, e.g. the export identifier name. */
    title?: string

    /** Label based on the kind and title. */
    'aria-label'?: string
  }>
  SectionBody: React.ComponentType<{
    /** Whether the section has a description. */
    hasDescription: boolean

    /** The content of the section body. */
    children: React.ReactNode
  }>
  Column: React.ComponentType<{
    /** The gap size between the column's children. */
    gap?: GapSize

    /** The content of the column. */
    children?: React.ReactNode
  }>
  Row: React.ComponentType<{
    /** The gap size between the row's children. */
    gap?: GapSize

    /** The content of the row. */
    children?: React.ReactNode
  }>
  Code: React.ComponentType<{
    /** The content of the code. */
    children?: React.ReactNode
  }>
  Description: React.ComponentType<{
    /** The content of the description. */
    children: string
  }>
  Detail: React.ComponentType<{
    /** The kind of the detail. */
    kind: Kind['kind']

    /** The content of the detail. */
    children: React.ReactNode
  }>
  Signatures: React.ComponentType<{
    /** The content of the signatures. */
    children: React.ReactNode
  }>
  DetailHeading: React.ComponentType<{
    /** The content of the detail heading. */
    children?: React.ReactNode
  }>
  Table: React.ComponentType<{
    /** The content of the table. */
    children?: React.ReactNode
  }>
  TableHead: React.ComponentType<{
    /** The content of the table head. */
    children?: React.ReactNode
  }>
  TableBody: React.ComponentType<{
    /** The content of the table body. */
    children?: React.ReactNode
  }>
  TableRowGroup: React.ComponentType<{
    /** Whether the row has a sub-row. */
    hasSubRow?: boolean

    /** The content of the row group. */
    children?: React.ReactNode
  }>
  TableRow: React.ComponentType<{
    /** Whether the row has a sub-row. */
    hasSubRow?: boolean

    /** The content of the row. */
    children?: React.ReactNode
  }>
  TableSubRow: React.ComponentType<{
    /** The content of the sub-row. */
    children: React.ReactNode
  }>
  TableHeader: React.ComponentType<{
    /** The content of the header cell. */
    children?: React.ReactNode
  }>
  TableData: React.ComponentType<{
    /** Index of the data cell. */
    index: number

    /** Whether the row has a sub-row. */
    hasSubRow?: boolean

    /** The number of columns the cell should span. */
    colSpan?: number

    /** The content of the cell. */
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
  SectionHeading: ({ label, title, ...props }) => <h3 {...props}>{title}</h3>,
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

function getNodeAnchorId(node: Kind): string | undefined {
  if ('name' in node && typeof node.name === 'string' && node.name) {
    return node.name
  }

  return undefined
}

export interface ReferenceProps {
  /** The file path, `JavaScriptFile`, or `ModuleExport` type reference to resolve. */
  source: string | PathLike | JavaScriptFile<any> | ModuleExport<any>

  /** Optional filter for including additional properties from referenced types. */
  filter?: TypeFilter

  /** Base directory for relative `source` values. Passing `import.meta.url` will resolve the directory of the current file. */
  baseDirectory?: PathLike

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

  if (typeof source === 'string' || source instanceof URL) {
    const resolvedSource =
      source instanceof URL ? pathLikeToString(source) : source
    if (baseDirectory) {
      const normalized = normalizeBaseDirectory(baseDirectory)
      filePath = resolve(
        normalized ?? pathLikeToString(baseDirectory),
        resolvedSource
      )
    } else {
      filePath = resolvedSource
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

  return (
    <BaseDirectoryContext value={filePath ? dirname(filePath) : undefined}>
      {Array.isArray(resolvedType) ? (
        resolvedType.map((type, index) => (
          <TypeNodeRouter
            key={index}
            node={type}
            components={mergedComponents}
            id={getNodeAnchorId(type)}
          />
        ))
      ) : (
        <TypeNodeRouter
          node={resolvedType}
          components={mergedComponents}
          id={getNodeAnchorId(resolvedType)}
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
    case 'Enum':
      return <EnumSection node={node} components={components} id={id} />
    case 'Class':
      return <ClassSection node={node} components={components} id={id} />
    case 'Component':
      return <ComponentSection node={node} components={components} id={id} />
    case 'ComponentType':
      return (
        <ComponentTypeSection node={node} components={components} id={id} />
      )
    case 'Function':
      return <FunctionSection node={node} components={components} id={id} />
    case 'FunctionType':
      return <FunctionTypeSection node={node} components={components} id={id} />
    case 'Interface':
      return <MembersSection node={node} components={components} id={id} />
    case 'Namespace':
      return <NamespaceSection node={node} components={components} id={id} />
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
      if (node.type.kind === 'ConditionalType') {
        return (
          <ConditionalSection
            node={node.type}
            components={components}
            id={id}
            title={node.name}
            typeParameterConstraints={Object.fromEntries(
              (node.typeParameters || []).map((parameter) => [
                parameter.name ?? '',
                parameter.constraintType,
              ])
            )}
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
            typeParameterConstraints={Object.fromEntries(
              (node.typeParameters || []).map((parameter) => [
                parameter.name ?? '',
                parameter.constraintType,
              ])
            )}
          />
        )
      }
      if (node.type.kind === 'UnionType') {
        return (
          <UnionTypeSection
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
    case 'ConditionalType':
      return <ConditionalSection node={node} components={components} id={id} />
    case 'IndexedAccessType':
      return (
        <IndexedAccessSection node={node} components={components} id={id} />
      )
    case 'TypeOperator':
      return <TypeOperatorSection node={node} components={components} id={id} />
    case 'TypeQuery':
      return <TypeQuerySection node={node} components={components} id={id} />
    case 'InferType':
      return <InferTypeSection node={node} components={components} id={id} />
    case 'UnionType':
      return <UnionTypeSection node={node} components={components} id={id} />
    case 'Tuple':
      return <TupleSection node={node} components={components} id={id} />
    case 'TypeLiteral':
      return <TypeLiteralSection node={node} components={components} id={id} />
    case 'TypeReference':
      return (
        <TypeReferenceSection node={node} components={components} id={id} />
      )
    case 'String':
    case 'Number':
    case 'Boolean':
    case 'Symbol':
    case 'BigInt':
    case 'Object':
    case 'Any':
    case 'Unknown':
    case 'Void':
    case 'Null':
    case 'Undefined':
    case 'Never':
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
        label={label}
        title={title}
        aria-label={title ? `${title} ${label}` : label}
      />
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
        <components.Code>{node.type.text}</components.Code>
      </TypeDetail>
    </TypeSection>
  )
}

function EnumSection({
  node,
  components,
  id,
}: {
  node: TypeOfKind<'Enum'>
  components: InternalReferenceComponents
  id?: string
}) {
  return (
    <TypeSection
      kind="Enum"
      title={node.name}
      description={node.description}
      id={id}
      components={components}
    >
      <TypeDetail label="Members" components={components} kind={node.kind}>
        <TypeTable
          rows={node.members}
          headers={['Member', 'Value']}
          renderRow={(member, hasSubRow) => {
            const value = member.value
            let displayValue = '—'
            if (typeof value === 'string') {
              displayValue = JSON.stringify(value)
            } else if (typeof value === 'number') {
              displayValue = String(value)
            }

            return (
              <>
                <components.TableData index={0} hasSubRow={hasSubRow}>
                  {member.name}
                </components.TableData>
                <components.TableData index={1} hasSubRow={hasSubRow}>
                  <components.Code>{displayValue}</components.Code>
                </components.TableData>
              </>
            )
          }}
          renderSubRow={(member) => renderDocumentation(member, components)}
          components={components}
        />
      </TypeDetail>
    </TypeSection>
  )
}

function NamespaceSection({
  node,
  components,
  id,
}: {
  node: TypeOfKind<'Namespace'>
  components: InternalReferenceComponents
  id?: string
}) {
  return (
    <TypeSection
      kind="Namespace"
      title={node.name}
      description={node.description}
      id={id}
      components={components}
    >
      {node.types.length ? (
        <components.Column gap="large">
          {node.types.map((child, index) => (
            <TypeNodeRouter
              key={index}
              node={child}
              components={components}
              id={getNodeAnchorId(child)}
            />
          ))}
        </components.Column>
      ) : (
        <components.Code>—</components.Code>
      )}
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
          {getCallSignatureText(signature)}
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
  method: {
    signatures: TypeOfKind<'CallSignature'>[]
  },
  components: InternalReferenceComponents
) {
  const multipleSignatures = method.signatures.length > 1
  const signatureDetails: React.ReactNode[] = []

  method.signatures.forEach((signature, index) => {
    const detail = renderCallSignatureDetails(signature, components, {
      heading: multipleSignatures ? `Overload ${index + 1}` : undefined,
      showSignatureText: multipleSignatures,
      descriptionStrategy: 'inherit',
    })

    if (detail) {
      signatureDetails.push(
        <React.Fragment key={index}>{detail}</React.Fragment>
      )
    }
  })

  if (signatureDetails.length === 0) {
    return null
  }

  return <components.Column gap="large">{signatureDetails}</components.Column>
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

type DocumentableMetadata = {
  description?: Kind.SharedDocumentable['description']
  tags?: Kind.SharedDocumentable['tags']
}

function getDocumentableMetadata(
  documentable: unknown
): DocumentableMetadata | undefined {
  if (!documentable || typeof documentable !== 'object') {
    return undefined
  }

  const { description, tags } = documentable as {
    description?: Kind.SharedDocumentable['description']
    tags?: Kind.SharedDocumentable['tags']
  }

  if (!description && (!tags || tags.length === 0)) {
    return undefined
  }

  return { description, tags }
}

function renderDocumentation(
  documentable: unknown,
  components: InternalReferenceComponents
) {
  const metadata = getDocumentableMetadata(documentable)

  if (!metadata) {
    return null
  }

  const items: React.ReactNode[] = []

  if (metadata.description) {
    items.push(
      <components.Description key="description">
        {metadata.description}
      </components.Description>
    )
  }

  if (items.length === 0) {
    return null
  }

  return <components.Column gap="medium">{items}</components.Column>
}

function renderTypeParametersDetail(
  typeParameters: Kind.TypeParameter[] | undefined,
  components: InternalReferenceComponents,
  kind: Kind['kind'],
  key?: React.Key
) {
  if (!typeParameters?.length) {
    return null
  }

  return (
    <TypeDetail
      key={key}
      label="Type Parameters"
      components={components}
      kind={kind}
    >
      <TypeTable
        rows={typeParameters}
        headers={['Parameter', 'Constraint', 'Default']}
        renderRow={(typeParameter, hasSubRow) => (
          <>
            <components.TableData index={0} hasSubRow={hasSubRow}>
              <components.Code>
                {typeParameter.name ?? typeParameter.text}
              </components.Code>
              {typeParameter.isInferred ? ' (inferred)' : ''}
            </components.TableData>
            <components.TableData index={1} hasSubRow={hasSubRow}>
              {typeParameter.constraintType ? (
                <components.Code>
                  {typeParameter.constraintType.text}
                </components.Code>
              ) : (
                <components.Code>—</components.Code>
              )}
            </components.TableData>
            <components.TableData index={2} hasSubRow={hasSubRow}>
              {typeParameter.defaultType ? (
                <components.Code>
                  {typeParameter.defaultType.text}
                </components.Code>
              ) : (
                <components.Code>—</components.Code>
              )}
            </components.TableData>
          </>
        )}
        components={components}
      />
    </TypeDetail>
  )
}

function renderCallSignatureDetails(
  signature: TypeOfKind<'CallSignature'>,
  components: InternalReferenceComponents,
  options: {
    heading?: string
    showSignatureText?: boolean
    parentDescription?: string
    descriptionStrategy?: 'inherit' | 'skip-if-parent' | 'never'
  } = {}
) {
  const items = getCallSignatureDetailItems(signature, components, options)

  if (items.length === 0) {
    return null
  }

  return <components.Column gap="medium">{items}</components.Column>
}

function getCallSignatureDetailItems(
  signature: TypeOfKind<'CallSignature'>,
  components: InternalReferenceComponents,
  options: {
    heading?: string
    showSignatureText?: boolean
    parentDescription?: string
    descriptionStrategy?: 'inherit' | 'skip-if-parent' | 'never'
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

  const typeParametersDetail = renderTypeParametersDetail(
    signature.typeParameters,
    components,
    signature.kind,
    'generics'
  )

  const signatureModifiers: string[] = []

  if (signature.isAsync) {
    signatureModifiers.push('async')
  }

  if (signature.isGenerator) {
    signatureModifiers.push('generator')
  }

  const hasStructuredDetails =
    Boolean(typeParametersDetail) ||
    Boolean(signature.thisType) ||
    signature.parameters.length > 0 ||
    Boolean(signature.returnType) ||
    signatureModifiers.length > 0

  if (options.showSignatureText && !hasStructuredDetails) {
    items.push(
      <components.Code key="signature-text">
        {getCallSignatureText(signature)}
      </components.Code>
    )
  }

  const { descriptionStrategy = 'inherit', parentDescription } = options

  let shouldSkipDocumentation = false

  if (descriptionStrategy === 'never') {
    shouldSkipDocumentation = true
  } else if (
    descriptionStrategy === 'skip-if-parent' &&
    parentDescription &&
    signature.description
  ) {
    shouldSkipDocumentation =
      signature.description.trim() === parentDescription.trim()
  }

  const documentation =
    shouldSkipDocumentation || !signature
      ? null
      : renderDocumentation(signature, components)

  if (documentation) {
    items.push(
      <React.Fragment key="documentation">{documentation}</React.Fragment>
    )
  }

  if (typeParametersDetail) {
    items.push(typeParametersDetail)
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
    const returnContent = renderReturnType(signature.returnType, components, {
      showTypeText: true,
    })

    items.push(
      <TypeDetail
        key="returns"
        label="Returns"
        components={components}
        kind={signature.kind}
      >
        {returnContent}
      </TypeDetail>
    )
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

  return items
}

function renderReturnType(
  returnType: Kind.TypeExpression,
  components: InternalReferenceComponents,
  options: { showTypeText?: boolean; fallbackToTypeText?: boolean } = {}
): React.ReactNode | null {
  const { showTypeText = false, fallbackToTypeText = showTypeText } = options

  const withTypeText = (
    content: React.ReactNode | null
  ): React.ReactNode | null => {
    if (showTypeText) {
      if (!content) {
        return <components.Code>{returnType.text}</components.Code>
      }

      return (
        <components.Column gap="medium">
          <components.Code>{returnType.text}</components.Code>
          {content}
        </components.Column>
      )
    }

    if (!content) {
      if (!fallbackToTypeText) {
        return null
      }

      return <components.Code>{returnType.text}</components.Code>
    }

    return content
  }

  switch (returnType.kind) {
    case 'TypeLiteral': {
      // Special-case: if the return type is a plain object with properties only,
      // render just the properties table (no "Properties" subheading and no type text)
      const {
        propertySignatures,
        methodSignatures,
        indexSignatures,
        callSignatures,
        constructSignatures,
        accessorSignatures,
      } = partitionMembers(returnType.members)

      const onlyProperties =
        propertySignatures.length > 0 &&
        methodSignatures.length === 0 &&
        indexSignatures.length === 0 &&
        callSignatures.length === 0 &&
        constructSignatures.length === 0 &&
        accessorSignatures.length === 0

      if (onlyProperties) {
        return (
          <TypeTable
            rows={propertySignatures}
            headers={['Property', 'Type', 'Modifiers']}
            renderRow={(property, hasSubRow) => (
              <>
                <components.TableData index={0} hasSubRow={hasSubRow}>
                  {property.name}
                  {property.isOptional ? '?' : ''}
                </components.TableData>
                <components.TableData index={1} hasSubRow={hasSubRow}>
                  <components.Code>{property.type.text}</components.Code>
                </components.TableData>
                <components.TableData index={2} hasSubRow={hasSubRow}>
                  <components.Code>
                    {property.isReadonly ? 'readonly' : '—'}
                  </components.Code>
                </components.TableData>
              </>
            )}
            renderSubRow={(property) =>
              renderDocumentation(property, components)
            }
            components={components}
          />
        )
      }

      const memberDetails = renderMembersDetails({
        members: returnType.members,
        components,
        ownerKind: returnType.kind,
      })

      if (memberDetails.length === 0) {
        return withTypeText(null)
      }

      return withTypeText(
        <components.Column gap="medium">{memberDetails}</components.Column>
      )
    }

    case 'UnionType': {
      // For union return types, prefer a concise inline representation rather than a table.
      // This keeps the focus on the overall union type instead of rendering a variant table,
      // which can be noisy and hard to scan in documentation.
      return withTypeText(null)
    }

    case 'IntersectionType': {
      const rows = getIntersectionPropertyRows(returnType)

      if (rows.length === 0) {
        return withTypeText(null)
      }

      // For intersection return types that are "object-ish" (e.g. an inline
      // object intersected with a helper type), render the object shape as a
      // properties table and list any remaining intersection members in an
      // "Intersects" row — similar to how the dedicated Intersection section
      // behaves elsewhere in the reference.
      const otherTypes: string[] = []

      for (const type of returnType.types) {
        const text = type.text?.trim()

        if (!text || isNeverTypeText(text)) {
          continue
        }

        const typeRows = getIntersectionPropertyRows(type)

        // If this branch contributes no property rows, treat it as an
        // additional intersected type.
        if (typeRows.length === 0) {
          otherTypes.push(text)
        }
      }

      const uniqueOtherTypes = [...new Set(otherTypes)]

      return (
        <components.Column gap="large">
          <TypeTable
            rows={rows}
            headers={['Property', 'Type']}
            renderRow={(row, hasSubRow) => (
              <>
                <components.TableData index={0} hasSubRow={hasSubRow}>
                  {row.name}
                  {row.isOptional ? '?' : ''}
                </components.TableData>
                <components.TableData
                  index={1}
                  hasSubRow={hasSubRow}
                  colSpan={2}
                >
                  <components.Code>{row.text}</components.Code>
                </components.TableData>
              </>
            )}
            components={components}
          />

          {uniqueOtherTypes.length > 0 ? (
            <TypeTable
              rows={uniqueOtherTypes}
              headers={['Intersects']}
              renderRow={(text, hasSubRow) => (
                <components.TableData
                  index={0}
                  hasSubRow={hasSubRow}
                  colSpan={3}
                >
                  <components.Code>{text}</components.Code>
                </components.TableData>
              )}
              components={components}
            />
          ) : null}
        </components.Column>
      )
    }

    default:
      return withTypeText(null)
  }
}

function renderConstructorSignature(
  signature: TypeOfKind<'CallSignature'>,
  components: InternalReferenceComponents,
  className?: string
) {
  const items: React.ReactNode[] = []

  // Signature line
  items.push(
    <components.Code key="signature-text">
      {getConstructorSignatureText(signature, className)}
    </components.Code>
  )

  const typeParametersDetail = renderTypeParametersDetail(
    signature.typeParameters,
    components,
    signature.kind,
    'type-parameters'
  )
  if (typeParametersDetail) {
    items.push(typeParametersDetail)
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

  // Parameters table (if any)
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
          headers={['Parameter', 'Type', 'Default Value']}
          renderRow={(parameter, hasSubRow) =>
            renderParameterRow(parameter, components, hasSubRow)
          }
          components={components}
        />
      </TypeDetail>
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
          <components.Signatures>
            {node.constructor.signatures.map((signature, index) => (
              <React.Fragment key={index}>
                {renderConstructorSignature(signature, components, node.name)}
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

function renderComponentParameterContent(
  parameter: Kind.ComponentParameter | undefined,
  components: InternalReferenceComponents
) {
  if (parameter?.type.kind === 'TypeLiteral') {
    return (
      <TypeTable
        rows={parameter.type.members}
        headers={['Property', 'Type', 'Default Value']}
        renderRow={(property, hasSubRow) => {
          if (property.kind === 'PropertySignature') {
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
                  <components.Code>—</components.Code>
                </components.TableData>
              </>
            )
          }

          if (property.kind === 'MethodSignature') {
            return (
              <>
                <components.TableData index={0} hasSubRow={hasSubRow}>
                  {property.name}
                </components.TableData>
                <components.TableData index={1} hasSubRow={hasSubRow}>
                  <components.Code>
                    {(() => {
                      const signature = property.signatures[0]
                      const overloadCount = property.signatures.length - 1

                      if (!signature) {
                        return property.text
                      }

                      return `${getCallSignatureText(signature)}${
                        overloadCount > 0
                          ? ` (+${overloadCount} overload${
                              overloadCount > 1 ? 's' : ''
                            })`
                          : ''
                      }`
                    })()}
                  </components.Code>
                </components.TableData>
                <components.TableData index={2} hasSubRow={hasSubRow}>
                  <components.Code>—</components.Code>
                </components.TableData>
              </>
            )
          }

          const member = property as Kind.MemberUnion

          return (
            <components.TableData index={0} hasSubRow={hasSubRow} colSpan={3}>
              <components.Code>{member.text}</components.Code>
            </components.TableData>
          )
        }}
        renderSubRow={(property) => {
          if (property.kind === 'PropertySignature') {
            return renderDocumentation(property, components)
          }

          if (property.kind === 'MethodSignature') {
            return renderMethodSubRow(property, components)
          }

          return null
        }}
        components={components}
      />
    )
  }

  return <components.Code>{getParameterText(parameter)}</components.Code>
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
  const multipleSignatures = node.signatures.length > 1

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
          const adaptedSignature: TypeOfKind<'CallSignature'> = {
            kind: 'CallSignature',
            text: signature.text,
            parameters: [],
            returnType: signature.returnType,
            typeParameters: signature.typeParameters,
            thisType: signature.thisType,
            isAsync: signature.isAsync,
            isGenerator: signature.isGenerator,
            description: signature.description,
            tags: signature.tags,
            filePath: signature.filePath,
            position: signature.position,
          }

          const parameterDetail = signature.parameter ? (
            <TypeDetail
              key="properties"
              label="Properties"
              components={components}
              kind={node.kind}
            >
              {renderComponentParameterContent(signature.parameter, components)}
            </TypeDetail>
          ) : null

          const items = getCallSignatureDetailItems(
            adaptedSignature,
            components,
            {
              heading: multipleSignatures ? `Overload ${index + 1}` : undefined,
              showSignatureText: true,
              parentDescription: node.description,
              descriptionStrategy: multipleSignatures
                ? 'skip-if-parent'
                : 'never',
            }
          )

          if (parameterDetail) {
            items.unshift(parameterDetail)
          }

          if (items.length === 0) {
            return null
          }

          return (
            <components.Column gap="medium" key={index}>
              {items}
            </components.Column>
          )
        })}
      </components.Signatures>
    </TypeSection>
  )
}

function ComponentTypeSection({
  node,
  components,
  id,
}: {
  node: TypeOfKind<'ComponentType'>
  components: InternalReferenceComponents
  id?: string
}) {
  const modifiers: string[] = []
  if (node.isAsync) modifiers.push('async')
  if (node.isGenerator) modifiers.push('generator')

  const typeParametersDetail = renderTypeParametersDetail(
    node.typeParameters,
    components,
    node.kind
  )
  const hasStructuredDetails =
    Boolean(typeParametersDetail) ||
    Boolean(node.thisType) ||
    Boolean(node.parameter) ||
    Boolean(node.returnType) ||
    modifiers.length > 0

  return (
    <TypeSection kind={node.kind} id={id} components={components}>
      {!hasStructuredDetails ? (
        <TypeDetail label="Signature" components={components} kind={node.kind}>
          <components.Code>{node.text}</components.Code>
        </TypeDetail>
      ) : null}
      {typeParametersDetail}
      {node.thisType ? (
        <TypeDetail label="This Type" components={components} kind={node.kind}>
          <components.Code>{node.thisType.text}</components.Code>
        </TypeDetail>
      ) : null}
      <TypeDetail label="Properties" components={components} kind={node.kind}>
        {renderComponentParameterContent(node.parameter, components)}
      </TypeDetail>
      {node.returnType ? (
        <TypeDetail label="Returns" components={components} kind={node.kind}>
          {renderReturnType(node.returnType, components, {
            showTypeText: true,
          })}
        </TypeDetail>
      ) : null}
      {modifiers.length ? (
        <TypeDetail label="Modifiers" components={components} kind={node.kind}>
          <components.Code>{modifiers.join(', ')}</components.Code>
        </TypeDetail>
      ) : null}
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
  const parentDescription = getDocumentableMetadata(node)?.description
  const descriptionStrategy = parentDescription
    ? multipleSignatures
      ? 'skip-if-parent'
      : 'never'
    : 'inherit'

  return (
    <TypeSection
      kind="Function"
      title={node.name}
      description={parentDescription}
      id={id}
      components={components}
    >
      <components.Signatures>
        {node.signatures.map((signature, index) => {
          const detail = renderCallSignatureDetails(signature, components, {
            heading: multipleSignatures ? `Overload ${index + 1}` : undefined,
            showSignatureText: true,
            parentDescription,
            descriptionStrategy,
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

function FunctionTypeSection({
  node,
  components,
  id,
}: {
  node: TypeOfKind<'FunctionType'>
  components: InternalReferenceComponents
  id?: string
}) {
  const modifiers: string[] = []
  if (node.isAsync) modifiers.push('async')
  if (node.isGenerator) modifiers.push('generator')

  const typeParametersDetail = renderTypeParametersDetail(
    node.typeParameters,
    components,
    node.kind
  )
  const hasStructuredDetails =
    Boolean(typeParametersDetail) ||
    Boolean(node.thisType) ||
    node.parameters.length > 0 ||
    Boolean(node.returnType) ||
    modifiers.length > 0

  return (
    <TypeSection kind={node.kind} id={id} components={components}>
      {!hasStructuredDetails ? (
        <TypeDetail label="Signature" components={components} kind={node.kind}>
          <components.Code>{node.text}</components.Code>
        </TypeDetail>
      ) : null}
      {typeParametersDetail}
      {node.thisType ? (
        <TypeDetail label="This Type" components={components} kind={node.kind}>
          <components.Code>{node.thisType.text}</components.Code>
        </TypeDetail>
      ) : null}
      {node.parameters.length ? (
        <TypeDetail label="Parameters" components={components} kind={node.kind}>
          <TypeTable
            rows={node.parameters}
            headers={['Parameter', 'Type', 'Default Value']}
            renderRow={(parameter, hasSubRow) =>
              renderParameterRow(parameter, components, hasSubRow)
            }
            components={components}
          />
        </TypeDetail>
      ) : null}
      {node.returnType ? (
        <TypeDetail label="Returns" components={components} kind={node.kind}>
          {renderReturnType(node.returnType, components, {
            showTypeText: true,
          })}
        </TypeDetail>
      ) : null}
      {modifiers.length ? (
        <TypeDetail label="Modifiers" components={components} kind={node.kind}>
          <components.Code>{modifiers.join(', ')}</components.Code>
        </TypeDetail>
      ) : null}
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
      {renderTypeParametersDetail(node.typeParameters, components, node.kind)}
      <TypeDetail label="Type" components={components} kind={node.kind}>
        <components.Code>{node.type.text}</components.Code>
      </TypeDetail>
    </TypeSection>
  )
}

function partitionMembers(members: readonly Kind.MemberUnion[]) {
  const propertySignatures: Kind.PropertySignature[] = []
  const methodSignatures: Kind.MethodSignature[] = []
  const indexSignatures: Kind.IndexSignature[] = []
  const callSignatures: Kind.CallSignature[] = []
  const constructSignatures: Kind.ConstructSignature[] = []
  const accessorSignatures: (
    | Kind.GetAccessorSignature
    | Kind.SetAccessorSignature
  )[] = []

  for (const member of members) {
    switch (member.kind) {
      case 'PropertySignature':
        propertySignatures.push(member)
        break
      case 'MethodSignature':
        methodSignatures.push(member)
        break
      case 'IndexSignature':
        indexSignatures.push(member)
        break
      case 'CallSignature':
        callSignatures.push(member)
        break
      case 'ConstructSignature':
        constructSignatures.push(member)
        break
      case 'GetAccessorSignature':
      case 'SetAccessorSignature':
        accessorSignatures.push(member)
        break
      default:
        break
    }
  }

  return {
    propertySignatures,
    methodSignatures,
    indexSignatures,
    callSignatures,
    constructSignatures,
    accessorSignatures,
  }
}

function renderMembersDetails({
  members,
  components,
  ownerKind,
}: {
  members: readonly Kind.MemberUnion[]
  components: InternalReferenceComponents
  ownerKind: Kind['kind']
}): React.ReactNode[] {
  const {
    propertySignatures,
    methodSignatures,
    indexSignatures,
    callSignatures,
    constructSignatures,
    accessorSignatures,
  } = partitionMembers(members)

  const details: React.ReactNode[] = []

  if (propertySignatures.length > 0) {
    details.push(
      <TypeDetail
        key="properties"
        label="Properties"
        components={components}
        kind={ownerKind}
      >
        <TypeTable
          rows={propertySignatures}
          headers={['Property', 'Type', 'Modifiers']}
          renderRow={(property, hasSubRow) => (
            <>
              <components.TableData index={0} hasSubRow={hasSubRow}>
                {property.name}
                {property.isOptional ? '?' : ''}
              </components.TableData>
              <components.TableData index={1} hasSubRow={hasSubRow}>
                <components.Code>{property.type.text}</components.Code>
              </components.TableData>
              <components.TableData index={2} hasSubRow={hasSubRow}>
                <components.Code>
                  {property.isReadonly ? 'readonly' : '—'}
                </components.Code>
              </components.TableData>
            </>
          )}
          renderSubRow={(property) => renderDocumentation(property, components)}
          components={components}
        />
      </TypeDetail>
    )
  }

  if (methodSignatures.length > 0) {
    details.push(
      <TypeDetail
        key="methods"
        label="Methods"
        components={components}
        kind={ownerKind}
      >
        <TypeTable
          rows={methodSignatures}
          headers={['Method', 'Signature', 'Modifiers']}
          renderRow={(method, hasSubRow) => (
            <>
              <components.TableData index={0} hasSubRow={hasSubRow}>
                {method.name}
              </components.TableData>
              <components.TableData index={1} hasSubRow={hasSubRow}>
                <components.Code>
                  {(() => {
                    const signature = method.signatures[0]
                    const overloadCount = method.signatures.length - 1

                    if (!signature) {
                      return method.text
                    }

                    return `${getCallSignatureText(signature)}${
                      overloadCount > 0
                        ? ` (+${overloadCount} overload${
                            overloadCount > 1 ? 's' : ''
                          })`
                        : ''
                    }`
                  })()}
                </components.Code>
              </components.TableData>
              <components.TableData index={2} hasSubRow={hasSubRow}>
                <components.Code>
                  {(() => {
                    const signature = method.signatures[0]
                    const modifiers: string[] = []

                    if (/\?\s*\(/.test(method.text)) {
                      modifiers.push('optional')
                    }

                    if (signature?.isAsync) {
                      modifiers.push('async')
                    }

                    if (signature?.isGenerator) {
                      modifiers.push('generator')
                    }

                    return modifiers.length ? modifiers.join(', ') : '—'
                  })()}
                </components.Code>
              </components.TableData>
            </>
          )}
          renderSubRow={(method) => renderMethodSubRow(method, components)}
          components={components}
        />
      </TypeDetail>
    )
  }

  if (indexSignatures.length > 0) {
    details.push(
      <TypeDetail
        key="index-signatures"
        label="Index Signatures"
        components={components}
        kind={ownerKind}
      >
        <TypeTable
          rows={indexSignatures}
          headers={['Key', 'Type', 'Modifiers']}
          renderRow={(indexSignature, hasSubRow) => (
            <>
              <components.TableData index={0} hasSubRow={hasSubRow}>
                <components.Code>
                  {indexSignature.parameter.text}
                </components.Code>
              </components.TableData>
              <components.TableData index={1} hasSubRow={hasSubRow}>
                <components.Code>{indexSignature.type.text}</components.Code>
              </components.TableData>
              <components.TableData index={2} hasSubRow={hasSubRow}>
                <components.Code>
                  {indexSignature.isReadonly ? 'readonly' : '—'}
                </components.Code>
              </components.TableData>
            </>
          )}
          renderSubRow={(signature) =>
            renderDocumentation(signature, components)
          }
          components={components}
        />
      </TypeDetail>
    )
  }

  if (accessorSignatures.length > 0) {
    details.push(
      <TypeDetail
        key="accessors"
        label="Accessors"
        components={components}
        kind={ownerKind}
      >
        <TypeTable
          rows={accessorSignatures}
          headers={['Accessor', 'Type']}
          renderRow={(accessor, hasSubRow) => (
            <>
              <components.TableData index={0} hasSubRow={hasSubRow}>
                {accessor.kind === 'GetAccessorSignature'
                  ? `get ${accessor.name}`
                  : `set ${accessor.name}`}
              </components.TableData>
              <components.TableData index={1} hasSubRow={hasSubRow}>
                <components.Code>
                  {accessor.kind === 'GetAccessorSignature'
                    ? accessor.returnType.text
                    : accessor.parameter.type.text}
                </components.Code>
              </components.TableData>
            </>
          )}
          renderSubRow={(accessor) => {
            const documentation = renderDocumentation(accessor, components)
            const parameterDetail =
              accessor.kind === 'SetAccessorSignature' ? (
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
          }}
          components={components}
        />
      </TypeDetail>
    )
  }

  if (callSignatures.length > 0) {
    details.push(
      <TypeDetail
        key="call-signatures"
        label="Call Signatures"
        components={components}
        kind={ownerKind}
      >
        <components.Signatures>
          {callSignatures.map((signature, index) => {
            const detail = renderCallSignatureDetails(signature, components, {
              heading:
                callSignatures.length > 1 ? `Overload ${index + 1}` : undefined,
              showSignatureText: true,
              descriptionStrategy: 'inherit',
            })

            if (!detail) {
              return null
            }

            return <React.Fragment key={index}>{detail}</React.Fragment>
          })}
        </components.Signatures>
      </TypeDetail>
    )
  }

  if (constructSignatures.length > 0) {
    details.push(
      <TypeDetail
        key="construct-signatures"
        label="Construct Signatures"
        components={components}
        kind={ownerKind}
      >
        <components.Signatures>
          {constructSignatures.map((signature, index) => {
            const adaptedSignature: TypeOfKind<'CallSignature'> = {
              kind: 'CallSignature',
              text: signature.text,
              parameters: signature.parameters,
              returnType: signature.returnType,
              typeParameters: signature.typeParameters,
              thisType: signature.thisType,
              isAsync: signature.isAsync,
              isGenerator: signature.isGenerator,
              description: signature.description,
              tags: signature.tags,
              filePath: signature.filePath,
              position: signature.position,
            }

            const detail = renderCallSignatureDetails(
              adaptedSignature,
              components,
              {
                heading:
                  constructSignatures.length > 1
                    ? `Overload ${index + 1}`
                    : undefined,
                showSignatureText: true,
                descriptionStrategy: 'inherit',
              }
            )

            if (!detail) {
              return null
            }

            return <React.Fragment key={index}>{detail}</React.Fragment>
          })}
        </components.Signatures>
      </TypeDetail>
    )
  }

  return details
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
  const extensions = node.kind === 'Interface' ? (node.extends ?? []) : []
  const memberDetails = renderMembersDetails({
    members,
    components,
    ownerKind: node.kind,
  })

  return (
    <TypeSection
      kind={node.kind}
      title={node.name}
      description={node.description}
      id={id}
      components={components}
    >
      {renderTypeParametersDetail(node.typeParameters, components, node.kind)}
      {extensions.length ? (
        <TypeDetail label="Extends" components={components} kind={node.kind}>
          <components.Code>
            {extensions.map((extension, index) => (
              <React.Fragment key={index}>
                {index > 0 ? ', ' : null}
                {extension.text}
              </React.Fragment>
            ))}
          </components.Code>
        </TypeDetail>
      ) : null}
      {memberDetails}
    </TypeSection>
  )
}

function TypeLiteralSection({
  node,
  components,
  id,
}: {
  node: TypeOfKind<'TypeLiteral'>
  components: InternalReferenceComponents
  id?: string
}) {
  const memberDetails = renderMembersDetails({
    members: node.members,
    components,
    ownerKind: node.kind,
  })

  const showTypeText = memberDetails.length === 0

  return (
    <TypeSection kind={node.kind} id={id} components={components}>
      {memberDetails}
      {showTypeText ? (
        <TypeDetail
          key="type"
          label="Type"
          components={components}
          kind={node.kind}
        >
          <components.Code>{node.text}</components.Code>
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

function IndexedAccessSection({
  node,
  components,
  id,
}: {
  node: TypeOfKind<'IndexedAccessType'>
  components: InternalReferenceComponents
  id?: string
}) {
  return (
    <TypeSection kind={node.kind} id={id} components={components}>
      <TypeDetail label="Object Type" components={components} kind={node.kind}>
        <components.Code>{node.objectType.text}</components.Code>
      </TypeDetail>
      <TypeDetail label="Index Type" components={components} kind={node.kind}>
        <components.Code>{node.indexType.text}</components.Code>
      </TypeDetail>
      <TypeDetail label="Result" components={components} kind={node.kind}>
        <components.Code>{node.text}</components.Code>
      </TypeDetail>
    </TypeSection>
  )
}

function TypeOperatorSection({
  node,
  components,
  id,
}: {
  node: TypeOfKind<'TypeOperator'>
  components: InternalReferenceComponents
  id?: string
}) {
  return (
    <TypeSection kind={node.kind} id={id} components={components}>
      <TypeDetail label="Operator" components={components} kind={node.kind}>
        <components.Code>{node.operator}</components.Code>
      </TypeDetail>
      <TypeDetail label="Operand" components={components} kind={node.kind}>
        <components.Code>{node.type.text}</components.Code>
      </TypeDetail>
      <TypeDetail label="Result" components={components} kind={node.kind}>
        <components.Code>{node.text}</components.Code>
      </TypeDetail>
    </TypeSection>
  )
}

function TypeQuerySection({
  node,
  components,
  id,
}: {
  node: TypeOfKind<'TypeQuery'>
  components: InternalReferenceComponents
  id?: string
}) {
  return (
    <TypeSection kind={node.kind} id={id} components={components}>
      <TypeDetail label="Expression" components={components} kind={node.kind}>
        <components.Code>{node.name}</components.Code>
      </TypeDetail>
      {node.typeArguments?.length ? (
        <TypeDetail
          label="Type Arguments"
          components={components}
          kind={node.kind}
        >
          <components.Column gap="small">
            {node.typeArguments.map((typeArgument, index) => (
              <components.Code key={index}>{typeArgument.text}</components.Code>
            ))}
          </components.Column>
        </TypeDetail>
      ) : null}
      <TypeDetail label="Result" components={components} kind={node.kind}>
        <components.Code>{node.text}</components.Code>
      </TypeDetail>
    </TypeSection>
  )
}

function InferTypeSection({
  node,
  components,
  id,
}: {
  node: TypeOfKind<'InferType'>
  components: InternalReferenceComponents
  id?: string
}) {
  const typeParameterDetail = renderTypeParametersDetail(
    [node.typeParameter],
    components,
    node.kind
  )

  return (
    <TypeSection kind={node.kind} id={id} components={components}>
      {typeParameterDetail}
      <TypeDetail label="Result" components={components} kind={node.kind}>
        <components.Code>{node.text}</components.Code>
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
  typeParameterConstraints,
}: {
  node: TypeOfKind<'IntersectionType'>
  components: InternalReferenceComponents
  id?: string
  title?: string
  typeParameterConstraints?: Record<string, Kind.TypeExpression | undefined>
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

  function renderConditionalExtendsOperand(
    conditional: TypeOfKind<'ConditionalType'>
  ): React.ReactNode {
    if (
      conditional.extendsType.kind === 'TypeReference' &&
      conditional.extendsType.name
    ) {
      return <components.Code>{conditional.extendsType.name}</components.Code>
    }
    if (
      conditional.checkType.kind === 'TypeReference' &&
      conditional.checkType.name &&
      typeParameterConstraints
    ) {
      const constraint = typeParameterConstraints[conditional.checkType.name]
      if (constraint?.kind === 'TypeReference' && constraint.name) {
        return <components.Code>{constraint.name}</components.Code>
      }
    }
    return <components.Code>{conditional.extendsType.text}</components.Code>
  }

  function expandConditionalToLeaves(
    conditional: TypeOfKind<'ConditionalType'>
  ): Branch[] {
    const whenPart = (
      <>
        <components.Code>{conditional.checkType.text}</components.Code> extends{' '}
        {renderConditionalExtendsOperand(conditional)}
      </>
    )
    const elsePart = (
      <>
        <components.Code>{conditional.checkType.text}</components.Code> does not{' '}
        extend {renderConditionalExtendsOperand(conditional)}
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

function ConditionalSection({
  node,
  components,
  id,
  title,
  typeParameterConstraints,
}: {
  node: TypeOfKind<'ConditionalType'>
  components: InternalReferenceComponents
  id?: string
  title?: string
  typeParameterConstraints?: Record<string, Kind.TypeExpression | undefined>
}) {
  type Branch = {
    guardParts: React.ReactNode[]
    rows: IntersectionPropertyRow[]
    typeText?: string
  }

  function expandConditionalToLeaves(
    conditional: TypeOfKind<'ConditionalType'>
  ): Branch[] {
    function renderExtendsOperand(): React.ReactNode {
      // Prefer a named reference on the right side.
      if (
        conditional.extendsType.kind === 'TypeReference' &&
        conditional.extendsType.name
      ) {
        return <components.Code>{conditional.extendsType.name}</components.Code>
      }

      // Otherwise, if the check side is a type parameter with a referenced constraint, use that alias name.
      if (
        conditional.checkType.kind === 'TypeReference' &&
        conditional.checkType.name &&
        typeParameterConstraints
      ) {
        const constraint = typeParameterConstraints[conditional.checkType.name]
        if (constraint?.kind === 'TypeReference' && constraint.name) {
          return <components.Code>{constraint.name}</components.Code>
        }
      }

      // Fallback to full text.
      return <components.Code>{conditional.extendsType.text}</components.Code>
    }

    const whenPart = (
      <>
        <components.Code>{conditional.checkType.text}</components.Code> extends{' '}
        {renderExtendsOperand()}
      </>
    )
    const elsePart = (
      <>
        <components.Code>{conditional.checkType.text}</components.Code> does not{' '}
        extend {renderExtendsOperand()}
      </>
    )

    const trueArm = conditional.trueType
    const falseArm = conditional.falseType

    const trueLeaves: Branch[] =
      trueArm.kind === 'ConditionalType'
        ? expandConditionalToLeaves(trueArm).map((leaf) => ({
            guardParts: [whenPart, ...leaf.guardParts],
            rows: leaf.rows,
            typeText: leaf.typeText,
          }))
        : [
            {
              guardParts: [whenPart],
              rows: getIntersectionPropertyRows(trueArm),
              typeText: trueArm.text?.trim?.(),
            },
          ]

    const falseLeaves: Branch[] =
      falseArm.kind === 'ConditionalType'
        ? expandConditionalToLeaves(falseArm).map((leaf) => ({
            guardParts: [elsePart, ...leaf.guardParts],
            rows: leaf.rows,
            typeText: leaf.typeText,
          }))
        : [
            {
              guardParts: [elsePart],
              rows: getIntersectionPropertyRows(falseArm),
              typeText: falseArm.text?.trim?.(),
            },
          ]

    return [...trueLeaves, ...falseLeaves]
  }

  const leaves = expandConditionalToLeaves(node)

  function rowsToMap(
    rows: IntersectionPropertyRow[]
  ): Map<string, IntersectionPropertyRow> {
    const map = new Map<string, IntersectionPropertyRow>()
    for (const row of rows) {
      if (!isNeverTypeText(row.text)) map.set(row.name, row)
    }
    return map
  }

  const leafMaps = leaves.map((leaf) => rowsToMap(leaf.rows))

  // Always = rows present in every leaf with identical type
  const alwaysRows: IntersectionPropertyRow[] = []
  if (leafMaps.length > 0) {
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
      if (sameInAll) alwaysRows.push(row)
    }
  }
  const alwaysNames = new Set(alwaysRows.map((r) => r.name))

  const renderRow = (row: IntersectionPropertyRow, hasSubRow: boolean) => (
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

  let hasBranchDetails = false

  const branchDetails = leaves.map((leaf, index) => {
    const delta = leaf.rows.filter((row) => !alwaysNames.has(row.name))
    if (delta.length === 0) {
      return null
    }

    hasBranchDetails = true

    // Drop the root else guard when a more specific guard exists
    const guardsToShow =
      leaf.guardParts.length > 1 ? leaf.guardParts.slice(1) : leaf.guardParts

    const label = (
      <>
        {guardsToShow.map((part, i) => (
          <React.Fragment key={i}>
            {i > 0 ? ' and ' : null}
            {part}
          </React.Fragment>
        ))}
      </>
    )

    return (
      <TypeDetail
        key={index}
        label={label}
        components={components}
        kind={node.kind}
      >
        <TypeTable
          rows={delta}
          headers={['Property', 'Type']}
          renderRow={renderRow}
          components={components}
        />
      </TypeDetail>
    )
  })

  const hasDetails = alwaysRows.length > 0 || hasBranchDetails

  return (
    <TypeSection
      kind="ConditionalType"
      title={title}
      id={id}
      components={components}
    >
      {alwaysRows.length > 0 ? (
        <TypeDetail label="Properties" components={components} kind={node.kind}>
          <TypeTable
            rows={alwaysRows}
            headers={['Property', 'Type']}
            renderRow={renderRow}
            components={components}
          />
        </TypeDetail>
      ) : null}

      {branchDetails}

      {hasDetails ? null : (
        <TypeDetail
          key="type"
          label="Type"
          components={components}
          kind={node.kind}
        >
          <components.Code>{node.text}</components.Code>
        </TypeDetail>
      )}
    </TypeSection>
  )
}

function getTupleElementLabel(
  element: Kind.TupleElement,
  index: number
): string {
  const baseName = element.name ?? `#${index + 1}`
  const restPrefix = element.isRest ? '...' : ''
  const optionalSuffix = element.isOptional ? '?' : ''
  return `${restPrefix}${baseName}${optionalSuffix}`
}

function getTupleElementModifiers(element: Kind.TupleElement): string[] {
  const modifiers: string[] = []

  if (element.isRest) {
    modifiers.push('rest')
  }

  if (element.isOptional) {
    modifiers.push('optional')
  }

  if (element.isReadonly) {
    modifiers.push('readonly')
  }

  return modifiers
}

function TupleSection({
  node,
  components,
  id,
}: {
  node: TypeOfKind<'Tuple'>
  components: InternalReferenceComponents
  id?: string
}) {
  const elementRows = node.elements.map((element, index) => ({
    element,
    index,
  }))

  return (
    <TypeSection kind={node.kind} id={id} components={components}>
      {elementRows.length > 0 ? (
        <TypeDetail
          key="elements"
          label="Elements"
          components={components}
          kind={node.kind}
        >
          <TypeTable
            rows={elementRows}
            headers={['Element', 'Type', 'Modifiers']}
            renderRow={({ element, index }, hasSubRow) => (
              <>
                <components.TableData index={0} hasSubRow={hasSubRow}>
                  {getTupleElementLabel(element, index)}
                </components.TableData>
                <components.TableData index={1} hasSubRow={hasSubRow}>
                  <components.Code>{element.type.text}</components.Code>
                </components.TableData>
                <components.TableData index={2} hasSubRow={hasSubRow}>
                  <components.Code>
                    {(() => {
                      const modifiers = getTupleElementModifiers(element)
                      return modifiers.length ? modifiers.join(', ') : '—'
                    })()}
                  </components.Code>
                </components.TableData>
              </>
            )}
            components={components}
          />
        </TypeDetail>
      ) : null}
      <TypeDetail
        key="type"
        label="Type"
        components={components}
        kind={node.kind}
      >
        <components.Code>{node.text}</components.Code>
      </TypeDetail>
    </TypeSection>
  )
}

function UnionTypeSection({
  node,
  components,
  id,
  title,
}: {
  node: TypeOfKind<'UnionType'>
  components: InternalReferenceComponents
  id?: string
  title?: string
}) {
  return (
    <TypeSection kind={node.kind} id={id} components={components} title={title}>
      <TypeDetail
        key="type"
        label="Type"
        components={components}
        kind={node.kind}
      >
        <components.Code>{node.text}</components.Code>
      </TypeDetail>
    </TypeSection>
  )
}

function TypeReferenceSection({
  node,
  components,
  id,
}: {
  node: TypeOfKind<'TypeReference'>
  components: InternalReferenceComponents
  id?: string
}) {
  const typeArgumentRows =
    node.typeArguments?.map((argument, index) => ({ argument, index })) ?? []

  return (
    <TypeSection kind={node.kind} id={id} components={components}>
      {node.name ? (
        <TypeDetail
          key="name"
          label="Name"
          components={components}
          kind={node.kind}
        >
          <components.Code>{node.name}</components.Code>
        </TypeDetail>
      ) : null}
      {node.moduleSpecifier ? (
        <TypeDetail
          key="module"
          label="Module"
          components={components}
          kind={node.kind}
        >
          <components.Code>{node.moduleSpecifier}</components.Code>
        </TypeDetail>
      ) : null}
      {typeArgumentRows.length > 0 ? (
        <TypeDetail
          key="type-arguments"
          label="Type Arguments"
          components={components}
          kind={node.kind}
        >
          <TypeTable
            rows={typeArgumentRows}
            headers={['Argument', 'Type']}
            renderRow={({ argument, index }, hasSubRow) => (
              <>
                <components.TableData index={0} hasSubRow={hasSubRow}>
                  <components.Code>{`#${index + 1}`}</components.Code>
                </components.TableData>
                <components.TableData index={1} hasSubRow={hasSubRow}>
                  <components.Code>{argument.text}</components.Code>
                </components.TableData>
              </>
            )}
            components={components}
          />
        </TypeDetail>
      ) : null}
      <TypeDetail
        key="type"
        label="Type"
        components={components}
        kind={node.kind}
      >
        <components.Code>{node.text}</components.Code>
      </TypeDetail>
    </TypeSection>
  )
}

function getLiteralValueText(node: Kind.TypeExpression): string | undefined {
  if (node.kind === 'String' && node.value !== undefined) {
    return JSON.stringify(node.value)
  }

  if (node.kind === 'Number' && node.value !== undefined) {
    return String(node.value)
  }

  if (node.kind === 'BigInt' && node.value !== undefined) {
    return String(node.value)
  }

  return undefined
}

function TypeExpressionSection({
  node,
  components,
}: {
  node: Kind.TypeExpression
  components: InternalReferenceComponents
}) {
  const literalValue = getLiteralValueText(node)

  return (
    <TypeSection kind={node.kind} components={components}>
      <TypeDetail label="Type" components={components} kind={node.kind}>
        <components.Code>{node.text}</components.Code>
      </TypeDetail>
      {literalValue !== undefined ? (
        <TypeDetail label="Value" components={components} kind={node.kind}>
          <components.Code>{literalValue}</components.Code>
        </TypeDetail>
      ) : null}
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

function getConstructorSignatureText(
  signature: TypeOfKind<'CallSignature'>,
  className?: string
): string {
  const typeParametersText = getTypeParameterNamesText(signature)
  const parametersText = signature.parameters
    .map((parameter, index) => {
      let restPrefix = parameter.isRest ? '...' : ''
      let name = parameter.name

      if (!name && parameter.text) {
        const parameterName = parameter.text.split(':')[0]?.trim()

        if (parameterName) {
          if (!restPrefix && parameterName.startsWith('...')) {
            restPrefix = '...'
          }

          name = parameterName.replace(/^\.\.\./, '')
        }
      }

      if (!name) {
        name = `arg${index + 1}`
      }

      const optionalSuffix = parameter.isOptional ? '?' : ''

      return `${restPrefix}${name}${optionalSuffix}`
    })
    .join(', ')
  const base = className ? `new ${className}` : 'constructor'

  return `${base}${typeParametersText}(${parametersText})`
}

function getCallSignatureText(signature: TypeOfKind<'CallSignature'>): string {
  const returnTypeText = signature.returnType?.text
    ? abbreviateTypeText(signature.returnType.text)
    : undefined

  const typeParametersText = getTypeParameterNamesText(signature)
  const parameterTexts: string[] = []

  if (signature.thisType) {
    const thisText = signature.thisType.text
      ? abbreviateTypeText(signature.thisType.text)
      : undefined

    if (thisText) {
      parameterTexts.push(`this: ${thisText}`)
    }
  }

  signature.parameters.forEach((parameter) => {
    const typeText = parameter.type?.text

    if (typeText) {
      const formattedType = abbreviateTypeText(typeText)
      const restPrefix = parameter.isRest ? '...' : ''
      const name = parameter.name
      const optionalSuffix = name && parameter.isOptional ? '?' : ''
      const namePortion = name
        ? `${restPrefix}${name}${optionalSuffix}: `
        : restPrefix

      parameterTexts.push(`${namePortion}${formattedType}`)
    } else if (parameter.text) {
      parameterTexts.push(parameter.text)
    } else if (parameter.name) {
      const restPrefix = parameter.isRest ? '...' : ''
      const optionalSuffix = parameter.isOptional ? '?' : ''

      parameterTexts.push(`${restPrefix}${parameter.name}${optionalSuffix}`)
    }
  })

  const parametersText = `(${parameterTexts.join(', ')})`
  const trimmedSignatureText = signature.text.trim()

  if (trimmedSignatureText.startsWith('function')) {
    const nameMatch = trimmedSignatureText.match(/^function\s+([^(<]+)/)
    const functionName = nameMatch?.[1]?.trim()
    const nameSegment = functionName ? ` ${functionName}` : ''

    const returnPortion = returnTypeText ? `: ${returnTypeText}` : ''

    return `function${nameSegment}${typeParametersText}${parametersText}${returnPortion}`
  }

  if (returnTypeText) {
    return `${typeParametersText}${parametersText} => ${returnTypeText}`
  }

  const fallbackText = abbreviateTypeText(trimmedSignatureText)

  if (fallbackText) {
    return fallbackText
  }

  return `${typeParametersText}${parametersText}`
}

function getTypeParameterNamesText(
  signature: TypeOfKind<'CallSignature'>
): string {
  if (!signature.typeParameters?.length) {
    return ''
  }

  const labels = signature.typeParameters
    .map((typeParameter) => {
      if (typeParameter.name && typeParameter.name.trim()) {
        return typeParameter.name
      }

      if (typeParameter.text) {
        const nameMatch = typeParameter.text.trim().match(/^[^\s<>=]+/)

        if (nameMatch?.[0]) {
          return nameMatch[0]
        }
      }

      return undefined
    })
    .filter((label): label is string => Boolean(label && label.trim()))

  if (!labels.length) {
    return ''
  }

  return `<${labels.join(', ')}>`
}

function abbreviateTypeText(typeText: string): string {
  const trimmed = typeText.trim()

  if (!trimmed.includes('<')) {
    return trimmed
  }

  const startIndex = trimmed.indexOf('<')

  if (startIndex === -1) {
    return trimmed
  }

  let depth = 0
  let endIndex = -1

  for (let index = startIndex; index < trimmed.length; index += 1) {
    const character = trimmed[index]

    if (character === '<') {
      depth += 1
      continue
    }

    if (character === '>' && depth > 0) {
      if (trimmed[index - 1] === '=') {
        continue
      }

      depth -= 1

      if (depth === 0) {
        endIndex = index
        break
      }
    }
  }

  if (startIndex === -1 || endIndex === -1) {
    return trimmed
  }

  const before = trimmed.slice(0, startIndex)
  const after = trimmed.slice(endIndex + 1)

  return `${before}<…>${after}`
}

/** Return the preferred text representation for a parameter. */
function getParameterText(parameter?: Kind.Parameter): string {
  if (!parameter) {
    return '—'
  }

  const typeText = parameter.type?.text

  if (typeText) {
    const restPrefix = parameter.isRest ? '...' : ''
    return `${restPrefix}${typeText}`
  }

  if (parameter.text) {
    return parameter.text
  }

  return '—'
}

/** Convert kind name from PascalCase to space separated label. */
function kindToLabel(kind: string): string {
  return kind.replace(/([a-z])([A-Z])/g, '$1 $2')
}
