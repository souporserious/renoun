import { Project, ts } from 'ts-morph'

export const project = new Project({
  compilerOptions: {
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

export const languageService = project.getLanguageService().compilerObject
