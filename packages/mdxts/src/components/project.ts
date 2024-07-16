import { Project, ts } from 'ts-morph'

/**
 * A TypeScript project instance.
 * @internal
 */
export const project = new Project({
  compilerOptions: {
    allowJs: true,
    resolveJsonModule: true,
    esModuleInterop: true,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ESNext,
    isolatedModules: true,
  },
  useInMemoryFileSystem: typeof window !== 'undefined',
})

/**
 * The TypeScript language service instance.
 * @internal
 */
export const languageService = project.getLanguageService().compilerObject
