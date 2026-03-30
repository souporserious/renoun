import { AsyncLocalStorage } from 'node:async_hooks'

export type AnalysisRpcRequestPriority =
  | 'bootstrap'
  | 'immediate'
  | 'background'

const analysisRpcRequestPriorityStorage =
  typeof AsyncLocalStorage === 'function'
    ? new AsyncLocalStorage<AnalysisRpcRequestPriority>()
    : undefined

export function getCurrentAnalysisRpcRequestPriority():
  | AnalysisRpcRequestPriority
  | undefined {
  return analysisRpcRequestPriorityStorage?.getStore()
}

export async function runWithAnalysisRpcRequestPriority<Type>(
  priority: AnalysisRpcRequestPriority | undefined,
  task: () => Promise<Type>
): Promise<Type> {
  if (!priority || !analysisRpcRequestPriorityStorage) {
    return task()
  }

  return analysisRpcRequestPriorityStorage.run(priority, task)
}
