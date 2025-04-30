import { describe, test, expect } from 'vitest'
import { Project } from 'ts-morph'

import { getFileExportsText } from './get-file-exports-text.js'

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
          "kind": 262,
          "name": "useHover",
          "position": 243,
          "text": "export function useHover() {
        return null
      }",
        },
        {
          "kind": 262,
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
          "kind": 260,
          "name": "Box",
          "position": 703,
          "text": "type SystemProps = { as: any }

      type BoxProps = { children: any } & SystemProps

      export const Box = (props: BoxProps) => <div {...props} />",
        },
        {
          "kind": 262,
          "name": "Badge",
          "position": 826,
          "text": "export function Badge(props: { children: any }) {
        return <div {...props} />
      }",
        },
        {
          "kind": 260,
          "name": "Button",
          "position": 947,
          "text": "const Stack = (props: { children: any; style?: any }) => <div {...props} />

      interface ButtonProps {}

      export const Button = (props: ButtonProps) => <Stack>Hello Button</Stack>",
        },
        {
          "kind": 260,
          "name": "Stack",
          "position": 756,
          "text": "const Stack = (props: { children: any; style?: any }) => <div {...props} />",
        },
        {
          "kind": 263,
          "name": "Car",
          "position": 1036,
          "text": "export class Car {
        wheels = 4
      }",
        },
      ]
    `)
  })
})
