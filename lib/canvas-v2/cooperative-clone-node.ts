// Adapted from html-to-image 1.11.13 (MIT). The library's recursive clone
// monopolizes the main thread on large boards; this version yields between
// bounded batches while retaining its DOM/style/pseudo-element behavior.
import { canvasV2NativeModelCaptureForClone, canvasV2ScreenCaptureForClone } from './interactive-screen-capture'
import type { Options } from 'html-to-image/lib/types'
import { clonePseudoElements } from 'html-to-image/lib/clone-pseudos'
import {
  createImage,
  toArray,
  isInstanceOfElement,
  getStyleProperties,
} from 'html-to-image/lib/util'
import { getMimeType } from 'html-to-image/lib/mimes'
import { resourceToDataURL } from 'html-to-image/lib/dataurl'
import { waitForCanvasInputQuiet } from './capture-input-scheduler'
import { CaptureConcurrency, mapCaptureBatch } from './capture-batch'

interface CloneBudget { lastYield: number; yields: number; overview?: boolean; isCurrent?: () => boolean; captures?: CaptureConcurrency; visited?: number; reportedAt?: number; onProgress?: (visited: number) => void }

async function yieldForInput(budget: CloneBudget) {
  if (budget.isCurrent && !budget.isCurrent()) throw new Error("Canvas observation was superseded.")
  if (performance.now() - budget.lastYield < 8) return
  await waitForCanvasInputQuiet(220, budget.isCurrent)
  budget.yields += 1
  if (budget.yields % 6 === 0) {
    // scheduler.yield() may resume before Chromium paints; periodically allow
    // a full frame while shorter task yields keep total capture time bounded.
    await new Promise<void>((resolve) => {
      const fallback = window.setTimeout(resolve, 32)
      window.requestAnimationFrame(() => {
        window.clearTimeout(fallback)
        window.setTimeout(resolve, 0)
      })
    })
  } else {
    const scheduling = window as Window & { scheduler?: { yield?: () => Promise<void> } }
    if (scheduling.scheduler?.yield) await scheduling.scheduler.yield()
    else await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  }
  budget.lastYield = performance.now()
}

async function cloneCanvasElement(canvas: HTMLCanvasElement) {
  const dataURL = canvas.toDataURL()
  if (dataURL === 'data:,') {
    return canvas.cloneNode(false) as HTMLCanvasElement
  }
  return createImage(dataURL)
}

async function cloneVideoElement(video: HTMLVideoElement, options: Options) {
  if (video.currentSrc) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = video.clientWidth
    canvas.height = video.clientHeight
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataURL = canvas.toDataURL()
    return createImage(dataURL)
  }

  const poster = video.poster
  const contentType = getMimeType(poster)
  const dataURL = await resourceToDataURL(poster, contentType, options)
  return createImage(dataURL)
}

async function cloneIFrameElement(iframe: HTMLIFrameElement, options: Options, budget: CloneBudget) {
  try {
    if (iframe?.contentDocument?.body) {
      return (await cloneNode(
        iframe.contentDocument.body,
        options,
        true,
        budget,
      )) as HTMLBodyElement
    }
  } catch {
    // Failed to clone iframe
  }

  return iframe.cloneNode(false) as HTMLIFrameElement
}

async function cloneSingleNode<T extends HTMLElement>(
  node: T,
  options: Options,
  budget: CloneBudget,
): Promise<HTMLElement> {
  if (isInstanceOfElement(node, HTMLCanvasElement)) {
    return cloneCanvasElement(node)
  }

  if (isInstanceOfElement(node, HTMLVideoElement)) {
    return cloneVideoElement(node, options)
  }

  if (isInstanceOfElement(node, HTMLIFrameElement)) {
    return cloneIFrameElement(node, options, budget)
  }

  return node.cloneNode(isSVGElement(node)) as T
}

const isSlotElement = (node: HTMLElement): node is HTMLSlotElement =>
  node.tagName != null && node.tagName.toUpperCase() === 'SLOT'

const isSVGElement = (node: HTMLElement): node is HTMLSlotElement =>
  node.tagName != null && node.tagName.toUpperCase() === 'SVG'

