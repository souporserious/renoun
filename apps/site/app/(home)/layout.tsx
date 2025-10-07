import { SiteLayout } from '@/components/SiteLayout'
import { Sidebar } from '@/components/Sidebar'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SiteLayout variant="home" mobileSidebar={<Sidebar />}>
      {children}
    </SiteLayout>
  )
}
