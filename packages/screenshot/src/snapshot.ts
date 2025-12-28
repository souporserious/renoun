// Snapshot data structures for serializable DOM capture.

export type SerializedRect = {
  left: number
  top: number
  width: number
  height: number
  right: number
  bottom: number
}

export interface SerializedKeyframe {
  offset?: number
  easing?: string
  composite?: string
  // Property-value pairs
  [property: string]: unknown
}

export interface SerializedEffectTiming {
  duration: number
  delay: number
  endDelay: number
  iterations: number
  iterationStart: number
  direction: PlaybackDirection
  fill: FillMode
  easing: string
}

export interface AnimationSnapshot {
  id: string
  name: string
  currentTime: number
  startTime: number | null
  duration: number
  playbackRate: number
  playState: AnimationPlayState
  keyframes: SerializedKeyframe[]
  timing: SerializedEffectTiming
}

export interface ResourceSnapshot {
  type: 'image'
  url: string
  dataUrl: string
  width: number
  height: number
}

export interface ElementSnapshot {
  id: string
  tagName: string
  textContent?: string
  boundingRect: SerializedRect
  styles: Record<string, string>
  animations: AnimationSnapshot[]
  parentId: string | null
  childIds: string[]
  attributes?: Record<string, string>
}

export interface DOMSnapshot {
  version: 1
  timestamp: number
  captureRect: SerializedRect
  scale: number
  colorSpace: 'srgb' | 'display-p3'
  rootId: string
  elements: Record<string, ElementSnapshot>
  resources: ResourceSnapshot[]
}

export interface AnalyzeOptions {
  scale?: number
}

export async function analyzeSubtree(
  root: HTMLElement,
  options: AnalyzeOptions = {}
): Promise<DOMSnapshot> {
  const ownerDocument = root.ownerDocument
  const defaultView = ownerDocument.defaultView
  if (!ownerDocument || !defaultView) {
    throw new Error('Element must be attached to a document with a window')
  }

  const scale = options.scale ?? defaultView.devicePixelRatio ?? 1
  const colorSpace = defaultView.matchMedia('(color-gamut: p3)').matches
    ? 'display-p3'
    : 'srgb'

  const captureRect = serializeRect(root.getBoundingClientRect())

  let idCounter = 0
  const idMap = new Map<Node, string>()
  const elements: Record<string, ElementSnapshot> = {}
  const resources: ResourceSnapshot[] = []

  const getId = (node: Node) => {
    let id = idMap.get(node)
    if (!id) {
      id = `n${idCounter++}`
      idMap.set(node, id)
    }
    return id
  }

  const serializeAttributes = (el: Element): Record<string, string> => {
    const attrs: Record<string, string> = {}
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i]
      attrs[attr.name] = attr.value
    }
    return attrs
  }

  const captureNode = async (
    node: Node,
    parentId: string | null
  ): Promise<void> => {
    const nodeId = getId(node)

    if (node.nodeType === Node.TEXT_NODE) {
      // Approximate rect for text via range; fallback to parent rect
      let rect: DOMRect | null = null
      try {
        const range = ownerDocument.createRange()
        range.selectNodeContents(node)
        rect = range.getBoundingClientRect()
        range.detach()
      } catch {
        rect = null
      }
      const boundingRect = rect
        ? serializeRect(rect)
        : parentId && elements[parentId]
          ? elements[parentId].boundingRect
          : {
              left: 0,
              top: 0,
              width: 0,
              height: 0,
              right: 0,
              bottom: 0,
            }

      elements[nodeId] = {
        id: nodeId,
        tagName: '#text',
        textContent: node.textContent ?? '',
        boundingRect,
        styles: {},
        animations: [],
        parentId,
        childIds: [],
      }
      if (parentId) {
        elements[parentId].childIds.push(nodeId)
      }
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const style = defaultView.getComputedStyle(el)
    const rect = serializeRect(el.getBoundingClientRect())
    const animations = el
      .getAnimations({ subtree: false })
      .map((a) => serializeAnimation(a))
      .filter(Boolean) as AnimationSnapshot[]

    const snapshot: ElementSnapshot = {
      id: nodeId,
      tagName: el.tagName.toLowerCase(),
      textContent:
        el.childNodes.length === 0 ? (el.textContent ?? '') : undefined,
      boundingRect: rect,
      styles: cloneStyles(style),
      animations,
      parentId,
      childIds: [],
      attributes: serializeAttributes(el),
    }
    elements[nodeId] = snapshot
    if (parentId) {
      elements[parentId].childIds.push(nodeId)
    }

    // Capture image resources immediately
    if (el.tagName.toLowerCase() === 'img') {
      const img = el as HTMLImageElement
      const src = img.currentSrc || img.src
      if (src) {
        try {
          const dataUrl = await imageToDataUrl(img)
          if (dataUrl) {
            resources.push({
              type: 'image',
              url: src,
              dataUrl,
              width: img.naturalWidth || img.width,
              height: img.naturalHeight || img.height,
            })
          }
        } catch {
          // ignore resource capture failures
        }
      }
    }

    const children = Array.from(el.childNodes)
    for (const child of children) {
      await captureNode(child, nodeId)
    }
  }

  await captureNode(root, null)

  return {
    version: 1,
    timestamp: Date.now(),
    captureRect,
    scale,
    colorSpace,
    rootId: getId(root),
    elements,
    resources,
  }
}

async function imageToDataUrl(image: HTMLImageElement): Promise<string | null> {
  if (
    !image.complete ||
    image.naturalWidth === 0 ||
    image.naturalHeight === 0
  ) {
    try {
      await image.decode()
    } catch {
      return null
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(image, 0, 0)
  return canvas.toDataURL()
}

export function serializeRect(rect: DOMRect): SerializedRect {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom,
  }
}

export function cloneStyles(
  style: CSSStyleDeclaration
): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < style.length; i++) {
    const prop = style[i]
    result[prop] = style.getPropertyValue(prop)
  }
  return result
}

export function serializeAnimation(anim: Animation): AnimationSnapshot | null {
  const effect = anim.effect
  if (!effect || typeof effect.getComputedTiming !== 'function') return null

  const timing = effect.getComputedTiming()
  const keyframes: SerializedKeyframe[] =
    typeof (effect as any).getKeyframes === 'function'
      ? ((effect as any).getKeyframes() as Keyframe[]).map((kf) => {
          const { offset, easing, composite, ...rest } = kf
          return {
            offset: offset == null ? undefined : Number(offset),
            easing,
            composite,
            ...rest,
          }
        })
      : []

  return {
    id: anim.id,
    name: anim.id || (anim as any).animationName || '',
    currentTime: anim.currentTime == null ? 0 : Number(anim.currentTime as any),
    startTime: anim.startTime == null ? null : Number(anim.startTime as any),
    duration: Number(timing.duration ?? 0),
    playbackRate: anim.playbackRate ?? 1,
    playState: anim.playState,
    keyframes,
    timing: {
      duration: Number(timing.duration ?? 0),
      delay: Number(timing.delay ?? 0),
      endDelay: Number(timing.endDelay ?? 0),
      iterations: Number(timing.iterations ?? 1),
      iterationStart: Number(timing.iterationStart ?? 0),
      direction: timing.direction ?? 'normal',
      fill: timing.fill ?? 'none',
      easing: timing.easing ?? 'linear',
    },
  }
}
