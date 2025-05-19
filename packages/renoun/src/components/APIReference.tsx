/** @jsxImportSource restyle */
import React, { Suspense } from 'react'
import { dirname, resolve } from 'node:path'

import {
  JavaScriptFile,
  type JavaScriptFileExport,
} from '../file-system/index.js'
import {
  type ResolvedType,
  type SymbolFilter,
  type TypeOfKind,
} from '../utils/resolve-type.js'
import { Markdown as MarkdownDefault, type MarkdownProps } from './Markdown.js'
import { WorkingDirectoryContext } from './Context.js'

type SemanticTags =
  | 'section'
  | 'h2'
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
  | 'details'
  | 'summary'
  | 'code'

type SemanticComponent<Tag extends SemanticTags> =
  | Tag
  | React.JSXElementConstructor<React.JSX.IntrinsicElements[Tag]>

export type TypeReferenceComponents = {
  [Tag in SemanticTags]: SemanticComponent<Tag>
} & {
  Markdown: React.ComponentType<MarkdownProps>
}

const defaultComponents: TypeReferenceComponents = {
  section: 'section',
  h2: 'h2',
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
  details: 'details',
  summary: 'summary',
  code: 'code',
  Markdown: MarkdownDefault,
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

  let resolvedType: ResolvedType | ResolvedType[] | undefined

  if (source instanceof JavaScriptFile) {
    const exported = await Promise.all(
      (await source.getExports()).map((fileExport) =>
        fileExport.getType(filter)
      )
    )
    resolvedType = exported.filter(Boolean) as ResolvedType[]
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
  type: ResolvedType
  components: TypeReferenceComponents
}) {
  switch (type.kind) {
    case 'Component':
      return <ComponentSection node={type} components={components} />
    case 'Object':
      return <ObjectSection node={type} components={components} />
    case 'Union':
      return <UnionSection node={type} components={components} />
    case 'Function':
      return <FunctionSection node={type} components={components} />
    case 'Class':
      return <ClassSection node={type} components={components} />
    default:
      return null
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
    <components.section id={id}>
      <components.h2 aria-label={`${title} ${label}`}>
        <span>{label}</span> {title}
      </components.h2>
      {children}
    </components.section>
  )
}

function TypeDetail({
  label,
  children,
  components,
}: {
  label: React.ReactNode
  children: React.ReactNode
  components: TypeReferenceComponents
}) {
  return (
    <div>
      <components.h3>{label}</components.h3>
      {children}
    </div>
  )
}

function TypeTable<RowType>({
  rows,
  headers,
  renderRow,
  components,
}: {
  rows: readonly RowType[]
  headers?: readonly React.ReactNode[]
  renderRow: (row: RowType, index: number) => React.ReactNode
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
        {rows.map((row, index) => (
          <components.tr key={index}>{renderRow(row, index)}</components.tr>
        ))}
      </components.tbody>
    </components.table>
  )
}

