import { extname, isAbsolute } from 'node:path'

import type { Project } from '../../utils/ts-morph.ts'

import {
  coerceAnalysisDocumentSourceFileToModule,
  getAnalysisDocumentStableFilePath,
  type ResolvedAnalysisDocument,
} from '../document.ts'

interface SnippetRegistration {
  stableFilePath: string
  currentVirtualFilePath: string
  lastUsedAt: number
}

export const MAX_VIRTUAL_SNIPPET_REGISTRATIONS_PER_PROJECT = 256

const snippetRegistrationsByProject = new WeakMap<
  Project,
  Map<string, SnippetRegistration>
>()

function getSnippetRegistrations(
  project: Project
): Map<string, SnippetRegistration> {
  let registrations = snippetRegistrationsByProject.get(project)

  if (!registrations) {
    registrations = new Map()
    snippetRegistrationsByProject.set(project, registrations)
  }

  return registrations
}

function isMatchingSourceFilePath(
  candidatePath: string,
  filePath: string
): boolean {
  if (candidatePath === filePath) {
    return true
  }

  return !isAbsolute(filePath) && candidatePath.endsWith(`/${filePath}`)
}

function getVirtualSnippetPathPrefix(stableFilePath: string): string {
  const extension = extname(stableFilePath)

  if (!extension) {
    return `${stableFilePath}.__renoun_snippet_`
  }

  return `${stableFilePath.slice(0, -extension.length)}.__renoun_snippet_`
}

export function removeProgramSourceFileIfPresent(
  project: Project,
  filePath: string
): void {
  const sourceFile = project.getSourceFile(filePath)

  if (sourceFile) {
    project.removeSourceFile(sourceFile)
  }

  for (const candidateSourceFile of project.getSourceFiles()) {
    const candidatePath = candidateSourceFile.getFilePath()
    if (isMatchingSourceFilePath(candidatePath, filePath)) {
      project.removeSourceFile(candidateSourceFile)
    }
  }
}

function pruneSnippetRegistrations(
  project: Project,
  registrations: Map<string, SnippetRegistration>,
  currentStableFilePath: string
): void {
  while (registrations.size > MAX_VIRTUAL_SNIPPET_REGISTRATIONS_PER_PROJECT) {
    let leastRecentlyUsedRegistration: SnippetRegistration | undefined

    for (const registration of registrations.values()) {
      if (registration.stableFilePath === currentStableFilePath) {
        continue
      }

      if (
        leastRecentlyUsedRegistration === undefined ||
        registration.lastUsedAt < leastRecentlyUsedRegistration.lastUsedAt
      ) {
        leastRecentlyUsedRegistration = registration
      }
    }

    if (!leastRecentlyUsedRegistration) {
      return
    }

    registrations.delete(leastRecentlyUsedRegistration.stableFilePath)
    removeProgramSourceFileIfPresent(
      project,
      leastRecentlyUsedRegistration.currentVirtualFilePath
    )
    removeProgramSourceFileIfPresent(
      project,
      leastRecentlyUsedRegistration.stableFilePath
    )
  }
}

export function syncVirtualSnippetSourceFiles(
  project: Project,
  document: ResolvedAnalysisDocument
): void {
  if (document.kind !== 'snippet' || !document.shouldVirtualizeFilePath) {
    return
  }

  const stableFilePath = getAnalysisDocumentStableFilePath(document)
  if (stableFilePath === document.filePath) {
    return
  }

  const registrations = getSnippetRegistrations(project)
  const existingRegistration = registrations.get(stableFilePath)
  const virtualSnippetPathPrefix = getVirtualSnippetPathPrefix(stableFilePath)

  if (
    existingRegistration &&
    existingRegistration.currentVirtualFilePath !== document.filePath
  ) {
    removeProgramSourceFileIfPresent(
      project,
      existingRegistration.currentVirtualFilePath
    )
  }

  for (const sourceFile of project.getSourceFiles()) {
    const sourceFilePath = sourceFile.getFilePath()

    if (
      sourceFilePath.includes(virtualSnippetPathPrefix) &&
      !isMatchingSourceFilePath(sourceFilePath, document.filePath)
    ) {
      project.removeSourceFile(sourceFile)
    }
  }

  const stableSourceFile = project.createSourceFile(
    stableFilePath,
    document.value,
    {
      overwrite: true,
    }
  )

  coerceAnalysisDocumentSourceFileToModule(stableSourceFile)

  registrations.set(stableFilePath, {
    stableFilePath,
    currentVirtualFilePath: document.filePath,
    lastUsedAt: Date.now(),
  })

  pruneSnippetRegistrations(project, registrations, stableFilePath)
}
