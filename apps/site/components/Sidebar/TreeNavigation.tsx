import { Children, Fragment, cloneElement, isValidElement } from 'react'
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

import {
  SidebarCollapseContent,
  SidebarCollapseProvider,
} from './SidebarCollapseProvider'
import { SidebarLink } from './SidebarLink'

const components: Partial<NavigationComponents> = {
  Root: Fragment,
  List: ({ depth, children }) => {
    return (
      <ul
        css={{
          listStyle: 'none',
          fontSize: 'var(--font-size-body-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          paddingLeft: 0,
          margin: 0,
          ...(depth > 0
            ? {
                '--depth': depth,
                marginLeft: '0.25rem',
                borderLeft: '1px solid var(--color-separator)',
              }
            : {}),
          '@media screen and (max-width: calc(60rem - 1px))': {
            gap: '0.5rem',
            // On mobile, avoid the nested guideline to reduce visual clutter
            ...(depth > 0
              ? {
                  borderLeft: 'none',
                  marginLeft: 0,
                }
              : {}),
          },
        }}
      >
        {children}
      </ul>
    )
  },
  Item: ({ entry, children }) => {
    const childArray = Children.toArray(children)
    const [firstChild, ...restChildren] = childArray
    const nestedChildren = restChildren.filter(
      (child) => child !== null && child !== undefined
    )

    if (!(isDirectory(entry) && nestedChildren.length > 0)) {
      return <li>{children}</li>
    }

    const link = isValidElement(firstChild)
      ? cloneElement<any>(firstChild, { collapsible: true })
      : firstChild

    const directoryPathname = entry.getPathname()

    return (
      <li>
        <SidebarCollapseProvider pathname={directoryPathname}>
          {link}
          <SidebarCollapseContent css={{ display: 'block' }}>
            {nestedChildren}
          </SidebarCollapseContent>
        </SidebarCollapseProvider>
      </li>
    )
  },
  Link: async (props) => {
    const { entry, pathname, collapsible } = props as any
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
        collapsible={collapsible}
        css={{
          paddingLeft: `calc(var(--depth) * 0.5rem)`,
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
    return await entry.getExportValue('metadata')
  } catch (error) {
    if (error instanceof ModuleExportNotFoundError) {
      return undefined
    }
    throw error
  }
}

async function getFileLabel(entry: FileSystemEntry<any>) {
  const name = entry.baseName

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
  return entry.baseName
}
