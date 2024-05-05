import { CodeInline } from 'mdxts/components'
import { allPackages } from 'data'

export default async function Page() {
  const allData = allPackages.all()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <h1>Packages</h1>
      <p>
        All packages exported from the <CodeInline value="mdxts" /> library.
        This includes the core library for gathering data from local source
        files, components for code blocks and navigation, and framework
        integrations.
      </p>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {allData
          .filter((singlePackage) => singlePackage.depth === 1)
          .map((singlePackage) => {
            return (
              <div
                key={singlePackage.pathname}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.8rem',
                }}
              >
                <a href={singlePackage.pathname}>
                  <h3>{singlePackage.label}</h3>
                </a>
                <p>{singlePackage.description}</p>
              </div>
            )
          })}
      </nav>
    </div>
  )
}
