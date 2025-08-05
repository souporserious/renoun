import { NextResponse } from 'next/server'
import { themes, grammars } from 'renoun/grammars'
import { z } from 'zod'

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
  .looseObject({
    colors: z
      .record(z.string(), z.string())
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
      .record(z.string(), z.union([z.string(), z.looseObject({})]))
      .optional()
      .describe('Overrides for semantic token colors.'),
  })
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

const languagesSchema = z.enum(
  Object.values(grammars).map(([, id]) => id) as [string, ...string[]]
)

const gitSchema = z.object({
  source: z
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
  baseUrl: z.url().describe('The base URL of the Git provider.').optional(),
})

const debugSchema = z.object({
  level: z
    .enum(['error', 'warn', 'info', 'debug', 'trace'])
    .describe(
      'The minimum level to log. Defaults to "info" when debug is enabled.'
    )
    .optional(),
  includeTimestamp: z
    .boolean()
    .describe('Whether to include timestamps in log messages.')
    .optional(),
  includePerformance: z
    .boolean()
    .describe('Whether to include performance measurements.')
    .optional(),
})

const renounConfigSchema = z.object({
  $schema: z.string().describe('URL to the JSON schema'),
  theme: themeSchema.describe('Theme configuration object').optional(),
  languages: z
    .array(languagesSchema)
    .describe('List of language grammars to load.')
    .optional(),
  git: gitSchema.describe('Git configuration object').optional(),
  siteUrl: z
    .url()
    .describe('The production site URL e.g. https://renoun.dev')
    .optional(),
  debug: debugSchema.describe('Debug configuration object').optional(),
})

export const dynamic = 'force-static'

export async function GET() {
  return NextResponse.json(z.toJSONSchema(renounConfigSchema))
}
