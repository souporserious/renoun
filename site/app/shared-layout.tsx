import { Sidebar } from 'components/Sidebar'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)' }}
    >
      <Sidebar />
      <main>{children}</main>
    </div>
  )
}
