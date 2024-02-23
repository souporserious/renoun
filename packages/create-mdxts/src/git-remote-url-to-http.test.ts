import { gitRemoteUrlToHttp } from './git-remote-url-to-http'

describe('gitRemoteUrlToHttp', () => {
  it('converts GitHub URL from git to https', () => {
    const gitUrl = 'git://github.com/user/repo.git'
    const expectedHttpUrl = 'https://github.com/user/repo'
    expect(gitRemoteUrlToHttp(gitUrl)).toBe(expectedHttpUrl)
  })

  it('converts Bitbucket URL from git to https', () => {
    const gitUrl = 'git://bitbucket.org/user/repo.git'
    const expectedHttpUrl = 'https://bitbucket.org/user/repo'
    expect(gitRemoteUrlToHttp(gitUrl)).toBe(expectedHttpUrl)
  })

  it('converts GitLab URL from git to https', () => {
    const gitUrl = 'git://gitlab.com/user/repo.git'
    const expectedHttpUrl = 'https://gitlab.com/user/repo'
    expect(gitRemoteUrlToHttp(gitUrl)).toBe(expectedHttpUrl)
  })

  it('handles git+ssh protocol URLs', () => {
    const gitUrl = 'git+ssh://github.com/user/repo.git'
    const expectedHttpUrl = 'https://github.com/user/repo'
    expect(gitRemoteUrlToHttp(gitUrl)).toBe(expectedHttpUrl)
  })

  it('converts Bitbucket SSH URL to https', () => {
    const gitUrl = 'git@bitbucket.org:org-name/repo-name.git'
    const expectedHttpUrl = 'https://bitbucket.org/org-name/repo-name'
    expect(gitRemoteUrlToHttp(gitUrl)).toBe(expectedHttpUrl)
  })

  it('converts URL with additional base URLs provided', () => {
    const gitUrl = 'git://customgitserver.com/user/repo.git'
    const expectedHttpUrl = 'https://customgitserver.com/user/repo'
    expect(gitRemoteUrlToHttp(gitUrl, ['customgitserver.com'])).toBe(
      expectedHttpUrl
    )
  })
})
