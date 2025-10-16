import type { Processor } from 'unified'
import type { Element, Root, RootContent, Text } from 'hast'
import type { VFile } from 'vfile'
import { valueToEstree } from 'estree-util-value-to-estree'
import { define } from 'unist-util-mdx-define'

declare module 'unified' {
  interface Data {
    isMarkdown?: boolean
  }
}

/**
 * Configuration for the reading time inference.
 */
export interface InferReadingTimeOptions {
  /**
   * The age or range of ages representing when your target audience typically finishes school.
   * Single number or a 2-element array; null = use defaults.
   */
  age?: [number, number] | [number] | number | null

  /**
   * BCP-47 locale for word segmentation (Intl.Segmenter). Defaults to 'en'.
   */
  locale?: string

  /**
   * Count code blocks? false = exclude; 'slow' = include at half WPM; true = include at normal WPM.
   * Default: 'slow'
   */
  includeCode?: boolean | 'slow'

  /**
   * Include alt text on <img> and text inside <figcaption> in the word count.
   * Default: true
   */
  includeAltText?: boolean

  /**
   * Whether to add a per-image time bump (see imageSeconds).
   * Default: true
   */
  countImages?: boolean

  /**
   * Seconds to add per image when countImages is true. Default: 12 seconds.
   */
  imageSeconds?: number

  /**
   * Rounding strategy for the exported minutes value. Default: 'nearest'.
   * - 'none' returns the raw minutes value
   * - 'nearest' rounds to the nearest value using `digits`
   * - 'floor' floors using `digits`
   * - 'ceil' ceils using `digits`
   */
  rounding?: 'none' | 'nearest' | 'floor' | 'ceil'

  /**
   * Number of fractional digits to keep when rounding (see `rounding`). Default: 1.
   */
  digits?: number

  /**
   * Whether to export a formatted string using Intl.NumberFormat (using `locale` and `digits`).
   * Defaults to `true`. When `false`, exports a raw number.
   */
  format?: boolean
}

/**
 * Estimated reading time in minutes.
 * May be a number or a range tuple when an age range is provided.
 * The result is not rounded so it’s possible to retrieve estimated seconds from it.
 */
export type MDXReadingTime = number | string

/** Exports the reading time as a variable. */
export default function addReadingTime(
  this: Processor,
  {
    age = defaultAge,
    locale = 'en',
    includeCode = 'slow',
    includeAltText = true,
    countImages = true,
    imageSeconds = 12,
    rounding = 'nearest',
    digits = 1,
    format = true,
  }: InferReadingTimeOptions = {}
) {
  const addMeta = inferReadingTimeMeta({
    age,
    locale,
    includeCode,
    includeAltText,
    countImages,
    imageSeconds,
    rounding,
    digits,
    format,
  })
  const isMarkdown = this.data('isMarkdown') === true

  return function (tree: Root, file: VFile) {
    addMeta(tree, file)

    const meta = (
      file.data as {
        meta?: { readingTime?: unknown }
      }
    ).meta
    const readingTime = meta?.readingTime as MDXReadingTime | undefined

    if (!readingTime || isMarkdown) {
      return
    }

    define(tree, file, {
      readingTime: valueToEstree(readingTime),
    })
  }
}

type ReadingTimeResult =
  | [lowEstimate: number, highEstimate: number]
  | [estimate: number]
  | number

const defaultAge: [number, number] = [18, 20]
const firstGradeAge = 5
const graduationAge = 22
const addedWpmPerGrade = 14
const reasonableWpm = 228
const reasonableWpmMax = 340
const baseWpm = reasonableWpm - (18 - firstGradeAge) * addedWpmPerGrade
const precision = 1e6

