export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen md:grid [grid-template-columns:var(--grid-template-columns)]">
      <main className="px-6 md:px-0 pt-16 md:pt-0 md:[grid-column:1_/_-1] md:grid md:[grid-template-columns:subgrid] md:auto-rows-auto md:min-h-screen">
        {children}
      </main>
    </div>
  )
}
