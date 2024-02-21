import { Sidebar } from 'components/Sidebar'
import styles from './layout.module.css'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.container}>
      <Sidebar />
      <main>{children}</main>
    </div>
  )
}
