import { SiteLayout } from '@/components/SiteLayout'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <SiteLayout variant="home">{children}</SiteLayout>
}
