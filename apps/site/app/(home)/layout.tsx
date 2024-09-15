import { SiteLayout } from '@/components/SiteLayout'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <SiteLayout>{children}</SiteLayout>
}
