import { Project } from 'ts-morph'
import {
  getExamplesFromComments,
  getExamplesFromDirectory,
  getExamplesFromExtension,
} from './get-examples'

const commentsSourceFile = `
/**
 * Adds two numbers together.
 * 
 * @example
 * const a = 1
 * const b = 2
 * const c = add(a, b)
 * 
 * console.log(c)
 */
export function add(a: number, b: number) {
    return a + b
}
`

test('get examples from comments', async () => {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(
    'comments.tsx',
    commentsSourceFile
  )
  const examples = getExamplesFromComments(sourceFile.getFunctionOrThrow('add'))

  expect(examples).toMatchSnapshot()
})

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

test.skip('get examples from directory', async () => {
  const project = new Project({ useInMemoryFileSystem: true })
  const directory = project.createDirectory('directory')

  const sourceFile = directory.createSourceFile('Button.tsx', buttonSourceFile)

  directory
    .createDirectory('examples')
    .createSourceFile('BasicUsage.tsx', basicUsageSourceFile)

  const examples = getExamplesFromDirectory(sourceFile.getDirectory())

  expect(JSON.stringify(examples, null, 2)).toMatchSnapshot()
})

test('get examples from extension', async () => {
  const project = new Project({ useInMemoryFileSystem: true })
  const directory = project.createDirectory('directory')

  const sourceFile = directory.createSourceFile('Button.tsx', buttonSourceFile)

  directory.createSourceFile('Button.examples.tsx', basicUsageSourceFile)

  const examples = getExamplesFromExtension(sourceFile)

  expect(JSON.stringify(examples, null, 2)).toMatchSnapshot()
})
