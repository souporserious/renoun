import type { Project } from '../utils/ts-morph.ts'

const analysisScopeIdByProject = new WeakMap<Project, string>()

export function setProjectAnalysisScopeId(
  project: Project,
  analysisScopeId: string | undefined
): void {
  if (typeof analysisScopeId !== 'string' || analysisScopeId.length === 0) {
    analysisScopeIdByProject.delete(project)
    return
  }

  analysisScopeIdByProject.set(project, analysisScopeId)
}

export function getProjectAnalysisScopeId(
  project: Project
): string | undefined {
  return analysisScopeIdByProject.get(project)
}

export function clearProjectAnalysisScopeId(project: Project): void {
  analysisScopeIdByProject.delete(project)
}
