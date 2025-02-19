import { NextResponse } from 'next/server'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { bundledThemesInfo, bundledLanguagesInfo } from 'shiki'

const themeSchema = z.union([
  z
    .enum(bundledThemesInfo.map((theme) => theme.id) as [string])
    .describe('A bundled Shiki theme.'),
  z
    .string()
    .describe(
      'A path on the file system to a JSON file with a VS Code compatible theme.'
    ),
])

const languagesSchema = z.enum(
  bundledLanguagesInfo.flatMap((language) => [
    language.id,
    ...(language.aliases ?? []),
  ]) as [string]
)

const gitSchema = z.object({
  source: z.string().url().describe('URL to the git repository.').optional(),
  provider: z
    .enum(['github', 'gitlab', 'bitbucket'])
    .describe('The provider to use when constructing git repository URLs.')
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
  languages: z
    .array(languagesSchema)
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
