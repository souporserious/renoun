/** @jsxImportSource restyle */
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
import { Markdown as MarkdownDefault, type MarkdownProps } from './Markdown.js'

type SemanticTags =
  | 'section'
  | 'h3'
  | 'h4'
  | 'p'
  | 'dl'
  | 'dt'
  | 'dd'
  | 'table'
  | 'thead'
  | 'tbody'
  | 'tr'
  | 'th'
  | 'td'
  | 'code'

export type TypeReferenceComponents = {
  [Tag in SemanticTags]: Tag | React.ComponentType<React.ComponentProps<Tag>>
} & {
  Markdown: React.ComponentType<MarkdownProps>
  SubRow: React.ComponentType<React.ComponentProps<'tr'>>
}

const defaultComponents: TypeReferenceComponents = {
  section: 'section',
  h3: 'h3',
  h4: 'h4',
  p: 'p',
  dl: 'dl',
  dt: 'dt',
  dd: 'dd',
  table: 'table',
  thead: 'thead',
  tbody: 'tbody',
  tr: 'tr',
  th: 'th',
  td: 'td',
  code: 'code',
  Markdown: MarkdownDefault,
  SubRow: (props) => <Collapse.Content as="tr" {...props} />,
}

export interface TypeReferenceProps {
  /** The file path, `JavaScriptFile`, or `JavaScriptFileExport` type reference to resolve. */
  source: string | JavaScriptFile<any> | JavaScriptFileExport<any>

  /** Optional filter for exported symbols. */
  filter?: SymbolFilter

  /** Base directory for relative `source` values. */
  baseDirectory?: string

  /** Override default component renderers. */
  components?: Partial<TypeReferenceComponents>
}

export function TypeReference(props: TypeReferenceProps) {
  return (
    <Suspense>
      <TypeReferenceAsync {...props} />
    </Suspense>
  )
}

async function TypeReferenceAsync({
  source,
  filter,
  baseDirectory,
  components = {},
}: TypeReferenceProps) {
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

  const mergedComponents: TypeReferenceComponents = {
    ...defaultComponents,
    ...components,
  }

  return (
    <WorkingDirectoryContext value={filePath ? dirname(filePath) : undefined}>
      {Array.isArray(resolvedType) ? (
        resolvedType.map((type, index) => (
          <TypeNodeRouter
            key={index}
            type={type}
            components={mergedComponents}
          />
        ))
      ) : (
        <TypeNodeRouter type={resolvedType} components={mergedComponents} />
      )}
    </WorkingDirectoryContext>
  )
}

function TypeNodeRouter({
  type,
  components,
}: {
  type: Kind.All
  components: TypeReferenceComponents
}) {
  switch (type.kind) {
    case 'Class':
      return <ClassSection node={type} components={components} />
    case 'Component':
      return <ComponentSection node={type} components={components} />
    case 'Function':
      return <FunctionSection node={type} components={components} />
    case 'Interface':
      return <MembersSection node={type} components={components} />
    case 'TypeAlias':
      if (type.type.kind === 'TypeLiteral') {
        return (
          <MembersSection
            node={type as Kind.TypeAlias<Kind.TypeLiteral>}
            components={components}
          />
        )
      }
      return <TypeAliasSection node={type} components={components} />
    case 'UnionType':
      return <UnionSection node={type} components={components} />
    case 'IntersectionType':
      return <IntersectionSection node={type} components={components} />
    case 'MappedType':
      return <MappedSection node={type} components={components} />
    case 'Array':
    case 'Tuple':
    case 'Enum':
    case 'TypeLiteral':
    case 'TypeReference':
    case 'String':
    case 'Number':
    case 'Boolean':
    case 'Symbol':
    case 'Any':
    case 'Unknown':
      // Convert kind name from PascalCase to space separated label
      const label = type.kind.replace(/([a-z])([A-Z])/g, '$1 $2')

      // return (
      //   <TypeSection
      //     label={label}
      //     title={type.name ?? type.text}
      //     id={type.name}
      //     components={components}
      //   >
      //     <components.code>{type.text}</components.code>
      //   </TypeSection>
      // )
      return 'TODO: TypeNodeRouter not implemented for kind: ' + type.kind
    default:
      throw new Error(`[renoun]: Unknown type kind "${type.kind}"`)
  }
}

