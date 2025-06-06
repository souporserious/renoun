import { docs } from '@/collections'

import { CommandMenu } from './CommandMenu'
import { SidebarOverlay } from './SidebarOverlay'
import { SidebarLink } from './SidebarLink'

export async function Sidebar() {
  const docEntries = await docs.getEntries()
  const entries = await Promise.all(
    docEntries.map(async (post) => {
      const metadata = await post.getExportValue('metadata')
      const path = post.getPath()
      return {
        title: metadata.title,
        path,
      }
    })
  )

  return (
    <SidebarOverlay>
      <div className="flex flex-col gap-8">
        <CommandMenu entries={entries} />
        <nav className="flex flex-col">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
            Documentation
          </span>
          {entries.map((entry) => (
            <SidebarLink key={entry.path} href={entry.path}>
              {entry.title}
            </SidebarLink>
          ))}
        </nav>
      </div>
    </SidebarOverlay>
  )
}
