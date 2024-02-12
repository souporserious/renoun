import { Project, InMemoryFileSystemHost } from 'ts-morph'
import { getAllData } from './get-all-data'

const workingDirectory = '/Users/username/Code/mdxts'

jest.mock('read-package-up', () => ({
  readPackageUpSync: () => {
    return {
      packageJson: {
        name: 'mdxts',
        exports: {
          './components': {
            types: './dist/components/index.d.ts',
            import: './dist/components/index.js',
            require: './dist/cjs/components/index.js',
          },
        },
      },
      path: `${workingDirectory}/package.json`,
    }
  },
}))

describe('getAllData', () => {
  beforeAll(() => {
    process.env.MDXTS_GIT_SOURCE = 'https://github.com/souporserious/mdxts'
    process.env.MDXTS_GIT_BRANCH = 'main'
  })

  beforeEach(() => {
    jest.spyOn(process, 'cwd').mockReturnValue(workingDirectory)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should initialize correctly with basic input', () => {
    const project = new Project({ useInMemoryFileSystem: true })

    project.createSourceFile(
      'components/Button.tsx',
      `/** Used for any type of user action, including navigation. */\nexport function Button() {}`
    )

    project.createSourceFile(
      'components/Button.mdx',
      `# Button\n\nButtons allow for users to take actions in your application.`
    )

    const allData = getAllData({
      project,
      allModules: {
        '/components/Button.mdx': Promise.resolve({
          default: () => {},
        }),
      },
      globPattern: 'components/*.(ts|tsx)',
      baseDirectory: 'components',
    })

    expect(allData).toMatchSnapshot()
  })

  it('orders based on files and directories', () => {
    const project = new Project({ useInMemoryFileSystem: true })

    project.createSourceFile(
      'package/components/Button.tsx',
      `export function Button() {}`
    )

    project.createSourceFile(
      'package/components/Card.tsx',
      `export function Card() {}`
    )

    project.createSourceFile(
      'package/hooks/usePressable.ts',
      `export function usePressable() {}`
    )

    project.createSourceFile(
      'package/hooks/useFocus.ts',
      `export function useFocus() {}`
    )

    const allData = getAllData({
      project,
      allModules: {
        '/package/components/Button.tsx': Promise.resolve({
          default: () => {},
        }),
        '/package/components/Card.tsx': Promise.resolve({
          default: () => {},
        }),
        '/package/hooks/usePressable.ts': Promise.resolve({
          default: () => {},
        }),
        '/package/hooks/useFocus.ts': Promise.resolve({
          default: () => {},
        }),
      },
      globPattern: 'package/**/*.(ts|tsx)',
      baseDirectory: 'package',
    })

    expect(allData['/components/button'].order).toBe(1.1)
    expect(allData['/components/card'].order).toBe(1.2)
    expect(allData['/hooks/use-focus'].order).toBe(2.1)
    expect(allData['/hooks/use-pressable'].order).toBe(2.2)
  })

  it('parses order from file path', () => {
    const allData = getDocsData()

    expect(allData['/docs/getting-started'].order).toBe(1)
    expect(allData['/docs/routing'].order).toBe(2)
    expect(allData['/docs/examples/authoring'].order).toBe(3.1)
    expect(allData['/docs/examples/rendering'].order).toBe(3.2)
  })

  it('adds previous and next pathnames', () => {
    const allData = getDocsData()

    expect(allData['/docs/getting-started'].previous).toBeUndefined()
    expect(allData['/docs/getting-started'].next?.pathname).toBe(
      '/docs/routing'
    )
    expect(allData['/docs/routing'].previous?.pathname).toBe(
      '/docs/getting-started'
    )
    expect(allData['/docs/routing'].next?.pathname).toBe(
      '/docs/examples/authoring'
    )
    expect(allData['/docs/examples/authoring'].previous?.pathname).toBe(
      '/docs/routing'
    )
    expect(allData['/docs/examples/authoring'].next?.pathname).toBe(
      '/docs/examples/rendering'
    )
    expect(allData['/docs/examples/rendering'].previous?.pathname).toBe(
      '/docs/examples/authoring'
    )
    expect(allData['/docs/examples/rendering'].next).toBeUndefined()
  })

  it('includes only public files based on package.json exports', () => {
    const fileSystem = new InMemoryFileSystemHost()
    const files = [
      {
        path: 'components/Button.tsx',
        content: `export const Button = () => {};`,
      },
      {
        path: 'components/Button.examples.tsx',
        content: `import { Button } from './Button';\nexport const Basic = () => {};`,
      },
      {
        path: 'components/Card.tsx',
        content: `export const Card = () => {};`,
      },
      {
        path: 'components/PrivateComponent.tsx',
        content: `export const PrivateComponent = () => {};`,
      },
      {
        path: 'components/index.ts',
        content: `export { Button } from './Button'; export { Card } from './Card';`,
      },
      {
        path: 'hooks/usePressable.ts',
        content: `export const usePressable = () => {};`,
      },
      {
        path: 'hooks/useFocus.ts',
        content: `export const useFocus = () => {};`,
      },
      {
        path: 'hooks/index.ts',
        content: `export * from './usePressable';\nexport * from './useFocus';`,
      },
    ]

    files.forEach((file) => {
      fileSystem.writeFileSync(
        `${workingDirectory}/src/${file.path}`,
        file.content
      )
    })

    const project = new Project({ fileSystem })

    const allData = getAllData({
      project,
      allModules: {
        [`${workingDirectory}/src/components/Button.examples.tsx`]:
          Promise.resolve({
            default: () => {},
          }),
      },
      globPattern: `${workingDirectory}/src/**/*.{ts,tsx}`,
      baseDirectory: `src`,
    })

    expect(allData['/components/button']).toBeDefined()
    expect(allData['/components/card']).toBeDefined()
    expect(allData['/components/private-component']).toBeUndefined()
  })

  it('includes only public declarations based on index file exports', () => {
    const fileSystem = new InMemoryFileSystemHost()
    const files = [
      {
        path: 'components/Button.tsx',
        content: `export const Button = () => {};\n\nexport const PrivateComponent = () => {};`,
      },
      {
        path: 'components/index.ts',
        content: `export { Button } from './Button';`,
      },
    ]

    files.forEach((file) => {
      fileSystem.writeFileSync(
        `${workingDirectory}/src/${file.path}`,
        file.content
      )
    })

    const project = new Project({ fileSystem })

    const allData = getAllData({
      project,
      allModules: {},
      globPattern: `${workingDirectory}/src/**/*.{ts,tsx}`,
      baseDirectory: `src`,
    })
    const exportedTypes = allData['/components/button'].exportedTypes

    expect(
      exportedTypes.find((type) => type.name === 'PrivateComponent')
    ).toBeUndefined()
  })
})

function getDocsData() {
  const project = new Project({ useInMemoryFileSystem: true })

  project.createSourceFile(
    'docs/01.getting-started.mdx',
    `# Getting Started\n\nStart here.`
  )

  project.createSourceFile(
    'docs/02.routing.mdx',
    `# Routing\n\nHelpers for routing.`
  )

  project.createSourceFile(
    'docs/03.examples/01.authoring.mdx',
    `# Authoring\n\nExamples can be written alongside source code.`
  )

  project.createSourceFile(
    'docs/03.examples/02.rendering.mdx',
    `# Rendering\n\nExamples can be rendered in the documentation using a bundler.`
  )

  return getAllData({
    project,
    allModules: {
      '/docs/01.getting-started.mdx': Promise.resolve({
        default: () => {},
      }),
      '/docs/02.routing.mdx': Promise.resolve({
        default: () => {},
      }),
      '/docs/03.examples/01.authoring.mdx': Promise.resolve({
        default: () => {},
      }),
      '/docs/03.examples/02.rendering.mdx': Promise.resolve({
        default: () => {},
      }),
    },
    globPattern: '**/*.mdx',
  })
}