function TypeSection({
  label,
  title,
  id,
  children,
  components,
}: {
  label: string
  title?: string
  id?: string
  children: React.ReactNode
  components: TypeReferenceComponents
}) {
  return (
    <Collapse.Provider>
      <components.section id={id} style={{ position: 'relative' }}>
        <components.h3 aria-label={`${title} ${label}`}>
          <span>{label}</span> {title}
        </components.h3>
        <Collapse.Content>{children}</Collapse.Content>
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
  components: TypeReferenceComponents
}) {
  return (
    <div css={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {label ? <components.h4>{label}</components.h4> : null}
      {children}
    </div>
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
  components: TypeReferenceComponents
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
                <components.SubRow>
                  <components.td colSpan={3}>{subRow}</components.td>
                </components.SubRow>
              ) : null}
            </Collapse.Provider>
          )
        })}
      </components.tbody>
    </components.table>
  )
}

type ComponentsType = TypeReferenceComponents

function ComponentSection({
  node,
  components,
}: {
  node: TypeOfKind<'Component'>
  components: ComponentsType
}) {
  return (
    <TypeSection
      label="Component"
      title={node.name}
      id={node.name}
      components={components}
    >
      {node.signatures.map((signature, index) => {
        return (
          <React.Fragment key={index}>
            {node.signatures.length > 1 ? (
              <components.h4>Overload {index + 1}</components.h4>
            ) : null}

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
                          TODO: handle separate table for default values
                          {/* <DefaultValue
                          value={property.defaultValue}
                          components={components}
                        /> */}
                        </components.td>
                      </>
                    ) : (
                      <components.td colSpan={3}>
                        TODO: add support for {property.kind}
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
          </React.Fragment>
        )
      })}
    </TypeSection>
  )
}

function TypeAliasSection({
  node,
  components,
}: {
  node: TypeOfKind<'TypeAlias'>
  components: ComponentsType
}) {
  return (
    <TypeSection
      label="Type Alias"
      title={node.name}
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
  components: ComponentsType
}) {
  const members = node.kind === 'Interface' ? node.members : node.type.members

  return (
    <TypeSection
      label={node.kind === 'Interface' ? 'Interface' : 'Type Literal'}
      title={node.name}
      id={node.name}
      components={components}
    >
      <TypeDetail label="Members" components={components}>
        <TypeTable
          rows={members}
          headers={['Property', 'Type']}
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
              </>
            ) : (
              'TODO: add support for ' + property.kind
            )
          }
          components={components}
        />
      </TypeDetail>
    </TypeSection>
  )
}

function UnionSection({
  node,
  components,
}: {
  node: TypeOfKind<'UnionType'>
  components: ComponentsType
}) {
  return 'TODO: UnionSection not implemented yet'
  // return (
  //   <TypeSection
  //     label="Union"
  //     title={node.name}
  //     id={node.name}
  //     components={components}
  //   >
  //     <TypeDetail label="Members" components={components}>
  //       <components.code>{node.text}</components.code>
  //     </TypeDetail>
  //   </TypeSection>
  // )
}

function IntersectionSection({
  node,
  components,
}: {
  node: TypeOfKind<'IntersectionType'>
  components: TypeReferenceComponents
}) {
  // Flatten into one table if every member is either an Object or a Mapped kind
  // if (
  //   node.types.length > 1 &&
  //   node.types.every(
  //     (type) =>
  //       type.kind === 'Interface' ||
  //       type.kind === 'TypeAlias' ||
  //       type.kind === 'MappedType'
  //   )
  // ) {
  //   const rows: {
  //     name: string
  //     text: string
  //     defaultValue?: unknown
  //     isOptional?: boolean
  //     isReadonly?: boolean
  //   }[] = []

  //   for (const type of node.types) {
  //     if (type.kind === 'Object') {
  //       type.propertySignatures.forEach((signature) =>
  //         rows.push({
  //           name: signature.name ?? '-',
  //           text: signature.text,
  //           defaultValue: signature.defaultValue,
  //           isOptional: signature.isOptional,
  //         })
  //       )
  //       type.indexSignatures?.forEach((signature) =>
  //         rows.push({
  //           name: signature.key.text,
  //           text: signature.value.text,
  //         })
  //       )
  //     } else if (type.kind === 'MappedType') {
  //       rows.push({
  //         name: type.parameter.text,
  //         text: type.type.text,
  //         isOptional: type.isOptional,
  //         isReadonly: type.isReadonly,
  //       })
  //     }
  //   }

  //   return (
  //     <TypeSection
  //       label="Object"
  //       title={node.name}
  //       id={node.name}
  //       components={components}
  //     >
  //       <TypeDetail label="Properties" components={components}>
  //         <TypeTable
  //           rows={rows}
  //           headers={['Property', 'Type', 'Default Value']}
  //           renderRow={(r) => (
  //             <>
  //               <components.td>
  //                 {r.name}
  //                 {r.isOptional ? '?' : ''}
  //               </components.td>
  //               <components.td>
  //                 <components.code>{r.text}</components.code>
  //               </components.td>
  //               <components.td>
  //                 {r.defaultValue == null ? (
  //                   '—'
  //                 ) : (
  //                   <components.code>
  //                     {JSON.stringify(r.defaultValue)}
  //                   </components.code>
  //                 )}
  //               </components.td>
  //             </>
  //           )}
  //           components={components}
  //         />
  //       </TypeDetail>
  //     </TypeSection>
  //   )
  // }

  // return (
  //   <TypeSection
  //     label="Intersection"
  //     title={node.name}
  //     id={node.name}
  //     components={components}
  //   >
  //     <div css={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
  //       {node.types.map((type, index) => (
  //         <div
  //           key={index}
  //           css={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
  //         >
  //           <TypeNodeRouter type={type} components={components} />
  //         </div>
  //       ))}
  //     </div>
  //   </TypeSection>
  // )

  return 'TODO: IntersectionSection not implemented yet'
}

