import { docs, routes } from '@/collections'

import { CommandMenu } from './CommandMenu'
import { SidebarOverlay } from './SidebarOverlay'
import { TreeNavigation } from './TreeNavigation'

export async function Sidebar() {
  return (
    <>
      <div className="md:hidden">
        <SidebarOverlay>
          <div className="flex flex-col gap-8">
            <CommandMenu routes={await routes} />
            <nav className="flex flex-col gap-3">
              <h4 className="pl-9 pr-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                Documentation
              </h4>
              <TreeNavigation collection={docs} variant="title" />
            </nav>
          </div>
        </SidebarOverlay>
      </div>

      <aside className="hidden md:grid fixed inset-0 pointer-events-none [grid-template-columns:var(--grid-template-columns)]">
        <div className="pointer-events-auto col-start-[2] col-end-[3] h-screen overflow-y-auto overscroll-contain py-8">
          <div className="flex flex-col gap-8">
            <CommandMenu routes={await routes} />
            <nav className="flex flex-col gap-3">
              <h4 className="pl-9 pr-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                Documentation
              </h4>
              <TreeNavigation collection={docs} variant="title" />
            </nav>
          </div>
        </div>
      </aside>
    </>
  )
}
