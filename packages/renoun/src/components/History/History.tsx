import React, { Suspense } from 'react'

import type {
  ExportChange,
  ExportHistoryGenerator,
  ExportHistoryProgressEvent,
  ExportHistoryReport,
} from '../../file-system/index.tsx'

/** A single export entry derived from the final report. */
export interface HistoryExportEntry {
  /** The ID of the export. */
  id: string

  /** The name of the export. */
  name: string

  /** The file path of the export. */
  filePath: string

  /** The changes made to the export. */
  changes: ExportChange[]
}

export interface HistoryProgressProps {
  /** Current processing phase. */
  phase: string

  /** Milliseconds elapsed since the operation started. */
  elapsedMs: number

  /** Number of commits processed so far. */
  commitsProcessed: number

  /** Total number of commits to process. */
  totalCommits: number

  /** Number of unique exports discovered so far. */
  exportCount: number

  /** Total number of changes discovered so far. */
  changeCount: number
}

export interface HistoryCompleteProps {
  /** Completed export history report. */
  report: ExportHistoryReport

  /** Total milliseconds the operation took. */
  elapsedMs: number

  /** Final entries after `selectEntries` is applied. */
  entries: HistoryExportEntry[]

  /** Total number of entries in `entries`. */
  exportCount: number

  /** Total number of changes across `entries`. */
  changeCount: number

  /** Default rendered list output. */
  children: React.ReactNode
}

export interface HistoryListComponents {
  /** Wraps the final exports list. */
  Exports: React.ComponentType<{
    entries: HistoryExportEntry[]
    children: React.ReactNode
  }>

  /** Renders a single export entry. `children` is the rendered changes list. */
  Export: React.ComponentType<{
    entry: HistoryExportEntry
    children: React.ReactNode
  }>

  /** Wraps the changes list for an export entry. */
  Changes: React.ComponentType<{
    entry: HistoryExportEntry
    children: React.ReactNode
  }>

  /** Renders a single change for an export entry. */
  Change: React.ComponentType<{
    entry: HistoryExportEntry
    change: ExportChange
    index: number
    isLast: boolean
  }>
}

export interface HistoryComponents extends HistoryListComponents {
  /** Optional root wrapper around the entire component output. */
  Root: React.ComponentType<{ children: React.ReactNode }>

  /** Renders progress while streaming. */
  Progress: React.ComponentType<HistoryProgressProps>

  /** Renders completion output with access to report + projected entries. */
  Complete: React.ComponentType<HistoryCompleteProps>
}

export interface HistorySelectEntriesContext {
  /** Completed report from the source. */
  report: ExportHistoryReport

  /** Default entries derived from the report. */
  entries: HistoryExportEntry[]
}

/**
 * Allows selecting/filtering/sorting final entries before rendering.
 *
 * Useful for custom views such as "recently added in latest release" while
 * keeping rendering fully slot-driven.
 */
export type HistorySelectEntries = (
  context: HistorySelectEntriesContext
) => HistoryExportEntry[]

