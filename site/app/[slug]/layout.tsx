import { Sidebar } from 'components/Sidebar'
import { SiblingNavigation } from 'components/SiblingNavigation'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <main>
        {children}
        <SiblingNavigation />
      </main>
    </>
  )
}
