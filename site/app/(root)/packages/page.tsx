import { CodeInline } from 'mdxts/components'
import { allPackages } from 'data'

export default async function Page() {
  const allData = await allPackages.all()
  return (
    <>
      <h1>Packages</h1>
      <p>
        All packages exported from the <CodeInline value="mdxts" /> library.
        This includes the core library for gathering data from local source
        files, components for code blocks and navigation, and framework
        integrations.
      </p>
      <nav style={{ display: 'flex', flexDirection: 'column' }}>
        {Object.values(allData)
          .filter((singlePackage) => singlePackage.depth === 2)
          .map((singlePackage) => {
            return (
              <div key={singlePackage.pathname}>
                <a href={singlePackage.pathname}>
                  <h3>{singlePackage.label}</h3>
                </a>
                <p>{singlePackage.description}</p>
              </div>
            )
          })}
      </nav>
    </>
  )
}
