/** An object representing file export values. */
export interface ExtensionType {
  [exportName: string]: any
}

/** Types associated with a specific file extension. */
export interface ExtensionTypes {
  [extension: string]: any
}

/** A function that validates and transforms export values. */
export type ExtensionSchemaFunction<Value> = (value: Value) => any

/** A map of file export names to their respective schema function. */
export type ExtensionSchema<Exports extends ExtensionType> = {
  [ExportName in keyof Exports]?: ExtensionSchemaFunction<Exports[ExportName]>
}

/** Functions that validate and transform export values for specific extensions. */
export type ExtensionSchemas<Types extends ExtensionTypes> = {
  [Extension in keyof Types]?: ExtensionSchema<Types[Extension]>
}

/** A function that retrieves a module from a given path. */
export type ExtensionModuleResolver = (path: string) => Promise<any>

export interface ExtensionOptions<Exports extends ExtensionType> {
  /** A map of file export names to their respective schema function. */
  schema: ExtensionSchema<Exports>

  /** A function that retrieves a module from a given path. */
  module: ExtensionModuleResolver
}

/** Define a schema and module resolver for a file extension. */
export class Extension<Exports extends ExtensionType = ExtensionType> {
  #schema?: ExtensionOptions<Exports>['schema']
  #module?: ExtensionOptions<Exports>['module']

  constructor(options?: ExtensionOptions<Exports>) {
    this.#schema = options?.schema
    this.#module = options?.module
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

  resolveModule() {
    return this.#module
  }
}
