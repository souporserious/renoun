import { SiteLayout } from '@/components/SiteLayout'
import { Sidebar } from '@/components/Sidebar'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <SiteLayout sidebar={<Sidebar />}>{children}</SiteLayout>
}
