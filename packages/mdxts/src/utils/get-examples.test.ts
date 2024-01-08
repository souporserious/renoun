import { Project } from 'ts-morph'
import {
  getExamplesFromDirectory,
  getExamplesFromExtension,
  getExamplesFromSourceFile,
} from './get-examples'

const buttonSourceFile = `
/** Used for taking actions and navigating. */
export function Button({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) {
  return <button onClick={onPress}>{label}</button>
}
`

const basicUsageSourceFile = `
import { Button } from '../Button'

export function BasicUsage() {
  return <Button label="Say hello" onPress={() => alert('Hello!')} />
}

export function AlternateUsage() {
  return <Button label="Say goodbye" onPress={() => alert('Goodbye!')} />
}
`

test('get examples from directory', async () => {
  const project = new Project({ useInMemoryFileSystem: true })
  const directory = project.createDirectory('directory')

  const sourceFile = directory.createSourceFile('Button.tsx', buttonSourceFile)

  directory
    .createDirectory('examples')
    .createSourceFile('BasicUsage.tsx', basicUsageSourceFile)

  const examples = getExamplesFromDirectory(sourceFile.getDirectory())

  expect(examples.map((example) => example.getFilePath())).toMatchSnapshot()
})

test('get examples from extension', async () => {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile('Button.tsx', buttonSourceFile)

  project.createSourceFile('Button.examples.tsx', basicUsageSourceFile)

  const examples = getExamplesFromExtension(sourceFile)

  expect(examples!.getFilePath()).toMatchSnapshot()
})

test('get examples from source file', async () => {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile('Button.tsx', buttonSourceFile)

  project.createSourceFile('Button.examples.tsx', basicUsageSourceFile)

  const examples = await getExamplesFromSourceFile(sourceFile, {
    '/Button.examples.tsx': Promise.resolve({
      BasicUsage: () => null,
      AlternateUsage: () => null,
    }),
  })

  expect(examples).toMatchSnapshot()
})
