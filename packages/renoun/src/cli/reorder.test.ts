import { describe, expect, it, beforeEach, afterAll, vi } from 'vitest'
import { join, resolve } from 'node:path'

type DirentLike = {
  name: string
  isDirectory(): boolean
  isFile(): boolean
}

const readdirMock =
  vi.fn<
    (path: string, options: { withFileTypes: true }) => Promise<DirentLike[]>
  >()
const statMock = vi.fn<(path: string) => Promise<{ mtimeMs: number }>>()
const renameMock = vi.fn<(oldPath: string, newPath: string) => Promise<void>>()

vi.mock('node:fs', () => ({
  promises: {
    readdir: readdirMock,
    stat: statMock,
    rename: renameMock,
  },
}))

const { reorderEntries } = await import('./reorder.js')

const cwdSpy = vi.spyOn(process, 'cwd')

beforeEach(() => {
  vi.clearAllMocks()
  cwdSpy.mockReturnValue('/workspace/project')
})

afterAll(() => {
  cwdSpy.mockRestore()
})

describe('reorderEntries', () => {
  it('keeps all duplicates; newest duplicate stays at target order and older ones shift after', async () => {
    const targetDirectory = resolve('/workspace/project', 'slides')
    const pid = process.pid

    readdirMock.mockResolvedValue([
      {
        name: '03.summary.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '02.table-of-contents.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '02.table-of-contents-updated.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '01.intro.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
    ])

    const mtimes = new Map([
      [join(targetDirectory, '03.summary.mdx'), 100],
      [join(targetDirectory, '02.table-of-contents.mdx'), 100],
      [join(targetDirectory, '02.table-of-contents-updated.mdx'), 200],
      [join(targetDirectory, '01.intro.mdx'), 50],
    ])

    statMock.mockImplementation(async (path) => ({
      mtimeMs: mtimes.get(path) ?? 0,
    }))

    await reorderEntries('slides')

    expect(readdirMock).toHaveBeenCalledWith(targetDirectory, {
      withFileTypes: true,
    })

    expect(renameMock.mock.calls).toEqual([
      [
        join(targetDirectory, '02.table-of-contents.mdx'),
        join(targetDirectory, `02.table-of-contents.mdx.renoun-tmp-${pid}-0`),
      ],
      [
        join(targetDirectory, '03.summary.mdx'),
        join(targetDirectory, `03.summary.mdx.renoun-tmp-${pid}-1`),
      ],
      [
        join(targetDirectory, `02.table-of-contents.mdx.renoun-tmp-${pid}-0`),
        join(targetDirectory, '03.table-of-contents.mdx'),
      ],
      [
        join(targetDirectory, `03.summary.mdx.renoun-tmp-${pid}-1`),
        join(targetDirectory, '04.summary.mdx'),
      ],
    ])
  })

  it('supports dash delimiter without leading zeros', async () => {
    const targetDirectory = resolve('/workspace/project', 'lessons-dash')
    const pid = process.pid

    readdirMock.mockResolvedValue([
      {
        name: '2-topic-b.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '1-topic-a.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '1-topic-a-updated.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
    ])

    const mtimes = new Map([
      [join(targetDirectory, '2-topic-b.mdx'), 150],
      [join(targetDirectory, '1-topic-a.mdx'), 100],
      [join(targetDirectory, '1-topic-a-updated.mdx'), 200],
    ])

    statMock.mockImplementation(async (path) => ({
      mtimeMs: mtimes.get(path) ?? 0,
    }))

    await reorderEntries('lessons-dash')

    expect(renameMock.mock.calls).toEqual([
      [
        join(targetDirectory, '1-topic-a.mdx'),
        join(targetDirectory, `1-topic-a.mdx.renoun-tmp-${pid}-0`),
      ],
      [
        join(targetDirectory, '2-topic-b.mdx'),
        join(targetDirectory, `2-topic-b.mdx.renoun-tmp-${pid}-1`),
      ],
      [
        join(targetDirectory, `1-topic-a.mdx.renoun-tmp-${pid}-0`),
        join(targetDirectory, '2-topic-a.mdx'),
      ],
      [
        join(targetDirectory, `2-topic-b.mdx.renoun-tmp-${pid}-1`),
        join(targetDirectory, '3-topic-b.mdx'),
      ],
    ])
  })

  it('preserves zero-based numbering and padding with dash delimiter', async () => {
    const targetDirectory = resolve('/workspace/project', 'slides-dash')
    const pid = process.pid

    readdirMock.mockResolvedValue([
      {
        name: '00-intro.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '00-intro-updated.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '01-setup.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
    ])

    const mtimes = new Map([
      [join(targetDirectory, '00-intro.mdx'), 100],
      [join(targetDirectory, '00-intro-updated.mdx'), 200],
      [join(targetDirectory, '01-setup.mdx'), 150],
    ])

    statMock.mockImplementation(async (path) => ({
      mtimeMs: mtimes.get(path) ?? 0,
    }))

    await reorderEntries('slides-dash')

    expect(renameMock.mock.calls).toEqual([
      [
        join(targetDirectory, '00-intro.mdx'),
        join(targetDirectory, `00-intro.mdx.renoun-tmp-${pid}-0`),
      ],
      [
        join(targetDirectory, '01-setup.mdx'),
        join(targetDirectory, `01-setup.mdx.renoun-tmp-${pid}-1`),
      ],
      [
        join(targetDirectory, `00-intro.mdx.renoun-tmp-${pid}-0`),
        join(targetDirectory, '01-intro.mdx'),
      ],
      [
        join(targetDirectory, `01-setup.mdx.renoun-tmp-${pid}-1`),
        join(targetDirectory, '02-setup.mdx'),
      ],
    ])
  })

  it('preserves zero-based numbering and padding when present', async () => {
    const targetDirectory = resolve('/workspace/project', 'slides')
    const pid = process.pid

    readdirMock.mockResolvedValue([
      {
        name: '00.intro.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '00.intro-updated.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '01.setup.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
    ])

    const mtimes = new Map([
      [join(targetDirectory, '00.intro.mdx'), 100],
      [join(targetDirectory, '00.intro-updated.mdx'), 200],
      [join(targetDirectory, '01.setup.mdx'), 150],
    ])

    statMock.mockImplementation(async (path) => ({
      mtimeMs: mtimes.get(path) ?? 0,
    }))

    await reorderEntries('slides')

    expect(renameMock.mock.calls).toEqual([
      [
        join(targetDirectory, '00.intro.mdx'),
        join(targetDirectory, `00.intro.mdx.renoun-tmp-${pid}-0`),
      ],
      [
        join(targetDirectory, '01.setup.mdx'),
        join(targetDirectory, `01.setup.mdx.renoun-tmp-${pid}-1`),
      ],
      [
        join(targetDirectory, `00.intro.mdx.renoun-tmp-${pid}-0`),
        join(targetDirectory, '01.intro.mdx'),
      ],
      [
        join(targetDirectory, `01.setup.mdx.renoun-tmp-${pid}-1`),
        join(targetDirectory, '02.setup.mdx'),
      ],
    ])
  })

  it('maintains leading zero padding width when present', async () => {
    const targetDirectory = resolve('/workspace/project', 'chapters')
    const pid = process.pid

    readdirMock.mockResolvedValue([
      {
        name: '001.one.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '002.two.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '002.two-updated.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
    ])

    const mtimes = new Map([
      [join(targetDirectory, '001.one.mdx'), 100],
      [join(targetDirectory, '002.two.mdx'), 100],
      [join(targetDirectory, '002.two-updated.mdx'), 200],
    ])

    statMock.mockImplementation(async (path) => ({
      mtimeMs: mtimes.get(path) ?? 0,
    }))

    await reorderEntries('chapters')

    expect(renameMock.mock.calls).toEqual([
      [
        join(targetDirectory, '002.two.mdx'),
        join(targetDirectory, `002.two.mdx.renoun-tmp-${pid}-0`),
      ],
      [
        join(targetDirectory, `002.two.mdx.renoun-tmp-${pid}-0`),
        join(targetDirectory, '003.two.mdx'),
      ],
    ])
  })

  it('does not introduce padding when prefixes have no leading zeros', async () => {
    const targetDirectory = resolve('/workspace/project', 'lessons')
    const pid = process.pid

    readdirMock.mockResolvedValue([
      {
        name: '2.topic-b.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '1.topic-a.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '1.topic-a-updated.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
    ])

    const mtimes = new Map([
      [join(targetDirectory, '2.topic-b.mdx'), 150],
      [join(targetDirectory, '1.topic-a.mdx'), 100],
      [join(targetDirectory, '1.topic-a-updated.mdx'), 200],
    ])

    statMock.mockImplementation(async (path) => ({
      mtimeMs: mtimes.get(path) ?? 0,
    }))

    await reorderEntries('lessons')

    expect(renameMock.mock.calls).toEqual([
      [
        join(targetDirectory, '1.topic-a.mdx'),
        join(targetDirectory, `1.topic-a.mdx.renoun-tmp-${pid}-0`),
      ],
      [
        join(targetDirectory, '2.topic-b.mdx'),
        join(targetDirectory, `2.topic-b.mdx.renoun-tmp-${pid}-1`),
      ],
      [
        join(targetDirectory, `1.topic-a.mdx.renoun-tmp-${pid}-0`),
        join(targetDirectory, '2.topic-a.mdx'),
      ],
      [
        join(targetDirectory, `2.topic-b.mdx.renoun-tmp-${pid}-1`),
        join(targetDirectory, '3.topic-b.mdx'),
      ],
    ])
  })

  it('orders multiple duplicates by newest-first and keeps all of them', async () => {
    const targetDirectory = resolve('/workspace/project', 'articles')
    const pid = process.pid

    readdirMock.mockResolvedValue([
      {
        name: '02.alpha.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '02.beta.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '02.gamma.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '01.intro.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '03.outro.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
    ])

    const mtimes = new Map([
      [join(targetDirectory, '02.alpha.mdx'), 100],
      [join(targetDirectory, '02.beta.mdx'), 150],
      [join(targetDirectory, '02.gamma.mdx'), 250],
      [join(targetDirectory, '01.intro.mdx'), 90],
      [join(targetDirectory, '03.outro.mdx'), 300],
    ])

    statMock.mockImplementation(async (path) => ({
      mtimeMs: mtimes.get(path) ?? 0,
    }))

    await reorderEntries('articles')

    expect(renameMock.mock.calls).toEqual([
      [
        join(targetDirectory, '02.beta.mdx'),
        join(targetDirectory, `02.beta.mdx.renoun-tmp-${pid}-0`),
      ],
      [
        join(targetDirectory, '02.alpha.mdx'),
        join(targetDirectory, `02.alpha.mdx.renoun-tmp-${pid}-1`),
      ],
      [
        join(targetDirectory, '03.outro.mdx'),
        join(targetDirectory, `03.outro.mdx.renoun-tmp-${pid}-2`),
      ],
      [
        join(targetDirectory, `02.beta.mdx.renoun-tmp-${pid}-0`),
        join(targetDirectory, '03.beta.mdx'),
      ],
      [
        join(targetDirectory, `02.alpha.mdx.renoun-tmp-${pid}-1`),
        join(targetDirectory, '04.alpha.mdx'),
      ],
      [
        join(targetDirectory, `03.outro.mdx.renoun-tmp-${pid}-2`),
        join(targetDirectory, '05.outro.mdx'),
      ],
    ])
  })

  it('supports underscore delimiter and preserves zero-based padding when present', async () => {
    const targetDirectory = resolve('/workspace/project', 'lessons_underscore')
    const pid = process.pid

    readdirMock.mockResolvedValue([
      {
        name: '00_intro.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '00_intro-updated.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '01_next.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
    ])

    const mtimes = new Map([
      [join(targetDirectory, '00_intro.mdx'), 100],
      [join(targetDirectory, '00_intro-updated.mdx'), 200],
      [join(targetDirectory, '01_next.mdx'), 150],
    ])

    statMock.mockImplementation(async (path) => ({
      mtimeMs: mtimes.get(path) ?? 0,
    }))

    await reorderEntries('lessons_underscore')

    expect(renameMock.mock.calls).toEqual([
      [
        join(targetDirectory, '00_intro.mdx'),
        join(targetDirectory, `00_intro.mdx.renoun-tmp-${pid}-0`),
      ],
      [
        join(targetDirectory, '01_next.mdx'),
        join(targetDirectory, `01_next.mdx.renoun-tmp-${pid}-1`),
      ],
      [
        join(targetDirectory, `00_intro.mdx.renoun-tmp-${pid}-0`),
        join(targetDirectory, '01_intro.mdx'),
      ],
      [
        join(targetDirectory, `01_next.mdx.renoun-tmp-${pid}-1`),
        join(targetDirectory, '02_next.mdx'),
      ],
    ])
  })

  it('introduces padding if any entry uses it (mixed padded/unpadded)', async () => {
    const targetDirectory = resolve('/workspace/project', 'mixed-padding')
    const pid = process.pid

    readdirMock.mockResolvedValue([
      {
        name: '01.alpha.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '2.beta.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '2.beta-updated.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
    ])

    const mtimes = new Map([
      [join(targetDirectory, '01.alpha.mdx'), 100],
      [join(targetDirectory, '2.beta.mdx'), 100],
      [join(targetDirectory, '2.beta-updated.mdx'), 200],
    ])

    statMock.mockImplementation(async (path) => ({
      mtimeMs: mtimes.get(path) ?? 0,
    }))

    await reorderEntries('mixed-padding')

    expect(renameMock.mock.calls).toEqual([
      [
        join(targetDirectory, '2.beta-updated.mdx'),
        join(targetDirectory, `2.beta-updated.mdx.renoun-tmp-${pid}-0`),
      ],
      [
        join(targetDirectory, '2.beta.mdx'),
        join(targetDirectory, `2.beta.mdx.renoun-tmp-${pid}-1`),
      ],
      [
        join(targetDirectory, `2.beta-updated.mdx.renoun-tmp-${pid}-0`),
        join(targetDirectory, '02.beta-updated.mdx'),
      ],
      [
        join(targetDirectory, `2.beta.mdx.renoun-tmp-${pid}-1`),
        join(targetDirectory, '03.beta.mdx'),
      ],
    ])
  })

  it('performs no renames when already ordered (and ignores non-numbered files)', async () => {
    const targetDirectory = resolve('/workspace/project', 'already-ordered')

    readdirMock.mockResolvedValue([
      {
        name: '01.a.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: 'readme.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '02.b.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
      {
        name: '03.c.mdx',
        isDirectory: () => false,
        isFile: () => true,
      },
    ])

    const mtimes = new Map([
      [join(targetDirectory, '01.a.mdx'), 100],
      [join(targetDirectory, '02.b.mdx'), 150],
      [join(targetDirectory, '03.c.mdx'), 200],
      [join(targetDirectory, 'readme.mdx'), 50],
    ])

    statMock.mockImplementation(async (path) => ({
      mtimeMs: mtimes.get(path) ?? 0,
    }))

    await reorderEntries('already-ordered')

    expect(renameMock).not.toHaveBeenCalled()
  })
})