export function inferReadingTimeMeta({
  age = defaultAge,
  locale = 'en',
  includeCode = 'slow',
  includeAltText = true,
  countImages = true,
  imageSeconds = 12,
  rounding = 'nearest',
  digits = 1,
  format = true,
}: InferReadingTimeOptions = {}) {
  return function (tree: Root, file: VFile) {
    const readingTime = calculateReadingTime(tree, age, {
      locale,
      includeCode,
      includeAltText,
      countImages,
      imageSeconds,
    })

    if (readingTime == null) {
      return
    }

    const data = file.data as FileData
    const matter = data.matter ?? {}
    const meta = (data.meta ??= {} as FileMeta)

    if ((matter as FileMeta).readingTime || meta.readingTime) {
      return
    }

    const minutes = applyRounding(toMinutes(readingTime), rounding, digits)
    if (format) {
      meta.readingTime = formatMinutes(minutes, locale, digits)
    } else {
      meta.readingTime = minutes
    }
  }
}

type FileMeta = Record<string, unknown> & {
  readingTime?: number | string
}

interface FileData {
  matter?: Record<string, unknown>
  meta?: FileMeta
}

type HastNode = Root | RootContent

type InternalOptions = {
  locale: string
  includeCode: boolean | 'slow'
  includeAltText: boolean
  countImages: boolean
  imageSeconds: number
}

function calculateReadingTime(
  node: Root | Element,
  age: InferReadingTimeOptions['age'],
  opts: InternalOptions
): ReadingTimeResult | null {
  if (age == null) {
    age = defaultAge.slice(0) as [number, number]
  }

  if (Array.isArray(age)) {
    const estimates = age
      .slice(0, 2)
      .map((value) => calculateMinutes(node, value, opts))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b)

    if (estimates.length === 0) return null
    return (
      estimates.length === 1 ? [estimates[0]] : estimates
    ) as ReadingTimeResult
  }

  const minutes = calculateMinutes(node, age, opts)
  return minutes === null ? null : minutes
}

function calculateMinutes(
  node: Root | Element,
  age: number,
  opts: InternalOptions
): number | null {
  const targetAge = clamp(Math.round(age), firstGradeAge, graduationAge)

  const wpm = clamp(
    baseWpm + (targetAge - firstGradeAge) * addedWpmPerGrade,
    baseWpm,
    reasonableWpmMax
  )
  if (wpm <= 0) return null

  // Code WPM policy
  const codeWpm =
    opts.includeCode === 'slow' ? Math.max(1, Math.round(wpm / 2)) : wpm

  // Analyze the tree once: get proseWords, codeWords, imageCount
  const analysis = analyzeNode(node as HastNode, {
    locale: opts.locale,
    includeCode: opts.includeCode,
    includeAltText: opts.includeAltText,
  })

  const proseMinutes = analysis.proseWords / wpm
  const codeMinutes = opts.includeCode ? analysis.codeWords / codeWpm : 0

  const imageMinutes =
    opts.countImages && opts.imageSeconds > 0
      ? (analysis.imageCount * opts.imageSeconds) / 60
      : 0

  const minutes = proseMinutes + codeMinutes + imageMinutes
  return Math.round(minutes * precision) / precision
}

/** Types we always skip (MDX/ESM/comments). */
const SKIP_TYPES = new Set<string>([
  'comment',
  'mdxTextExpression',
  'mdxFlowExpression',
  'mdxjsEsm',
])

/** Tags we always skip entirely. */
const SKIP_TAGS_ALWAYS = new Set<string>([
  'script',
  'style',
  'svg',
  'math',
  'noscript',
])

/** Code tags we *optionally* skip (based on includeCode). */
const CODE_TAGS = new Set<string>(['pre', 'code'])

type AnalyzeOptions = {
  locale: string
  includeCode: boolean | 'slow'
  includeAltText: boolean
}

type Analysis = {
  proseWords: number
  codeWords: number
  imageCount: number
}

/**
 * Walks the HAST and returns word counts (prose vs code) and image count.
 * - Skips MDX/ESM/comment nodes.
 * - Skips script/style/svg/math/noscript entirely.
 * - For code/pre: either skip, count as code, or include as prose depending on includeCode.
 * - Includes alt text and figcaptions when enabled.
 */