function FragmentView({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function NullView() {
  return null
}

const defaultComponents: HistoryComponents = {
  Root: FragmentView,
  Progress: NullView,
  Complete: FragmentView,
  Exports: FragmentView,
  Export: FragmentView,
  Changes: FragmentView,
  Change: NullView,
}

export interface HistoryProps {
  /** The async generator returned by `repository.getExportHistory()`. */
  source: ExportHistoryGenerator

  /** Override any default slot renderer. */
  components?: Partial<HistoryComponents>

  /** Select/filter/sort final entries before rendering. */
  selectEntries?: HistorySelectEntries
}

/**
 * Recursive async server component.
 *
 * Each yielded progress event creates a nested Suspense fallback. Consumers
 * can render this via `components.Progress`, while final output is rendered by
 * `components.Complete` with projected entries.
 */
async function StreamResolver({
  source,
  startMs,
  components,
  selectEntries,
}: {
  source: ExportHistoryGenerator
  startMs: number
  components: HistoryComponents
  selectEntries?: HistorySelectEntries
}) {
  const next = await source.next()

  if (next.done) {
    return (
      <ReportView
        report={next.value}
        elapsedMs={Date.now() - startMs}
        components={components}
        selectEntries={selectEntries}
      />
    )
  }

  const ev = next.value
  const { exportCount, changeCount } = getCounts(ev)

  return (
    <Suspense
      fallback={
        <components.Progress
          phase={ev.phase}
          elapsedMs={ev.elapsedMs}
          commitsProcessed={ev.commitsProcessed ?? 0}
          totalCommits={ev.totalCommits ?? 0}
          exportCount={exportCount}
          changeCount={changeCount}
        />
      }
    >
      <StreamResolver
        source={source}
        startMs={startMs}
        components={components}
        selectEntries={selectEntries}
      />
    </Suspense>
  )
}

function ReportView({
  report,
  elapsedMs,
  components,
  selectEntries,
}: {
  report: ExportHistoryReport
  elapsedMs: number
  components: HistoryComponents
  selectEntries?: HistorySelectEntries
}) {
  const baseEntries = getHistoryEntries(report)
  const entries = selectEntries
    ? selectEntries({ report, entries: baseEntries })
    : baseEntries

  if (!Array.isArray(entries)) {
    throw new Error('[renoun] History "selectEntries" must return an array.')
  }

  const exportCount = entries.length
  const changeCount = entries.reduce(
    (sum, entry) => sum + entry.changes.length,
    0
  )

  const Exports = components.Exports
  const ExportItem = components.Export
  const Changes = components.Changes
  const ChangeItem = components.Change
  const Complete = components.Complete

  return (
    <Complete
      report={report}
      elapsedMs={elapsedMs}
      entries={entries}
      exportCount={exportCount}
      changeCount={changeCount}
    >
      <Exports entries={entries}>
        {entries.map((entry) => (
          <ExportItem key={entry.id} entry={entry}>
            <Changes entry={entry}>
              {entry.changes.map((change, index) => (
                <ChangeItem
                  key={index}
                  entry={entry}
                  change={change}
                  index={index}
                  isLast={index === entry.changes.length - 1}
                />
              ))}
            </Changes>
          </ExportItem>
        ))}
      </Exports>
    </Complete>
  )
}

/** Streams export history from a repository source. */
export const History =
  process.env.NODE_ENV === 'development' ? HistoryWithFallback : HistoryAsync

function HistoryWithFallback(props: HistoryProps) {
  return (
    <Suspense>
      <HistoryAsync {...props} />
    </Suspense>
  )
}

async function HistoryAsync({
  source,
  components = {},
  selectEntries,
}: HistoryProps) {
  const mergedComponents: HistoryComponents = {
    ...defaultComponents,
    ...components,
  }

  const Root = mergedComponents.Root
  const startMs = Date.now()

  return (
    <Root>
      <Suspense
        fallback={
          <mergedComponents.Progress
            phase="start"
            elapsedMs={0}
            commitsProcessed={0}
            totalCommits={0}
            exportCount={0}
            changeCount={0}
          />
        }
      >
        <StreamResolver
          source={source}
          startMs={startMs}
          components={mergedComponents}
          selectEntries={selectEntries}
        />
      </Suspense>
    </Root>
  )
}

function getCounts(event: ExportHistoryProgressEvent) {
  if (event.exports == null) {
    return { exportCount: 0, changeCount: 0 }
  }

  const exportCount = Object.keys(event.exports).length
  const changeCount = Object.values(event.exports).reduce(
    (sum, changes) => sum + changes.length,
    0
  )

  return { exportCount, changeCount }
}

function createEntry(id: string, changes: ExportChange[]): HistoryExportEntry {
  const parts = id.split('::')
  const exportName = parts[parts.length - 1] ?? id
  const filePath = parts.length > 1 ? parts.slice(0, -1).join('::') : ''
  const localName = changes.find((change) => change.localName)?.localName

  return {
    id,
    name: localName ?? exportName,
    filePath,
    changes,
  }
}

/** Creates sorted history entries from a completed report. */
export function getHistoryEntries(
  report: ExportHistoryReport
): HistoryExportEntry[] {
  return Object.entries(report.exports)
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([id, changes]) => createEntry(id, changes))
}

/** Finds the most recent release label present in a report. */
export function getLatestHistoryRelease(
  report: ExportHistoryReport
): string | undefined {
  let latestRelease: string | undefined
  let latestUnix = -Infinity

  for (const changes of Object.values(report.exports)) {
    for (const change of changes) {
      if (!change.release) continue
      if (change.unix > latestUnix) {
        latestUnix = change.unix
        latestRelease = change.release
      }
    }
  }

  return latestRelease
}

export interface HistoryRecentlyAddedOptions {
  /**
   * Release label to filter against.
   *
   * Defaults to `'latest'`, which derives the most recent release present in
   * the report using commit timestamps.
   */
  release?: 'latest' | string
}

/**
 * Selects only "Added" changes for a specific release.
 *
 * This is intended for views like "recently added in latest release".
 */
export function getRecentlyAddedHistoryEntries(
  report: ExportHistoryReport,
  options: HistoryRecentlyAddedOptions = {}
): HistoryExportEntry[] {
  const targetRelease =
    options.release === undefined || options.release === 'latest'
      ? getLatestHistoryRelease(report)
      : options.release

  if (!targetRelease) {
    return []
  }

  const entries = getHistoryEntries(report)
  const filtered: HistoryExportEntry[] = []

  for (const entry of entries) {
    const changes = entry.changes.filter(
      (change) => change.kind === 'Added' && change.release === targetRelease
    )

    if (changes.length > 0) {
      filtered.push({
        ...entry,
        changes,
      })
    }
  }

  return filtered
}
