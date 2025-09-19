import {
  Directory,
  isDirectory,
  isJavaScriptFile,
  isMDXFile,
  Navigation,
  ModuleExportNotFoundError,
  type FileSystemEntry,
  type NavigationComponents,
  type NavigationProps,
} from 'renoun'

import { SidebarLink } from './SidebarLink'

const components: Partial<NavigationComponents> = {
  Root: ({ children }) => (
    <ul
      css={{
        fontSize: 'var(--font-size-body-2)',
        display: 'flex',
        flexDirection: 'column',
        listStyle: 'none',
        paddingLeft: 0,
      }}
    >
      {children}
    </ul>
  ),
  List: ({ entry, children }) => {
    return (
      <ul
        style={{
          '--depth': isDirectory(entry) ? entry.getDepth() : 0,
        }}
        css={{
          listStyle: 'none',
          fontSize: 'var(--font-size-body-2)',
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: '0.25rem',
          marginLeft: '0.25rem',
          borderLeft: '1px solid var(--color-separator)',
        }}
      >
        {children}
      </ul>
    )
  },
  Link: async ({ entry, pathname }) => {
    const metadata = await getEntryMetadata(entry)
    let label: string

    if (metadata?.label) {
      label = metadata.label
    } else if (metadata?.title) {
      label = metadata.title
    } else if (isDirectory(entry)) {
      label = getDirectoryLabel(entry)
    } else {
      label = await getFileLabel(entry)
    }

    return (
      <SidebarLink
        pathname={pathname}
        label={label}
        css={{
          paddingLeft: `calc(var(--depth) * 0.8rem)`,
        }}
      />
    )
  },
}

export function TreeNavigation(props: Omit<NavigationProps, 'components'>) {
  return <Navigation {...props} components={components} />
}

async function getEntryMetadata(entry: FileSystemEntry<any>) {
  if (!(isJavaScriptFile(entry) || isMDXFile(entry))) {
    return undefined
  }

  try {
    return await entry.getExportValue<{ title?: string; label?: string }>(
      'metadata'
    )
  } catch (error) {
    if (error instanceof ModuleExportNotFoundError) {
      return undefined
    }
    throw error
  }
}

async function getFileLabel(entry: FileSystemEntry<any>) {
  const name = entry.getBaseName()

  // If the file name is kebab-case, use the first export as the label if possible.
  if (name.includes('-') && isJavaScriptFile(entry)) {
    const firstExport = await entry
      .getExports()
      .then((fileExports) => fileExports[0])

    if (firstExport) {
      return firstExport.getName()
    }
  }

  return name
}

function getDirectoryLabel(entry: Directory<any>) {
  return entry.getBaseName()
}
