import type { AnimationSnapshot, SerializedKeyframe } from './snapshot'

type StyleRecord = Record<string, string>

export interface InterpolatedStyles {
  [prop: string]: string
}

export function interpolateStyles(
  _base: StyleRecord,
  animations: AnimationSnapshot[],
  animationTime?: number
): InterpolatedStyles {
  if (animationTime == null) {
    return {}
  }

  const overrides: InterpolatedStyles = {}
  for (const anim of animations) {
    const duration = anim.duration || 0
    if (duration === 0) continue

    const keyframes = normalizeKeyframes(anim.keyframes)
    if (keyframes.length < 2) continue

    const tRaw = ((animationTime + (anim.startTime ?? 0)) % duration) / duration
    const t = clamp01(tRaw)
    applyKeyframeInterpolation(keyframes, t, overrides)
  }
  return overrides
}

function normalizeKeyframes(
  frames: SerializedKeyframe[]
): SerializedKeyframe[] {
  if (!frames.length) return []
  const withOffsets = frames.map((f, idx) => {
    const copy = { ...f }
    if (copy.offset == null) {
      copy.offset = idx / Math.max(1, frames.length - 1)
    }
    return copy
  })
  return withOffsets.sort(
    (a, b) => (a.offset ?? 0) - (b.offset ?? 0)
  ) as SerializedKeyframe[]
}

function applyKeyframeInterpolation(
  frames: SerializedKeyframe[],
  t: number,
  out: InterpolatedStyles
) {
  let left = frames[0]
  let right = frames[frames.length - 1]
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i]
    const b = frames[i + 1]
    const ao = a.offset ?? 0
    const bo = b.offset ?? 1
    if (t >= ao && t <= bo) {
      left = a
      right = b
      break
    }
  }

  const ao = left.offset ?? 0
  const bo = right.offset ?? 1
  const span = bo - ao || 1
  const easing = parseEasing(left.easing || 'linear')
  const localT = easing(clamp01((t - ao) / span))

  const props = new Set<string>()
  for (const k of Object.keys(left)) {
    if (isMeta(k)) continue
    props.add(k)
  }
  for (const k of Object.keys(right)) {
    if (isMeta(k)) continue
    props.add(k)
  }

  props.forEach((prop) => {
    const av = left[prop] as any
    const bv = right[prop] as any
    const interpolated = interpolateValue(av, bv, localT)
    if (interpolated != null) {
      out[prop] = interpolated
    } else if (localT < 0.5 && av != null) {
      out[prop] = String(av)
    } else if (bv != null) {
      out[prop] = String(bv)
    }
  })
}

function interpolateValue(a: any, b: any, t: number): string | null {
  if (a == null || b == null) return null

  // Color
  const colorA = parseColor(a)
  const colorB = parseColor(b)
  if (colorA && colorB) {
    const r = lerp(colorA[0], colorB[0], t)
    const g = lerp(colorA[1], colorB[1], t)
    const bl = lerp(colorA[2], colorB[2], t)
    const al = lerp(colorA[3], colorB[3], t)
    return `rgba(${r}, ${g}, ${bl}, ${al})`
  }

  // Transform (translate/scale/rotate)
  if (isTransform(a) && isTransform(b)) {
    const ta = parseTransform(a)
    const tb = parseTransform(b)
    const tx = lerp(ta.translateX, tb.translateX, t)
    const ty = lerp(ta.translateY, tb.translateY, t)
    const sx = lerp(ta.scaleX, tb.scaleX, t)
    const sy = lerp(ta.scaleY, tb.scaleY, t)
    const rot = lerp(ta.rotate, tb.rotate, t)
    return `translate(${tx}px, ${ty}px) scale(${sx}, ${sy}) rotate(${rot}deg)`
  }

  // Numeric with units
  const numA = parseFloat(a)
  const numB = parseFloat(b)
  if (isFinite(numA) && isFinite(numB) && hasSameUnit(a, b)) {
    const unit = extractUnit(a)
    const v = numA + (numB - numA) * t
    return `${v}${unit}`
  }

  // Unitless numbers (opacity, etc.)
  if (isFinite(numA) && isFinite(numB) && !hasUnit(a) && !hasUnit(b)) {
    const v = numA + (numB - numA) * t
    return String(v)
  }

  return null
}

function parseColor(input: any): [number, number, number, number] | null {
  if (typeof input !== 'string') return null
  const str = input.trim()
  // rgba() / rgb()
  const rgb = str.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i
  )
  if (rgb) {
    return [
      clamp255(parseFloat(rgb[1])),
      clamp255(parseFloat(rgb[2])),
      clamp255(parseFloat(rgb[3])),
      clamp01(parseFloat(rgb[4] ?? '1')),
    ]
  }
  // hex
  const hex = str.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i)
  if (hex) {
    const h = hex[1]
    const to255 = (h: string) => parseInt(h, 16)
    if (h.length === 3 || h.length === 4) {
      const r = to255(h[0] + h[0])
      const g = to255(h[1] + h[1])
      const b = to255(h[2] + h[2])
      const a = h.length === 4 ? to255(h[3] + h[3]) / 255 : 1
      return [r, g, b, a]
    } else {
      const r = to255(h.slice(0, 2))
      const g = to255(h.slice(2, 4))
      const b = to255(h.slice(4, 6))
      const a = h.length === 8 ? to255(h.slice(6, 8)) / 255 : 1
      return [r, g, b, a]
    }
  }
  return null
}