function Disclosure({
  summary,
  children,
  components,
}: {
  summary: React.ReactNode
  children: React.ReactNode
  components: TypeReferenceComponents
}) {
  return (
    <components.details>
      <components.summary>{summary}</components.summary>
      {children}
    </components.details>
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
              {signature.parameter?.kind === 'Object' ? (
                <TypeTable
                  rows={signature.parameter.properties}
                  headers={['Property', 'Type', 'Default Value']}
                  renderRow={(property) => (
                    <>
                      <components.td>
                        {property.name}
                        {property.isOptional ? '?' : ''}
                      </components.td>
                      <components.td>
                        <components.code>{property.text}</components.code>
                      </components.td>
                      <components.td>
                        <DefaultValue
                          value={property.defaultValue}
                          components={components}
                        />
                      </components.td>
                    </>
                  )}
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

function ObjectSection({
  node,
  components,
}: {
  node: TypeOfKind<'Object'>
  components: ComponentsType
}) {
  return (
    <TypeSection
      label="Object"
      title={node.name}
      id={node.name}
      components={components}
    >
      <TypeDetail label="Properties" components={components}>
        <TypeTable
          rows={node.properties}
          headers={['Property', 'Type', 'Default Value']}
          renderRow={(property) => (
            <>
              <components.td>
                {property.name}
                {property.isOptional ? '?' : ''}
              </components.td>
              <components.td>
                <components.code>{property.text}</components.code>
              </components.td>
              <components.td>
                <DefaultValue
                  value={property.defaultValue}
                  components={components}
                />
              </components.td>
            </>
          )}
          components={components}
        />

        {node.indexSignatures?.length ? (
          <>
            <components.h4>Additional Properties</components.h4>
            {node.indexSignatures.map((signature, index) => (
              <components.code key={index}>
                {[signature.key.text, signature.value.text].join(': ')}
              </components.code>
            ))}
          </>
        ) : null}
      </TypeDetail>
    </TypeSection>
  )
}

function UnionSection({
  node,
  components,
}: {
  node: TypeOfKind<'Union'>
  components: ComponentsType
}) {
  return (
    <TypeSection
      label="Union"
      title={node.name}
      id={node.name}
      components={components}
    >
      <TypeDetail label="Members" components={components}>
        <components.code>{node.text}</components.code>
      </TypeDetail>
    </TypeSection>
  )
}

function renderParameterRow(
  parameter: TypeOfKind<'Function'>['signatures'][0]['parameters'][number],
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
        <DefaultValue value={parameter.defaultValue} components={components} />
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
            <components.code>{signature.returnType}</components.code>
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
        <DefaultValue value={property.defaultValue} components={components} />
      </components.td>
    </>
  )
}

function renderMethod(
  method: NonNullable<TypeOfKind<'Class'>['methods']>[number],
  components: ComponentsType
) {
  const signature = method.signatures[0]

  return (
    <Disclosure
      key={method.name}
      summary={<components.code>{signature.text}</components.code>}
      components={components}
    >
      {signature.parameters.length > 0 ? (
        <TypeDetail label="Parameters" components={components}>
          <TypeTable
            rows={signature.parameters}
            headers={['Parameter', 'Type', 'Default Value']}
            renderRow={(param) => renderParameterRow(param, components)}
            components={components}
          />
        </TypeDetail>
      ) : null}
      <TypeDetail label="Returns" components={components}>
        <components.code>{signature.returnType}</components.code>
      </TypeDetail>
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
            renderRow={(prop) => renderClassPropertyRow(prop, components)}
            components={components}
          />
        </TypeDetail>
      ) : null}

      {node.methods?.length ? (
        <TypeDetail label="Methods" components={components}>
          {node.methods.map((m) => renderMethod(m, components))}
        </TypeDetail>
      ) : null}

      {node.extends || node.implements?.length ? (
        <TypeDetail label="Heritage" components={components}>
          {node.extends ? (
            <div
              css={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
            >
              <components.h3>Extends</components.h3>
              <components.code>{node.extends.text}</components.code>
            </div>
          ) : null}

          {node.implements?.length ? (
            <div
              css={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
            >
              <components.h3>Implements</components.h3>
              {node.implements.map((implementor, index) => (
                <React.Fragment key={index}>
                  {index > 0 ? ', ' : null}
                  <components.code>{implementor.text}</components.code>
                </React.Fragment>
              ))}
            </div>
          ) : null}
        </TypeDetail>
      ) : null}
    </TypeSection>
  )
}

function DefaultValue({
  value,
  components,
}: {
  value: unknown
  components: TypeReferenceComponents
}) {
  if (value === undefined) {
    return '—'
  }

  const valueType = typeof value
  let valueString: string | undefined = undefined

  if (
    valueType === 'string' ||
    valueType === 'number' ||
    valueType === 'boolean'
  ) {
    valueString = String(value)
  }

  try {
    valueString = JSON.stringify(value)
  } catch {
    valueString = String(value)
  }

  return <components.code>{valueString}</components.code>
}

/** Stub for docs generator TODO: fix this from erroring the page */
export function APIReference() {
  return null
}
