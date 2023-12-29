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
})
