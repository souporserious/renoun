import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { rmSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import {
  getMissingNextGeneratedTypesConfigWarning,
  getNextGeneratedTypesStatus,
  shouldSkipBuildPrewarmForMissingNextGeneratedTypes,
} from './build-prewarm-guard.ts'

async function createWorkspace(files: Record<string, string>) {
  const workspacePath = await mkdtemp(join(tmpdir(), 'renoun-build-prewarm-'))

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = join(workspacePath, relativePath)
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, contents, 'utf8')
  }

  return {
    workspacePath,
    [Symbol.dispose]() {
      rmSync(workspacePath, { recursive: true, force: true })
    },
  }
}

describe('build prewarm guard', () => {
  test('skips Next.js build prewarm when generated types are not available yet', async () => {
    using workspace = await createWorkspace({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
        },
        include: ['next-env.d.ts', '.next/types/**/*.ts', '**/*.ts'],
      }),
      'next-env.d.ts': '/// <reference types="next" />\n',
      'app/page.tsx': 'export default function Page() { return null }\n',
    })

    expect(
      shouldSkipBuildPrewarmForMissingNextGeneratedTypes({
        framework: 'next',
        rootPath: workspace.workspacePath,
      })
    ).toBe(true)
  })

  test('allows Next.js build prewarm once generated types exist', async () => {
    using workspace = await createWorkspace({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
        },
        include: ['next-env.d.ts', '.next/types/**/*.ts', '**/*.ts'],
      }),
      'next-env.d.ts': '/// <reference types="next" />\n',
      '.next/types/routes.d.ts': 'declare global { interface PageProps<T> {} }\nexport {}\n',
      'app/page.tsx': 'export default function Page() { return null }\n',
    })

    expect(
      shouldSkipBuildPrewarmForMissingNextGeneratedTypes({
        framework: 'next',
        rootPath: workspace.workspacePath,
      })
    ).toBe(false)
  })

  test('does not affect non-Next.js build prewarm', async () => {
    using workspace = await createWorkspace({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': 'export const value = 1\n',
    })

    expect(
      shouldSkipBuildPrewarmForMissingNextGeneratedTypes({
        framework: 'vite',
        rootPath: workspace.workspacePath,
      })
    ).toBe(false)
  })

  test('reports incomplete Next.js route type configuration', async () => {
    using workspace = await createWorkspace({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': 'export const value = 1\n',
    })

    const status = getNextGeneratedTypesStatus({
      framework: 'next',
      rootPath: workspace.workspacePath,
    })

    expect(status.hasRequiredTypeConfig).toBe(false)
    expect(getMissingNextGeneratedTypesConfigWarning(status)).toContain(
      'next-env.d.ts'
    )
  })
})