async function cloneChildren<T extends HTMLElement>(
  nativeNode: T,
  clonedNode: T,
  options: Options,
  budget: CloneBudget,
): Promise<T> {
  if (isSVGElement(clonedNode)) {
    return clonedNode
  }

  let children: T[] = []

  if (isSlotElement(nativeNode) && nativeNode.assignedNodes) {
    children = toArray<T>(nativeNode.assignedNodes())
  } else if (
    isInstanceOfElement(nativeNode, HTMLIFrameElement) &&
    nativeNode.contentDocument?.body
  ) {
    children = toArray<T>(nativeNode.contentDocument.body.childNodes)
  } else {
    children = toArray<T>((nativeNode.shadowRoot ?? nativeNode).childNodes)
  }

  if (
    children.length === 0 ||
    isInstanceOfElement(nativeNode, HTMLVideoElement)
  ) {
    return clonedNode
  }

  const clones = await mapCaptureBatch(children, child => cloneNode(child, options, false, budget))
  for (const child of clones) if (child) clonedNode.appendChild(child)

  return clonedNode
}

function cloneCSSStyle<T extends HTMLElement>(
  nativeNode: T,
  clonedNode: T,
  options: Options,
) {
  const targetStyle = clonedNode.style
  if (!targetStyle) {
    return
  }

  const sourceStyle = window.getComputedStyle(nativeNode)
  if (sourceStyle.cssText) {
    targetStyle.cssText = sourceStyle.cssText
    targetStyle.transformOrigin = sourceStyle.transformOrigin
  } else {
    getStyleProperties(options).forEach((name) => {
      let value = sourceStyle.getPropertyValue(name)
      if (name === 'font-size' && value.endsWith('px')) {
        const reducedFont =
          Math.floor(parseFloat(value.substring(0, value.length - 2))) - 0.1
        value = `${reducedFont}px`
      }

      if (
        isInstanceOfElement(nativeNode, HTMLIFrameElement) &&
        name === 'display' &&
        value === 'inline'
      ) {
        value = 'block'
      }

      if (name === 'd' && clonedNode.getAttribute('d')) {
        value = `path(${clonedNode.getAttribute('d')})`
      }

      targetStyle.setProperty(
        name,
        value,
        sourceStyle.getPropertyPriority(name),
      )
    })
  }
  if((options as Options&{uncullImages?:boolean}).uncullImages&&nativeNode.hasAttribute('data-canvas-v2-image-offscreen')){
    const visibility=nativeNode.getAttribute('data-canvas-v2-image-authored-visibility');
    if(visibility)targetStyle.setProperty('visibility',visibility,'important');
    clonedNode.removeAttribute('data-canvas-v2-image-offscreen');clonedNode.removeAttribute('data-canvas-v2-image-authored-visibility');
  }

}

function cloneInputValue<T extends HTMLElement>(nativeNode: T, clonedNode: T) {
  if (isInstanceOfElement(nativeNode, HTMLTextAreaElement)) {
    clonedNode.innerHTML = nativeNode.value
  }

  if (isInstanceOfElement(nativeNode, HTMLInputElement)) {
    clonedNode.setAttribute('value', nativeNode.value)
  }
}

function cloneSelectValue<T extends HTMLElement>(nativeNode: T, clonedNode: T) {
  if (isInstanceOfElement(nativeNode, HTMLSelectElement)) {
    const clonedSelect = clonedNode as any as HTMLSelectElement
    const selectedOption = Array.from(clonedSelect.children).find(
      (child) => nativeNode.value === child.getAttribute('value'),
    )

    if (selectedOption) {
      selectedOption.setAttribute('selected', '')
    }
  }
}

function decorate<T extends HTMLElement>(
  nativeNode: T,
  clonedNode: T,
  options: Options,
): T {
  if (isInstanceOfElement(clonedNode, Element)) {
    cloneCSSStyle(nativeNode, clonedNode, options)
    clonePseudoElements(nativeNode, clonedNode, options)
    cloneInputValue(nativeNode, clonedNode)
    cloneSelectValue(nativeNode, clonedNode)
  }

  return clonedNode
}

