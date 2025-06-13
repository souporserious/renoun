import { docs } from '@/collections'
import { getEntryTitle } from '@/utils'

import { CommandMenu } from './CommandMenu'
import { SidebarOverlay } from './SidebarOverlay'
import { TreeNavigation } from './TreeNavigation'

export async function Sidebar() {
  const docEntries = await docs.getEntries()
  const entries = await Promise.all(
    docEntries.map(async (post) => ({
      title: await getEntryTitle(post),
      path: post.getPathname(),
    }))
  )

  return (
    <SidebarOverlay>
      <div className="flex flex-col gap-8">
        <CommandMenu entries={entries} />
        <nav className="flex flex-col">
          <span className="pl-9 pr-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
            Documentation
          </span>
          <TreeNavigation collection={docs} variant="title" />
        </nav>
      </div>
    </SidebarOverlay>
  )
}
