import { NextResponse } from 'next/server'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { bundledThemesInfo } from 'shiki'

const themeSchema = z.union([
  z
    .enum(bundledThemesInfo.map((theme) => theme.id) as [string])
    .describe('A bundled Shiki theme.'),
  z
    .string()
    .describe('A path on the file system to a VS Code compatible theme.'),
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
