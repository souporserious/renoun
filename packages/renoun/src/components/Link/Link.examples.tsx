import * as React from 'react'

import { Link, JavaScriptFile } from 'renoun'

const file = new JavaScriptFile({
  path: '../../packages/renoun/src/components/Link/Link.tsx',
})

export async function BasicUsage() {
  return (
    <Link source={file} variant="source">
      View Source
    </Link>
  )
}

export async function CustomElement() {
  return (
    <Link source={file} variant="edit">
      {(href) => <a href={href}>Edit Source</a>}
    </Link>
  )
}

export function ConfigLinks() {
  return (
    <ul>
      <li>
        <Link variant="gitProvider">Provider</Link>
      </li>
      <li>
        <Link variant="repository">Repository</Link>
      </li>
      <li>
        <Link variant="owner">Owner</Link>
      </li>
      <li>
        <Link variant="branch" options={{ ref: 'release' }}>
          Branch
        </Link>
      </li>
      <li>
        <Link variant="issue">New Issue</Link>
      </li>
    </ul>
  )
}
