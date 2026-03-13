import React from 'react'
import { PassThrough } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetTokens = vi.fn()

vi.mock('../../analysis/node-client.ts', () => ({
  getTokens: (...args: Parameters<typeof mockGetTokens>) => mockGetTokens(...args),
}))

import { BASE_TOKEN_CLASS_NAME } from '../../utils/get-theme.ts'
import { ServerConfigContext } from '../Config/ServerConfigContext.tsx'
import { defaultConfig } from '../Config/default-config.ts'
import type { ConfigurationOptions } from '../Config/types.ts'
import { QuickInfo } from './QuickInfo.tsx'
import { QuickInfoProvider } from './QuickInfoProvider.tsx'

async function renderToStringAsync(
  element: React.ReactElement,
  timeoutMs = 30_000
) {
  return new Promise<string>((resolve, reject) => {
    const stream = new PassThrough()
    const chunks: Buffer[] = []
    let settled = false
    const finish = (error?: unknown) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      if (error) {
        reject(error)
      } else {
        resolve(Buffer.concat(chunks).toString('utf8'))
      }
    }

    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    stream.on('error', (error) => finish(error))
    stream.on('end', () => finish())

    const { pipe, abort } = renderToPipeableStream(element, {
      onAllReady() {
        pipe(stream)
      },
      onShellError(error) {
        finish(error)
      },
      onError(error) {
        finish(error)
      },
    })

    const timeout = setTimeout(() => {
      try {
        abort()
      } catch {
        // ignore
      }
      finish(new Error(`renderToStringAsync timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })
}

const THEME_CONFIG: ConfigurationOptions['theme'] = {
  light: 'packages/renoun/vendor/theme.json',
  dark: 'packages/renoun/vendor/theme.json',
}

beforeEach(() => {
  mockGetTokens.mockReset()
})

describe('QuickInfo SSR', () => {
  it('tokenizes quick info display text with theme-aware token styles', async () => {
    const displayText = 'const History\nimport History'
    mockGetTokens.mockResolvedValueOnce([
      [
        {
          value: 'const',
          start: 0,
          end: 5,
          hasTextStyles: true,
          isBaseColor: false,
          isDeprecated: false,
          isSymbol: false,
          isWhiteSpace: false,
          style: {
            '--0fg': 'rgb(255, 0, 0)',
            '--1fg': 'rgb(0, 255, 0)',
            '--0fs': 'italic',
            '--1fs': 'italic',
          },
        },
        {
          value: ' ',
          start: 5,
          end: 6,
          hasTextStyles: false,
          isBaseColor: true,
          isDeprecated: false,
          isSymbol: false,
          isWhiteSpace: true,
          style: {},
        },
        {
          value: 'History',
          start: 6,
          end: 13,
          hasTextStyles: true,
          isBaseColor: false,
          isDeprecated: false,
          isSymbol: false,
          isWhiteSpace: false,
          style: {
            '--0fg': 'rgb(255, 128, 0)',
            '--1fg': 'rgb(0, 128, 255)',
          },
        },
      ],
      [
        {
          value: 'import',
          start: 14,
          end: 20,
          hasTextStyles: true,
          isBaseColor: false,
          isDeprecated: false,
          isSymbol: false,
          isWhiteSpace: false,
          style: {
            '--0fg': 'rgb(128, 0, 255)',
            '--1fg': 'rgb(255, 255, 0)',
            '--0fs': 'italic',
            '--1fs': 'italic',
          },
        },
        {
          value: ' ',
          start: 20,
          end: 21,
          hasTextStyles: false,
          isBaseColor: true,
          isDeprecated: false,
          isSymbol: false,
          isWhiteSpace: true,
          style: {},
        },
        {
          value: 'History',
          start: 21,
          end: 28,
          hasTextStyles: true,
          isBaseColor: false,
          isDeprecated: false,
          isSymbol: false,
          isWhiteSpace: false,
          style: {
            '--0fg': 'rgb(255, 128, 0)',
            '--1fg': 'rgb(0, 128, 255)',
          },
        },
      ],
    ])

    const html = await renderToStringAsync(
      <ServerConfigContext
        version="quick-info-ssr-theme-aware"
        value={{
          ...defaultConfig,
          theme: THEME_CONFIG,
        }}
      >
        <QuickInfoProvider>
          <QuickInfo
            quickInfo={{
              displayText,
              documentationText: '',
            }}
          />
        </QuickInfoProvider>
      </ServerConfigContext>
    )

    expect(mockGetTokens).toHaveBeenCalledWith({
      value: displayText,
      language: 'typescript',
      theme: THEME_CONFIG,
      languages: defaultConfig.languages,
      allowErrors: true,
      waitForWarmResult: true,
    })
    expect(html).toMatch(new RegExp(`class="[^"]*${BASE_TOKEN_CLASS_NAME}[^"]*"`))
    expect(html).toContain('--0fg:rgb(255, 0, 0)')
    expect(html).toContain('--1fg:rgb(0, 255, 0)')
    expect(html).not.toContain('--renoun-quick-info-keyword')
  })
})
