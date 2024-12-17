export type ExtensionsFromLoaders<
  DirectoryLoaders extends Loaders,
  ExtensionUnion = keyof DirectoryLoaders | (string & {}),
> = ExtensionUnion | ExtensionUnion[]

export type ModuleTypeFromLoader<Type extends Loader<any>> =
  Type extends Loader<infer Types> ? Types : never

export type ModuleTypesFromLoaders<Extensions> = {
  [Name in keyof Extensions]: Extensions[Name] extends Loader<infer Types>
    ? Types
    : never
}

/** An object representing JavaScript or TypeScript file export values. */
export interface ModuleType {
  [exportName: string]: any
}

/** Types associated with specific file extensions. */
export interface LoaderTypes {
  [extension: string]: any
}

/** A function that validates and transforms export values. */
export type LoaderSchemaFunction<Value> = (value: Value) => any

/** A map of file export names to their respective schema function. */
export type LoaderSchema<Exports extends ModuleType> = {
  [ExportName in keyof Exports]?: LoaderSchemaFunction<Exports[ExportName]>
}

/** Functions that validate and transform export values for specific extensions. */
export type LoaderSchemas<DirectoryLoaders extends Loaders> = {
  [Extension in keyof DirectoryLoaders]?: ModuleTypeFromLoader<
    DirectoryLoaders[Extension]
  >
}

/** A function that resolves the runtime value for a given path. */
export type LoaderRuntime =
  | ((path: string) => Promise<any>)
  | Record<string, () => Promise<any>>

export interface LoaderOptions<Exports extends ModuleType> {
  /** A function that resolves the runtime value for a given path. */
  runtime?: LoaderRuntime

  /** A map of file export names to their respective schema function. */
  schema?: LoaderSchema<Exports>
}

/** Define a runtime resolver and schema for a file extension. */
export class Loader<Exports extends ModuleType = ModuleType> {
  #runtime?: LoaderOptions<Exports>['runtime']
  #schema?: LoaderOptions<Exports>['schema']

  constructor(options?: LoaderOptions<Exports>) {
    this.#runtime = options?.runtime
    this.#schema = options?.schema
  }

  /**
   * Resolve the runtime value for a given file export using its full path.
   * Applies schema validation if configured.
   */
  async resolveRuntimeValue(
    path: string,
    name: Extract<string, keyof Exports>
  ): Promise<any> {
    if (!this.#runtime) {
      throw new Error(
        `[renoun] Runtime option is required to resolve export "${name}"`
      )
    }

    let value: any
    let runtime = this.#runtime

    if (typeof this.#runtime === 'object') {
      runtime = this.#runtime[path]

      if (runtime === undefined) {
        throw new Error(`[renoun] Runtime not defined for path "${path}"`)
      }
    }

    try {
      if (typeof runtime === 'function') {
        value = await runtime(path)
      } else {
        throw new Error(
          `[renoun] Runtime resolver for path "${path}" is not a function`
        )
      }
    } catch (error) {
      throw new Error(
        `[renoun] Runtime resolver failed for path "${path}", errored with: ${error instanceof Error ? error.message : error}`
      )
    }

    return this.parseSchemaValue(name, value)
  }

  /** Parse and validate a value using the configured schema. */
  parseSchemaValue(name: Extract<string, keyof Exports>, value: any): any {
    if (!this.#schema) {
      return value
    }

    const parseValue = this.#schema[name]

    if (parseValue) {
      try {
        value = parseValue(value)
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(
            `[renoun] Schema validation failed to parse export "${name}", errored with: ${error.message}`
          )
        }
      }
    }

    return value
  }
}

export type Loaders = Record<string, Loader<any>>
