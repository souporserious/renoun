import { SiteLayout } from '@/components/SiteLayout'

import '../layout.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <SiteLayout>{children}</SiteLayout>
}
