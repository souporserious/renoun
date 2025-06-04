import { describe, test, expect } from 'vitest'
import { Project } from 'ts-morph'

import { getJsDocMetadata } from './get-js-doc-metadata.js'

describe('getJsDocMetadata', () => {
  const project = new Project()

  test('function description and tags', () => {
    const description = 'Returns a div element.'
    const tag = '@deprecated use another component instead.'
    const sourceFile = project.createSourceFile(
      'test.ts',
      `/** ${description}\n* ${tag}\n*/\nfunction Component() { return <div /> }`,
      { overwrite: true }
    )
    const metadata = getJsDocMetadata(
      sourceFile.getFunctionOrThrow('Component')
    )

    expect(metadata).toMatchInlineSnapshot(`
      {
        "description": "Returns a div element.",
        "tags": [
          {
            "name": "deprecated",
            "text": "use another component instead.",
          },
        ],
      }
    `)
  })

  test('multiline function description', () => {
    const description = `Returns a div element.\n\nThis is a multiline description.`
    const sourceFile = project.createSourceFile(
      'test.ts',
      `/** ${description} */\nfunction Component() { return <div /> }`,
      { overwrite: true }
    )
    const metadata = getJsDocMetadata(
      sourceFile.getFunctionOrThrow('Component')
    )

    expect(metadata?.description).toBe(description)
  })

  test('variable declaration description', () => {
    const description = 'A div element.'
    const sourceFile = project.createSourceFile(
      'test.ts',
      `/** ${description} */ const element = <div />`,
      { overwrite: true }
    )
    const metadata = getJsDocMetadata(
      sourceFile.getVariableDeclarationOrThrow('element')
    )

    expect(metadata?.description).toBe(description)
  })
})
