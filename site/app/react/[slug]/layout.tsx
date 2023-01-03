import { Sidebar } from 'components/Sidebar'
import { SiblingNavigation } from 'components/SiblingNavigation'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <main
        style={{
          display: 'grid',
          gridTemplateRows: '1fr auto',
          minHeight: '100vh',
        }}
      >
        <div>{children}</div>
        <SiblingNavigation />
      </main>
    </>
  )
}
