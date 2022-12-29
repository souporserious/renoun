import { Sidebar } from 'components/Sidebar'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <main>{children}</main>
    </>
  )
}
