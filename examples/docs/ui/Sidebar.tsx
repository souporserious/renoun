import { docs, routes } from '@/collections'

import { CommandMenu } from './CommandMenu'
import { SidebarOverlay } from './SidebarOverlay'
import { TreeNavigation } from './TreeNavigation'

export async function Sidebar() {
  return (
    <SidebarOverlay>
      <div className="flex flex-col gap-8">
        <CommandMenu routes={await routes} />
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
