export class Extension<ExtensionName extends string = string> {
  constructor(public readonly extension: ExtensionName) {}

  withSchema<Schema extends Record<string, any>>(schema?: {
    [Key in keyof Schema]?: (value: Schema[Key]) => Schema[Key]
  }): ExtensionWithSchema<ExtensionName, Schema> {
    return new ExtensionWithSchema(this.extension, schema)
  }
}

class ExtensionWithSchema<
  ExtensionName extends string,
  Schema extends Record<string, any>,
> extends Extension<ExtensionName> {
  constructor(
    public extension: ExtensionName,
    protected schema: {
      [Key in keyof Schema]?: (value: Schema[Key]) => Schema[Key]
    } = {}
  ) {
    super(extension)
  }

  getSchema<Name extends keyof Schema>(
    name: Name
  ): ((value: Schema[Name]) => Schema[Name]) | null {
    return this.schema[name] || null
  }
}
