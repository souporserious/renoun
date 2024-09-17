import { NextResponse } from 'next/server'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { bundledThemesInfo } from 'shiki'

const themeValueSchema = z.union([
  z
    .enum(bundledThemesInfo.map((theme) => theme.id) as [string])
    .describe('A bundled Shiki theme.'),
  z
    .string()
    .describe('A path on the file system to a VS Code compatible theme.'),
])

const themeSchema = z.union([
  themeValueSchema,
  z
    .object({})
    .catchall(themeValueSchema)
    .describe(
      'Theme object with an arbitrary amount of themes. The first defined theme will be used as the default theme.'
    ),
])

const gitSchema = z.object({
  source: z.string().url().describe('URL to the Git repository.').optional(),
  provider: z
    .enum(['github', 'gitlab', 'bitbucket'])
    .describe('Git provider.')
    .optional(),
  branch: z
    .string()
    .default('main')
    .describe('Git branch name to link to.')
    .optional(),
})

const renounConfigSchema = z.object({
  $schema: z.string().describe('URL to the JSON schema'),
  theme: themeSchema.describe('Theme configuration object').optional(),
  git: gitSchema.describe('Git configuration object').optional(),
  siteUrl: z.string().url().describe('URL of the site').optional(),
})

export async function GET() {
  return NextResponse.json(zodToJsonSchema(renounConfigSchema))
}