function renderParameterRow(
  parameter: TypeOfKind<'Parameter'>,
  components: ComponentsType
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
  components: ComponentsType
}) {
  return (
    <TypeSection
      label="Function"
      title={node.name}
      id={node.name}
      components={components}
    >
      {node.signatures.map((signature, index) => (
        <React.Fragment key={index}>
          {node.signatures.length > 1 ? (
            <components.h4>Overload {index + 1}</components.h4>
          ) : null}

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

          <TypeDetail label="Returns" components={components}>
            <components.code>{signature.returnType.text}</components.code>
          </TypeDetail>
        </React.Fragment>
      ))}
    </TypeSection>
  )
}

function renderClassPropertyRow(
  property: NonNullable<TypeOfKind<'Class'>['properties']>[number],
  components: ComponentsType
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
  components: ComponentsType
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
  components: ComponentsType
) {
  const signature = method.signatures[0]

  return (
    <>
      {signature.parameters.length ? (
        <TypeDetail components={components}>
          <TypeTable
            rows={signature.parameters}
            headers={['Parameter', 'Type', 'Default Value']}
            renderRow={(p) => renderParameterRow(p, components)}
            components={components}
          />
        </TypeDetail>
      ) : null}

      <TypeDetail components={components}>
        <components.code>{signature.returnType.text}</components.code>
      </TypeDetail>
    </>
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
    <TypeSection
      label="Class"
      title={node.name}
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
            <div
              css={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
            >
              <components.h4>Extends</components.h4>
              <components.code>{node.extends.text}</components.code>
            </div>
          ) : null}

          {node.implements?.length ? (
            <div
              css={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
            >
              <components.h4>Implements</components.h4>
              {node.implements.map((implementation, index) => (
                <React.Fragment key={index}>
                  {index > 0 ? ', ' : null}
                  <components.code>{implementation.text}</components.code>
                </React.Fragment>
              ))}
            </div>
          ) : null}
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
  components: ComponentsType
}) {
  // const parameterText = `${node.parameter.name} in ${node.parameter.constraint?.text ?? '?'}`
  // const valueText = node.type.text

  // return (
  //   <TypeSection
  //     label="Mapped"
  //     title={node.name}
  //     id={node.name}
  //     components={components}
  //   >
  //     <TypeDetail label="Parameter" components={components}>
  //       <components.code>{parameterText}</components.code>
  //     </TypeDetail>
  //     <TypeDetail label="Type" components={components}>
  //       <components.code>{valueText}</components.code>
  //     </TypeDetail>
  //     <TypeDetail label="Modifiers" components={components}>
  //       <components.code>
  //         {node.isReadonly ? 'readonly ' : null}
  //         {node.isOptional ? 'optional' : null}
  //         {!node.isReadonly && !node.isOptional ? '—' : null}
  //       </components.code>
  //     </TypeDetail>
  //   </TypeSection>
  // )

  return 'TODO: MappedSection not implemented yet'
}

function InitializerValue({
  initializer,
  components,
}: {
  initializer: Kind.Initializer | undefined
  components: TypeReferenceComponents
}) {
  if (initializer === undefined) {
    return '—'
  }

  const valueType = typeof initializer.value
  let valueString: string | undefined = undefined

  if (
    valueType === 'string' ||
    valueType === 'number' ||
    valueType === 'boolean'
  ) {
    valueString = String(initializer.value)
  }

  try {
    valueString = JSON.stringify(initializer.value)
  } catch {
    valueString = initializer.text
  }

  return <components.code>{valueString}</components.code>
}

/** Stub for docs generator TODO: fix this from erroring the page */
export function APIReference() {
  return null
}
