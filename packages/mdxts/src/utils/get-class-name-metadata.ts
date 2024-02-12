const languageMap: Record<string, any> = {
  mjs: 'javascript',
}

/** Get file metadata from a remark code block class name. */
export function getClassNameMetadata(className: string | string[]) {
  const classNames = Array.isArray(className) ? className : className.split(' ')
  const filenameOrLanguage = classNames
    .find((name) => name.startsWith('language-'))
    ?.slice(9)

  if (!filenameOrLanguage) {
    return null
  }

  const extension = filenameOrLanguage?.split('.').pop() ?? filenameOrLanguage

  return {
    filename: filenameOrLanguage?.includes('.') ? filenameOrLanguage : null,
    language: languageMap[extension] || extension,
  }
}
