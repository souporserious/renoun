import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import { Directory } from '../../file-system/index.js'
import {
  ServerConfigContext,
  getConfig,
} from '../Config/ServerConfigContext.js'
import { Link } from './index.js'

describe('Link', () => {
  test('renders source using repository config', async () => {
    ServerConfigContext({
      value: {
        languages: [],
        git: {
          source: 'https://github.com/souporserious/renoun',
          branch: 'main',
          provider: 'github',
          owner: 'souporserious',
          repository: 'renoun',
          baseUrl: 'https://github.com/souporserious/renoun',
        },
      },
      children: null,
    })

    const directory = new Directory({ path: 'packages/renoun/src/file-system' })
    const file = await directory.getFile('Repository.ts')

    const markup = renderToStaticMarkup(
      <Link source={file} variant="source">
        source
      </Link>
    )

    const config = getConfig()
    const expected = file.getSourceUrl({ repository: config.git })

    expect(markup).toBe(`<a href="${expected}">source</a>`)
  })
})
