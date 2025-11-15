import { Children, Fragment, cloneElement, isValidElement } from 'react'
import {
  ModuleExportNotFoundError,
  isDirectory,
  isJavaScriptFile,
  isMDXFile,
  Navigation,
  type FileSystemEntry,
  type NavigationComponents,
  type Directory,
} from 'renoun'

import * as SidebarCollapse from './SidebarCollapse'
import { SidebarLink } from './SidebarLink'

export function TreeNavigation({
  collection,
  variant = 'title',
}: {
  collection: Directory<any>
  variant?: 'name' | 'title'
}) {
  const components: Partial<NavigationComponents> = {
    Root: Fragment,
    List: ({ depth, children }) => {
      const isRoot = depth === 0
      const className = isRoot
        ? 'text-sm flex flex-col list-none pl-0'
        : 'flex flex-col list-none text-sm relative before:absolute before:left-[1.25rem] before:-translate-x-1/2 before:top-0 before:bottom-0 before:w-px before:bg-gray-200 dark:before:bg-gray-800'
      return <ul className={className}>{children}</ul>
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
          <SidebarCollapse.Provider pathname={directoryPathname}>
            {link}
            <SidebarCollapse.Content>{nestedChildren}</SidebarCollapse.Content>
          </SidebarCollapse.Provider>
        </li>
      )
    },
    Link: async (props) => {
      const {
        entry,
        pathname,
        depth,
        collapsible,
      }: {
        entry: FileSystemEntry<any>
        pathname: string
        depth: number
        collapsible?: React.ReactNode
      } = props as any
      const metadata =
        variant === 'title' && (isJavaScriptFile(entry) || isMDXFile(entry))
          ? await getMetadata(entry)
          : null

      let label: string
      if (variant === 'title') {
        label = metadata?.label || metadata?.title || entry.getTitle()
      } else {
        label = isDirectory(entry) ? entry.getBaseName() : entry.getBaseName()
      }

      return (
        <SidebarLink
          href={pathname}
          className={depth > 0 ? 'pl-6' : ''}
          collapsible={collapsible}
        >
          {label}
        </SidebarLink>
      )
    },
  }

  return <Navigation source={collection} components={components} />
}

async function getMetadata(entry: FileSystemEntry<any>) {
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
