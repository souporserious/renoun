class ExtensionWithSchema<
  ExtensionName extends string,
  FileExports extends object,
> {
  constructor(
    public extension: ExtensionName,
    public schema: {
      [Key in keyof FileExports]?: (value: FileExports[Key]) => any
    }
  ) {}

  getSchema<
    Name extends keyof typeof this.schema,
    Value extends (value: FileExports[Name]) => FileExports[Name],
  >(name: Name): Value | null {
    return this.schema[name] ? (this.schema[name] as Value) : null
  }
}

export class Extension<ExtensionName extends string> {
  constructor(public readonly extension: ExtensionName) {}

  withSchema<FileExports extends object>(schema: {
    [Key in keyof FileExports]?: (value: FileExports[Key]) => any
  }) {
    return new ExtensionWithSchema<ExtensionName, FileExports>(
      this.extension,
      schema
    )
  }
}
