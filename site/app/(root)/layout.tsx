import { Sidebar } from 'components/Sidebar'
import styles from './layout.module.css'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div
        style={{
          fontWeight: 600,
          fontSize: 'var(--font-size-body-2)',
          padding: '1rem',
          backgroundColor: '#d39e5a',
          color: '#1c1309',
          textAlign: 'center',
        }}
      >
        This package is still experimental. The APIs are not stable and may
        change. Use at your own risk.
      </div>
      <div className={styles.container}>
        <Sidebar />
        <main>{children}</main>
      </div>
    </>
  )
}