function isTransform(v: any): boolean {
  return typeof v === 'string' && v.includes('(') && v.includes(')')
}

type ParsedTransform = {
  translateX: number
  translateY: number
  scaleX: number
  scaleY: number
  rotate: number // degrees
}

function parseTransform(value: string): ParsedTransform {
  const result: ParsedTransform = {
    translateX: 0,
    translateY: 0,
    scaleX: 1,
    scaleY: 1,
    rotate: 0,
  }
  const parts = value.match(/[a-z]+\([^)]+\)/gi)
  if (!parts) return result
  for (const part of parts) {
    if (part.startsWith('translate')) {
      const nums = part.match(/-?[\d.]+/g)
      if (nums) {
        result.translateX = parseFloat(nums[0] ?? '0')
        result.translateY = parseFloat(nums[1] ?? '0')
      }
    } else if (part.startsWith('scale')) {
      const nums = part.match(/-?[\d.]+/g)
      if (nums) {
        result.scaleX = parseFloat(nums[0] ?? '1')
        result.scaleY = parseFloat(nums[1] ?? nums[0] ?? '1')
      }
    } else if (part.startsWith('rotate')) {
      const num = part.match(/-?[\d.]+/g)?.[0]
      if (num) result.rotate = parseFloat(num)
    }
  }
  return result
}

function hasUnit(v: string | number): boolean {
  return typeof v === 'string' && /[a-z%]+$/i.test(v.trim())
}

function hasSameUnit(a: any, b: any): boolean {
  const ua = extractUnit(a)
  const ub = extractUnit(b)
  return ua === ub
}

function extractUnit(v: any): string {
  if (typeof v !== 'string') return ''
  const match = v.trim().match(/[a-z%]+$/i)
  return match ? match[0] : ''
}

function isMeta(prop: string): boolean {
  return prop === 'offset' || prop === 'easing' || prop === 'composite'
}

function clamp01(v: number): number {
  if (!isFinite(v)) return 0
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

function clamp255(v: number): number {
  if (!isFinite(v)) return 0
  if (v < 0) return 0
  if (v > 255) return 255
  return Math.round(v)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

type EasingFn = (t: number) => number

function parseEasing(input: string): EasingFn {
  const easing = input.trim().toLowerCase()
  if (easing === 'linear') return (t) => t
  if (easing === 'ease') return cubicBezier(0.25, 0.1, 0.25, 1)
  if (easing === 'ease-in') return cubicBezier(0.42, 0, 1, 1)
  if (easing === 'ease-out') return cubicBezier(0, 0, 0.58, 1)
  if (easing === 'ease-in-out') return cubicBezier(0.42, 0, 0.58, 1)
  if (easing === 'step-start') return steps(1, 'start')
  if (easing === 'step-end') return steps(1, 'end')
  const bez = easing.match(/^cubic-bezier\(([^)]+)\)$/)
  if (bez) {
    const nums = bez[1]
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => isFinite(n))
    if (nums.length === 4)
      return cubicBezier(nums[0], nums[1], nums[2], nums[3])
  }
  const step = easing.match(/^steps\(([^,]+)(?:,([^)]+))?\)$/)
  if (step) {
    const count = parseInt(step[1].trim(), 10)
    const pos = (step[2] ?? 'end').trim()
    if (Number.isFinite(count) && count > 0) return steps(count, pos as any)
  }
  return (t) => t
}

function cubicBezier(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number
): EasingFn {
  // Borrowed structure from standard cubic-bezier evaluation
  const cx = 3 * p1x
  const bx = 3 * (p2x - p1x) - cx
  const ax = 1 - cx - bx
  const cy = 3 * p1y
  const by = 3 * (p2y - p1y) - cy
  const ay = 1 - cy - by

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t
  const sampleDerivX = (t: number) => (3 * ax * t + 2 * bx) * t + cx

  const solveX = (x: number) => {
    let t2 = x
    for (let i = 0; i < 8; i++) {
      const x2 = sampleX(t2) - x
      if (Math.abs(x2) < 1e-6) return t2
      const d2 = sampleDerivX(t2)
      if (Math.abs(d2) < 1e-6) break
      t2 = t2 - x2 / d2
    }
    // fallback to bisection
    let t0 = 0
    let t1 = 1
    t2 = x
    while (t0 < t1) {
      const x2 = sampleX(t2) - x
      if (Math.abs(x2) < 1e-6) return t2
      if (x2 > 0) t1 = t2
      else t0 = t2
      t2 = (t1 + t0) / 2
    }
    return t2
  }

  return (x: number) => sampleY(solveX(x))
}

function steps(n: number, pos: 'start' | 'end' | string): EasingFn {
  return (t: number) => {
    const dir = pos === 'start' ? 1 : 0
    return Math.floor(t * n + dir) / n
  }
}
