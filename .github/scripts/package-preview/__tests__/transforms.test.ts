import { describe, it, expect } from 'vitest'
import {
  parsePnpmWorkspaces,
  parseTurboDryRunPackages,
  computePublishableTargets,
  renamePackedFilenames,
  buildRawBaseUrl,
  buildAssets,
  buildManifest,
  buildPreviewCommentBody,
  stickyMarker,
} from '../utils.js'

describe('transforms', () => {
  it('parsePnpmWorkspaces', () => {
    const json = JSON.stringify([
      { name: 'a', path: '/repo/packages/a', private: false },
      { name: 'b', path: '/repo/packages/b', private: true },
      { name: '', path: '/repo/packages/empty' },
    ])
    const out = parsePnpmWorkspaces(json)
    expect(out).toEqual([
      { name: 'a', dir: '/repo/packages/a', private: false },
      { name: 'b', dir: '/repo/packages/b', private: true },
    ])
  })

  it('parseTurboDryRunPackages - array form', () => {
    const json = JSON.stringify([
      { package: 'a' },
      { package: 'b' },
      { package: 'a' },
    ])
    expect(parseTurboDryRunPackages(json)).toEqual(['a', 'b'])
  })

  it('parseTurboDryRunPackages - tasks form', () => {
    const json = JSON.stringify({ tasks: [{ package: 'a' }, { package: 'b' }] })
    expect(parseTurboDryRunPackages(json)).toEqual(['a', 'b'])
  })

  it('parseTurboDryRunPackages - packages form', () => {
    const json = JSON.stringify({ packages: ['a', 'b', 'a'] })
    expect(parseTurboDryRunPackages(json)).toEqual(['a', 'b'])
  })

  it('computePublishableTargets', () => {
    const workspaces = [
      { name: 'a', dir: '/a', private: false },
      { name: 'b', dir: '/b', private: true },
      { name: 'c', dir: '/c', private: false },
    ]
    expect(computePublishableTargets(workspaces, ['a', 'b', 'x'])).toEqual([
      'a',
    ])
  })

  it('renamePackedFilenames', () => {
    const files = ['a.tgz', 'b.tgz']
    expect(renamePackedFilenames(files, 'abc123')).toEqual([
      'a-abc123.tgz',
      'b-abc123.tgz',
    ])
  })

  it('buildRawBaseUrl + buildAssets + buildManifest', () => {
    const base = buildRawBaseUrl('o', 'r', 'branch', 42)
    const assets = buildAssets(base, ['a.tgz'])
    const manifest = buildManifest({
      branch: 'branch',
      short: 'abc123',
      pr: 42,
      assets,
      targets: ['pkg-a'],
      commentId: 123,
    })
    expect(base).toMatch('/o/r/branch/42/')
    expect(assets[0].url).toMatch('/branch/42/a.tgz')
    expect(manifest.commentId).toBe(123)
  })

  it('buildPreviewCommentBody - assets', () => {
    const body = buildPreviewCommentBody(stickyMarker, [
      { name: 'a-abc.tgz', url: 'https://raw/a-abc.tgz' },
    ])
    expect(body).toContain('Preview packages')
    expect(body).toContain('npm install "https://raw/a-abc.tgz"')
  })

  it('buildPreviewCommentBody - empty', () => {
    const body = buildPreviewCommentBody(stickyMarker, [])
    expect(body).toContain('No publishable workspaces')
  })
})
