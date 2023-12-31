import { Project } from 'ts-morph'
import { getAllData } from './get-all-data'

const workingDirectory = '/Users/username/Code/mdxts/mdxts'

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
      `/** Used for any type of user action, including navigation. */\nexport function Button() {}`,
      { overwrite: true }
    )

    project.createSourceFile(
      'components/Button.mdx',
      `# Button\n\nButtons allow for users to take actions in your application.`,
      { overwrite: true }
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

  it('parses order from file path', () => {
    const project = new Project({ useInMemoryFileSystem: true })

    project.createSourceFile(
      'docs/01.getting-started.mdx',
      `# Getting Started\n\nStart here.`,
      { overwrite: true }
    )

    project.createSourceFile(
      'docs/02.routing.mdx',
      `# Routing\n\nHelpers for routing.`,
      { overwrite: true }
    )

    project.createSourceFile(
      'docs/03.examples/01.authoring.mdx',
      `# Authoring\n\nExamples can be written alongside source code.`,
      { overwrite: true }
    )

    project.createSourceFile(
      'docs/03.examples/02.rendering.mdx',
      `# Rendering\n\nExamples can be rendered in the documentation using a bundler.`,
      { overwrite: true }
    )

    const allData = getAllData({
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

    expect(allData['docs/getting-started'].order).toBe(1)
    expect(allData['docs/routing'].order).toBe(2)
    expect(allData['docs/examples/authoring'].order).toBe(3.1)
    expect(allData['docs/examples/rendering'].order).toBe(3.2)
  })
})