function analyzeNode(node: HastNode, options: AnalyzeOptions): Analysis {
  let proseWords = 0
  let codeWords = 0
  let imageCount = 0

  function visit(node: HastNode, parentTag?: string) {
    if (!node) return

    // Text node — count directly as prose (unless parent is code/pre and we're treating as code)
    if ((node as Text).type === 'text') {
      const text = String((node as Text).value || '')
      if (!text.trim()) return

      const isCodeParent = parentTag ? CODE_TAGS.has(parentTag) : false

      const words = countWords(text, options.locale)
      if (isCodeParent) {
        if (options.includeCode) codeWords += words
      } else {
        proseWords += words
      }
      return
    }

    // Skip certain node types entirely
    if ('type' in node && SKIP_TYPES.has(node.type)) {
      return
    }

    // Element branch
    if (node.type === 'element') {
      const element = node as Element
      const tag = (element.tagName || '').toLowerCase()

      // Always-skip tags
      if (SKIP_TAGS_ALWAYS.has(tag)) return

      // Image counting
      if (tag === 'img' || tag === 'picture' || tag === 'figure') {
        imageCount += 1
      }

      // Optionally include alt/figcaption text
      if (options.includeAltText) {
        if (tag === 'img') {
          const alt = element.properties?.alt
          if (typeof alt === 'string' && alt.trim()) {
            proseWords += countWords(alt, options.locale)
          }
        }
        if (tag === 'figure' && Array.isArray(element.children)) {
          const caption = element.children.find(
            (child: any) =>
              child &&
              typeof child.tagName === 'string' &&
              child.tagName.toLowerCase() === 'figcaption'
          )
          if (caption) {
            // Walk the figcaption subtree as normal prose
            visit(caption, 'figcaption')
          }
        }
      }

      // Code policy
      const isCodeTag = CODE_TAGS.has(tag)
      if (isCodeTag && options.includeCode === false) {
        // Skip code content entirely
        return
      }

      // Recurse to children
      if (Array.isArray(element.children)) {
        for (const child of element.children) {
          visit(child as HastNode, tag)
        }
      }
      return
    }

    // Nodes with raw string "value" (e.g., raw/unknown) — ignore by default
    if ('value' in node && typeof node.value === 'string') {
      return
    }

    // Generic children traversal
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children as HastNode[]) {
        visit(child, parentTag)
      }
    }
  }

  visit(node, undefined)

  return { proseWords, codeWords, imageCount }
}

/**
 * Unicode-aware word counting using Intl.Segmenter.
 * Counts only segments with isWordLike === true.
 */
function countWords(value: string, locale: string): number {
  const text = value.trim()
  if (!text) {
    return 0
  }
  const segmenter = new Intl.Segmenter(locale, { granularity: 'word' })
  let count = 0
  for (const { isWordLike } of segmenter.segment(text) as Iterable<{
    isWordLike: boolean
  }>) {
    if (isWordLike) {
      count++
    }
  }
  return count
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Normalize a reading time result (number or tuple) to a single minutes value.
 * For ranges, this returns the average of the provided bounds.
 */
function toMinutes(result: ReadingTimeResult): number {
  if (typeof result === 'number') {
    return result
  }
  if (Array.isArray(result)) {
    if (result.length === 1) {
      return result[0]
    }
    const [low, high] = result
    return (low + high) / 2
  }
  return 0
}

function applyRounding(
  value: number,
  mode: 'none' | 'nearest' | 'floor' | 'ceil',
  digits: number
): number {
  if (!isFinite(value)) {
    return 0
  }
  if (mode === 'none') {
    return value
  }
  const factor = Math.pow(10, Math.max(0, Math.floor(digits)))
  if (mode === 'nearest') {
    return Math.round(value * factor) / factor
  }
  if (mode === 'floor') {
    return Math.floor(value * factor) / factor
  }
  return Math.ceil(value * factor) / factor
}

function formatMinutes(value: number, locale: string, digits: number): string {
  try {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: Math.max(0, Math.floor(digits)),
    }).format(value)
  } catch {
    return value.toFixed(Math.max(0, Math.floor(digits)))
  }
}
