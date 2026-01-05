import type { StandardSchemaV1 } from './standard-schema.ts'

const KNOWN_SCHEMA_EXTENSIONS = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'md',
  'mdx',
  'json',
])

/** A function that validates and returns a specific type. */
type BivariantCallback<Args extends any[], Return> = {
  bivarianceHack(...args: Args): Return
}['bivarianceHack']

/** A function that validates and returns a specific type. */
export type ModuleExportValidator<
  Input = Record<string, unknown>,
  Output = Input,
> = BivariantCallback<[value: Input], Output>

/**
 * Directory-level schema configuration.
 *
 * - A Standard Schema validates the *module object* (e.g. `z.object({ frontmatter: ... })`).
 * - A schema map validates *individual exports* (e.g. `{ frontmatter: z.object(...) }`).
 * - Both forms can also be provided per extension via `{ mdx: ..., ts: ... }`.
 */
export type DirectorySchemaOption =
  | StandardSchemaV1
  | Record<string, StandardSchemaV1 | ModuleExportValidator>

export type DirectorySchema =
  | DirectorySchemaOption
  | Partial<Record<string, DirectorySchemaOption>>

export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return (
    !!value &&
    typeof value === 'object' &&
    '~standard' in (value as any) &&
    typeof (value as any)['~standard']?.validate === 'function'
  )
}

export function resolveDirectorySchemaOption(
  schema: DirectorySchema | undefined,
  extension: string | undefined
): DirectorySchemaOption | undefined {
  if (!schema) {
    return undefined
  }

  // A single Standard Schema applies to all extensions.
  if (isStandardSchema(schema)) {
    return schema
  }

  // Disambiguate:
  // - `{ mdx: z.object(...) }` => per-extension
  // - `{ metadata: z.object(...) }` => per-export schema map
  if (extension && typeof schema === 'object') {
    const record = schema as Record<string, any>
    const keys = Object.keys(record)
    const looksLikeExtensionMap = keys.some((key) =>
      KNOWN_SCHEMA_EXTENSIONS.has(key)
    )

    if (looksLikeExtensionMap) {
      const option = record[extension]
      return option as DirectorySchemaOption | undefined
    }
  }

  return schema as DirectorySchemaOption
}

function validateStandardSchema(
  schema: StandardSchemaV1,
  value: unknown,
  context: { filePath: string; exportName?: string }
): unknown {
  const result = schema['~standard'].validate(
    value
  ) as StandardSchemaV1.Result<any>

  if (result.issues) {
    const issuesMessage = result.issues
      .map((issue) =>
        issue.path
          ? `  - ${issue.path.join('.')}: ${issue.message}`
          : `  - ${issue.message}`
      )
      .join('\n')

    const exportSuffix = context.exportName
      ? ` for export "${context.exportName}"`
      : ''

    throw new Error(
      `[renoun] Schema validation failed${exportSuffix} at file path: "${context.filePath}"\n\nThe following issues need to be fixed:\n${issuesMessage}`
    )
  }

  return result.value
}

export function validateExportValueWithExportSchemaMap(
  schemaMap: Record<string, StandardSchemaV1 | ModuleExportValidator<any, any>>,
  name: string,
  value: unknown,
  filePath: string
) {
  const key = name
  const parser = schemaMap[key]
  if (!parser) {
    return value
  }

  try {
    if (isStandardSchema(parser)) {
      return validateStandardSchema(parser, value, {
        filePath,
        exportName: key,
      })
    }
    return parser(value)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `[renoun] Schema validation failed to parse export "${key}" at file path: "${filePath}"\n\nThe following error occurred:\n${error.message}`
      )
    }
    throw error
  }
}

export function applyModuleSchemaToModule(
  schema: StandardSchemaV1,
  moduleValue: any,
  filePath: string
) {
  const parsed = validateStandardSchema(schema, moduleValue, { filePath })
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(
      `[renoun] Schema validation returned a non-object value at file path: "${filePath}". Directory schemas must validate a module export object.`
    )
  }

  // Merge parsed keys back into the module object so transforms (e.g. `z.date()`) take effect.
  for (const [key, value] of Object.entries(parsed as Record<string, any>)) {
    ;(moduleValue as any)[key] = value
  }

  return moduleValue
}
