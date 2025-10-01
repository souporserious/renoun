import { Link, Logo, JavaScriptFile } from 'renoun'

const file = new JavaScriptFile({
  path: '../../packages/renoun/src/components/Link/Link.tsx',
})

export async function BasicUsage() {
  return (
    <Link
      variant="repository"
      css={{ display: 'flex', width: '1.5rem', height: '1.5rem' }}
    />
  )
}

export function ViewSource() {
  return (
    <Link source={file} variant="source">
      View Source
    </Link>
  )
}

export function GitRepositoryCustom() {
  return (
    <Link
      variant="repository"
      css={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
    >
      <Logo variant="gitHost" width="1em" height="1em" />
      <span>View Repository</span>
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
        <Link variant="gitHost">Host</Link>
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
