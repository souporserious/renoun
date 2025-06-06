import { docs } from '@/collections'

import { Search } from './Search'
import { SidebarOverlay } from './SidebarOverlay'

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
      <Search entries={entries} />
    </SidebarOverlay>
  )
}
