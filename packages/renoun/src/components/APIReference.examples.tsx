import React from 'react'
import {
  APIReference,
  TypeProperties,
  getAPIReferenceConfig,
  getAPIReferenceType,
} from 'renoun/components'
import { isMemberType } from 'renoun/utils'

export function Table() {
  return (
    <APIReference source="./GitProvider.tsx" workingDirectory={import.meta.url}>
      <PropsTable />
    </APIReference>
  )
}

function PropRow() {
  const prop = getAPIReferenceType()
  const { CodeInline, MDXRenderer } = getAPIReferenceConfig()

  if (!prop) return null

  const isOptional = isMemberType(prop) ? prop.isOptional : undefined
  const defaultValue = isMemberType(prop) ? prop.defaultValue : undefined

  return (
    <tr>
      <td>
        <code>
          {prop.name}
          {isOptional ? '?' : null}
        </code>
      </td>

      <td>
        <CodeInline children={prop.text} language="typescript" />
      </td>

      <td style={{ whiteSpace: 'nowrap' }}>
        {defaultValue !== undefined && (
          <CodeInline
            children={JSON.stringify(defaultValue)}
            language="typescript"
          />
        )}
      </td>

      <td>
        {prop.description ? <MDXRenderer children={prop.description} /> : null}
      </td>
    </tr>
  )
}

/** Turns the *current* Object/Intersection into a <table> */
function PropsTable() {
  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Default</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <TypeProperties Value={PropRow} />
      </tbody>
    </table>
  )
}
