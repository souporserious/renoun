import { describe, test, expect } from 'vitest'
import { getTsMorph } from './ts-morph.js'

import { getFileExportsText } from './get-file-exports-text.js'

const { Project } = getTsMorph()

const sourceFileText = `
import * as React from 'react'
import { Image } from 'components'
export { useFocus } from 'hooks'
export * as system from 'system'

type UnusedTypeAlias = { as: any }

const unusedVariable = 'foo'

function unusedFunction() {
  return 'bar'
}

export function useHover() {
  return null
}

const AvatarAssignment = Avatar

const OtherComponentUsingAvatar = () => <AvatarAssignment />

export function Avatar() {
  const unusedNestedVariable = 'foo'
  function unusedNestedFunction() {
    return 'bar'
  }
  return <Image />
}

function ComponentUsingAvatar() {
  return <Avatar />
}

type SystemProps = { as: any }

type BoxProps = { children: any } & SystemProps

/** A box component. */
export const Box = (props: BoxProps) => <div {...props} />

const Stack = (props: { children: any; style?: any }) => <div {...props} />

export function Badge(props: { children: any }) {
  return <div {...props} />
}

interface ButtonProps {}

export const Button = (props: ButtonProps) => <Stack>Hello Button</Stack>

export { Stack as Stack2 }

export class Car {
  wheels = 4
}

const car = new Car()

class Animal {
  legs = 4
}
`.trim()

describe('getFileExportsText', () => {
  test('extracts all exports and their dependencies from a file', () => {
    const project = new Project({ useInMemoryFileSystem: true })

    project.createSourceFile('test.tsx', sourceFileText)

    expect(getFileExportsText('test.tsx', project)).toMatchInlineSnapshot(`
      [
        {
          "kind": 263,
          "name": "useHover",
          "position": 243,
          "text": "export function useHover() {
        return null
      }",
        },
        {
          "kind": 263,
          "name": "Avatar",
          "position": 384,
          "text": "import { Image } from "components";

      export function Avatar() {
        const unusedNestedVariable = 'foo'
        function unusedNestedFunction() {
          return 'bar'
        }
        return <Image />
      }",
        },
        {
          "kind": 261,
          "name": "Box",
          "position": 703,
          "text": "type SystemProps = { as: any }

      type BoxProps = { children: any } & SystemProps

      export const Box = (props: BoxProps) => <div {...props} />",
        },
        {
          "kind": 263,
          "name": "Badge",
          "position": 826,
          "text": "export function Badge(props: { children: any }) {
        return <div {...props} />
      }",
        },
        {
          "kind": 261,
          "name": "Button",
          "position": 947,
          "text": "const Stack = (props: { children: any; style?: any }) => <div {...props} />

      interface ButtonProps {}

      export const Button = (props: ButtonProps) => <Stack>Hello Button</Stack>",
        },
        {
          "kind": 261,
          "name": "Stack",
          "position": 756,
          "text": "const Stack = (props: { children: any; style?: any }) => <div {...props} />",
        },
        {
          "kind": 264,
          "name": "Car",
          "position": 1036,
          "text": "export class Car {
        wheels = 4
      }",
        },
      ]
    `)
  })

  test('supports anonymous default function export', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    project.createSourceFile(
      'anon.ts',
      `export default function () { return 'hi' }
       export const named = 1`
    )
    const exports = getFileExportsText('anon.ts', project)
    expect(exports.map((namedExport) => namedExport.name).sort()).toEqual([
      'default',
      'named',
    ])
    const defaultExport = exports.find(
      (namedExport) => namedExport.name === 'default'
    )!
    expect(defaultExport.text).toContain('export default function')
  })

  test('supports anonymous default class export', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    project.createSourceFile(
      'anon-class.ts',
      `export default class { value = 1 }
       export class Named {}`
    )
    const exports = getFileExportsText('anon-class.ts', project)
    expect(exports.map((namedExport) => namedExport.name).sort()).toEqual([
      'Named',
      'default',
    ])
    const defaultExport = exports.find(
      (namedExport) => namedExport.name === 'default'
    )!
    expect(defaultExport.text).toContain('export default class')
  })

  test('supports default arrow function export', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    project.createSourceFile(
      'anon-arrow.ts',
      `export default () => 42;\nexport const other = true;`
    )
    const exports = getFileExportsText('anon-arrow.ts', project)
    expect(exports.map((namedExport) => namedExport.name).sort()).toEqual([
      'default',
      'other',
    ])
    const defaultExport = exports.find(
      (namedExport) => namedExport.name === 'default'
    )!
    expect(defaultExport.text).toContain('export default () => 42')
  })

  test('supports default exported object literal expression', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    project.createSourceFile(
      'anon-object.ts',
      `const value = 10;\nexport default { value };\nexport const another = 5;`
    )
    const exports = getFileExportsText('anon-object.ts', project)
    expect(exports.map((namedExport) => namedExport.name).sort()).toEqual([
      'another',
      'default',
    ])
    const defaultExport = exports.find(
      (namedExport) => namedExport.name === 'default'
    )!
    // The snippet should include the export assignment line
    expect(defaultExport.text).toContain('export default { value }')
  })

  test('supports named default function export', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    project.createSourceFile(
      'named-default-fn.ts',
      `export default function Page(){ return null }\nexport const x = 1`
    )
    const exports = getFileExportsText('named-default-fn.ts', project)
    expect(exports.map((namedExport) => namedExport.name).sort()).toEqual([
      'default',
      'x',
    ])
    const defaultExport = exports.find(
      (namedExport) => namedExport.name === 'default'
    )!
    expect(defaultExport.text).toContain('export default function Page()')
  })

  test('supports named default class export', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    project.createSourceFile(
      'named-default-class.ts',
      `export default class Component {}\nexport const y = 2`
    )
    const exports = getFileExportsText('named-default-class.ts', project)
    expect(exports.map((namedExport) => namedExport.name).sort()).toEqual([
      'default',
      'y',
    ])
    const defaultExport = exports.find(
      (namedExport) => namedExport.name === 'default'
    )!
    expect(defaultExport.text).toContain('export default class Component')
  })

  test('inserts newlines between reconstructed statements to prevent invalid concatenation', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const text = `
const code = \`
export default async function Page() {
  return <div />
}
\`

export function Demo() {
  return <div>{join('a','b')}{code}</div>
}

import { join } from 'node:path'
`.trim()

    project.createSourceFile('repro.tsx', text)
    const exports = getFileExportsText('repro.tsx', project)
    const demo = exports.find((namedExport) => namedExport.name === 'Demo')!

    // Ensure an import that appears later in the file is separated from the
    // preceding template literal by at least one newline.
    expect(demo.text).toContain('\nimport ')
    expect(demo.text).not.toContain('`import ')
  })
})
