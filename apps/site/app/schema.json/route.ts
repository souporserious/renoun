import { NextResponse } from 'next/server'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { themes, grammars } from 'renoun/textmate'

const themeValueSchema = z.union([
  z
    .enum(Object.keys(themes) as [string, ...string[]])
    .describe('A bundled textmate theme.'),
  z
    .string()
    .describe(
      'A path on the file system to a JSON file with a VS Code compatible theme.'
    ),
])

const themeOverrideSchema = z
  .object({
    colors: z
      .record(z.string())
      .optional()
      .describe('Overrides for theme colors.'),
    tokenColors: z
      .array(
        z.object({
          scope: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .describe(
              'One or more token scopes where the settings will be applied.'
            ),
          settings: z
            .object({
              foreground: z
                .string()
                .optional()
                .describe('The foreground color.'),
              background: z
                .string()
                .optional()
                .describe('The background color.'),
              fontStyle: z
                .string()
                .optional()
                .describe(
                  'Font style (e.g. "italic", "bold", or a combination thereof).'
                ),
            })
            .optional()
            .describe('Token style settings.'),
        })
      )
      .optional()
      .describe('Overrides for token colors.'),
    semanticTokenColors: z
      .record(z.union([z.string(), z.object({}).passthrough()]))
      .optional()
      .describe('Overrides for semantic token colors.'),
  })
  .passthrough()
  .describe('Theme override configuration.')

const themeOptionSchema = z.union([
  themeValueSchema,
  z.tuple([themeValueSchema, themeOverrideSchema]),
])

const themeSchema = z.union([
  themeOptionSchema,
  z
    .object({})
    .catchall(themeOptionSchema)
    .describe(
      `Define multiple named themes using an object, e.g. { light: 'vitesse-light', dark: 'vitesse-dark' }. The first theme defined in the object will be used as the default theme.`
    ),
])

const languagesSchema = z.enum(Object.keys(grammars) as [string, ...string[]])

const gitSchema = z.object({
  source: z
    .string()
    .url()
    .describe(
      'The git source URL to use for linking to the repository and source files.'
    )
    .optional(),
  branch: z
    .string()
    .describe(
      'The branch to use for linking to the repository and source files.'
    )
    .optional(),
  provider: z
    .enum(['github', 'gitlab', 'bitbucket'])
    .describe(
      'The git provider to use. This option disables the provider detection from `git.source` which is helpful for self-hosted instances.'
    )
    .optional(),
  owner: z.string().describe('The owner of the repository.').optional(),
  repository: z.string().describe('The repository name.').optional(),
  baseUrl: z
    .string()
    .url()
    .describe('The base URL of the Git provider.')
    .optional(),
})

const renounConfigSchema = z.object({
  $schema: z.string().describe('URL to the JSON schema'),
  theme: themeSchema.describe('Theme configuration object').optional(),
  languages: z
    .array(languagesSchema)
    .default([
      'css',
      'js',
      'jsx',
      'ts',
      'tsx',
      'md',
      'mdx',
      'sh',
      'json',
      'html',
    ])
    .describe('List of language grammars to load.')
    .optional(),
  git: gitSchema.describe('Git configuration object').optional(),
  siteUrl: z
    .string()
    .url()
    .describe('The production site URL e.g. https://renoun.dev')
    .optional(),
})

export const dynamic = 'force-static'

export async function GET() {
  return NextResponse.json(zodToJsonSchema(renounConfigSchema))
}
