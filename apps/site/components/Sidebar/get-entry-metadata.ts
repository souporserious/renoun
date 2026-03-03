import {
  ModuleExportNotFoundError,
  isJavaScriptFile,
  isMDXFile,
  type FileSystemEntry,
} from 'renoun'

export async function getEntryMetadata(entry: FileSystemEntry<any>) {
  if (!(isJavaScriptFile(entry) || isMDXFile(entry))) {
    return undefined
  }

  try {
    return await entry.getExportValue('metadata')
  } catch (error) {
    if (error instanceof ModuleExportNotFoundError) {
      return undefined
    }
    throw error
  }
}
