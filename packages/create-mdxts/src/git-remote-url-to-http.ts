const defaultBaseUrls = ['github.com', 'bitbucket.org', 'gitlab.com']

const protocolRe =
  /^(?:https?:\/\/|git:\/\/|git\+ssh:\/\/|git\+https:\/\/)?(?:[^@]+@)?/

/** Convert a git remote URL to an HTTP URL. */
export function gitRemoteUrlToHttp(url: string, extraBaseUrls: string[] = []) {
  const baseUrls = defaultBaseUrls.concat(extraBaseUrls)
  const snippetOrGist = new RegExp(
    protocolRe.source +
      '(' +
      baseUrls.join('|') +
      ')' +
      /(?::\/?|\/)snippets\/([^/]+\/[^/]+)\/[^/]+$/.source
  )
  const urlNoExtension = url.replace(/\.git(#.*)?$/, '')
  let match = snippetOrGist.exec(urlNoExtension)

  if (match) {
    // Found a match for a snippet or gist URL
    return `https://${match[1]}/snippets/${match[2]}`
  }

  const repo = new RegExp(
    protocolRe.source +
      '(' +
      baseUrls.join('|') +
      ')' +
      /(?::\/?|\/)([^/]+\/[^/]+?|[0-9]+)$/.source
  )

  match = repo.exec(urlNoExtension)

  if (match) {
    // Found a match for a repository URL
    return `https://${match[1]}/${match[2]}`
  }

  throw new Error('URL does not match any known patterns')
}
