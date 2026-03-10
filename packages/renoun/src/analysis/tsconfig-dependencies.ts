import { dirname, resolve } from 'node:path'

import { normalizePathKey } from '../utils/path.ts'
import type { ts as TsMorphTS } from '../utils/ts-morph.ts'
import { getTsMorph } from '../utils/ts-morph.ts'

const { ts } = getTsMorph()

export function getTypeScriptConfigDependencyPaths(
  configFilePath: string | undefined
): string[] {
  if (typeof configFilePath !== 'string' || configFilePath.length === 0) {
    return []
  }

  const absoluteConfigFilePath = resolve(configFilePath)
  const configPaths = new Map<string, string>([
    [normalizePathKey(absoluteConfigFilePath), absoluteConfigFilePath],
  ])
  const parseConfigHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: () => {},
  } satisfies TsMorphTS.ParseConfigFileHost

  try {
    const sourceFile = ts.readJsonConfigFile(
      absoluteConfigFilePath,
      ts.sys.readFile
    )

    ts.parseJsonSourceFileConfigFileContent(
      sourceFile,
      parseConfigHost,
      dirname(absoluteConfigFilePath),
      undefined,
      absoluteConfigFilePath
    )

    for (const extendedSourceFilePath of sourceFile.extendedSourceFiles ?? []) {
      const absoluteExtendedSourceFilePath = resolve(extendedSourceFilePath)
      configPaths.set(
        normalizePathKey(absoluteExtendedSourceFilePath),
        absoluteExtendedSourceFilePath
      )
    }
  } catch {
    return [absoluteConfigFilePath]
  }

  return Array.from(configPaths.values())
}