async function ensureSVGSymbols<T extends HTMLElement>(
  clone: T,
  options: Options,
  budget: CloneBudget,
) {
  const uses = clone.querySelectorAll ? clone.querySelectorAll('use') : []
  if (uses.length === 0) {
    return clone
  }

  const processedDefs: { [key: string]: HTMLElement } = {}
  for (let i = 0; i < uses.length; i++) {
    const use = uses[i]
    const id = use.getAttribute('xlink:href')
    if (id) {
      const exist = clone.querySelector(id)
      const definition = document.querySelector(id) as HTMLElement
      if (!exist && definition && !processedDefs[id]) {
        processedDefs[id] = (await cloneNode(definition, options, true, budget))!
      }
    }
  }

  const nodes = Object.values(processedDefs)
  if (nodes.length) {
    const ns = 'http://www.w3.org/1999/xhtml'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('xmlns', ns)
    svg.style.position = 'absolute'
    svg.style.width = '0'
    svg.style.height = '0'
    svg.style.overflow = 'hidden'
    svg.style.display = 'none'

    const defs = document.createElementNS(ns, 'defs')
    svg.appendChild(defs)

    for (let i = 0; i < nodes.length; i++) {
      defs.appendChild(nodes[i])
    }

    clone.appendChild(svg)
  }

  return clone
}

export async function cloneNode<T extends HTMLElement>(
  node: T,
  options: Options,
  isRoot?: boolean,
  budget: CloneBudget = { lastYield: performance.now(), yields: 0 },
): Promise<T | null> {
  // Continuity covers are ephemeral UI, never authored pixels or evidence.
  if (node.nodeType === 1 && (node as Element).hasAttribute('data-canvas-v2-presentation-preview')) return null
  if (!isRoot && options.filter && !options.filter(node)) {
    return null
  }

  budget.captures ??= new CaptureConcurrency(4)

  await yieldForInput(budget)
  budget.visited = (budget.visited ?? 0) + 1
  if (performance.now() - (budget.reportedAt ?? 0) > 250) {
    budget.reportedAt = performance.now()
    budget.onProgress?.(budget.visited)
  }
  if (isInstanceOfElement(node, HTMLElement) && (node.hasAttribute('data-canvas-v2-screen') || node.hasAttribute('data-canvas-v2-interactive-screen'))) {
    let pixels:string|undefined
    try { pixels = await budget.captures.run(() => canvasV2ScreenCaptureForClone(node, budget.overview ?? false)) }
    catch(error) {
      const owner=(node.getAttribute('data-canvas-v2-interactive-screen')??node.getAttribute('data-canvas-v2-node-id')??'unknown').slice(0,160)
      const detail=error instanceof Error?error.message:'The embedded screen image could not be loaded.'
      throw new Error(`Screen ${owner} capture failed: ${detail}`)
    }
    if (pixels) {
      const image = await createImage(pixels)
      cloneCSSStyle<HTMLElement>(node, image, options)
      image.style.objectFit = 'contain'
      image.style.objectPosition = 'top left'
      return image as unknown as T
    }
  }
  // The observation source lives in a private iframe. html-to-image's
  // constructor-aware helper recognizes that iframe's HTMLElement realm;
  // `instanceof HTMLElement` would silently miss model nodes there.
  if (isInstanceOfElement(node, HTMLElement) && node.hasAttribute('data-canvas-v2-model')) {
    const pixels = await budget.captures.run(() => canvasV2NativeModelCaptureForClone(node))
    if (pixels) {
      const image = await createImage(pixels)
      cloneCSSStyle<HTMLElement>(node, image, options)
      image.style.objectFit = 'contain'
      image.style.objectPosition = 'top left'
      return image as unknown as T
    }
  }
  return Promise.resolve(node)
    .then((clonedNode) => cloneSingleNode(clonedNode, options, budget) as Promise<T>)
    .then((clonedNode) => cloneChildren(node, clonedNode, options, budget))
    .then((clonedNode) => decorate(node, clonedNode, options))
    // Descendant clones are assembled into the final tree first. Scanning each
    // partial subtree for <use> references repeats the same walk at every
    // ancestor and becomes quadratic on screenshot-rich boards.
    .then((clonedNode) => isRoot ? ensureSVGSymbols(clonedNode, options, budget) : clonedNode)
}
