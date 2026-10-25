/**
 * Draws a transcript, or a gene's transcripts, from the layout JBrowse has
 * already computed: exon/CDS boxes (UTRs thinner), introns as carets ("hats")
 * between them, and an arrowhead at the 3' end for the strand. Carets point
 * up, or down on minus-strand transcripts when `carets` is `strand`.
 *
 * Kept free of JBrowse imports so it can be tested with a recording context.
 */

export interface PartLayout {
  x: number
  y: number
  width: number
  height: number
  children: PartLayout[]
  feature: { get(key: string): unknown }
}

export interface ModelStyle {
  /** Box fill for a part (exon, CDS or UTR). */
  fill(part: PartLayout): string
  /** Optional box outline. */
  outline(part: PartLayout): string | undefined
  /** Intron and arrow colour for a transcript. */
  stroke(row: PartLayout): string
}

/**
 * `strand`: carets point up on the plus strand and down on the minus strand.
 * `up`: all carets point up, as in most browsers.
 */
export type CaretMode = 'strand' | 'up'
/**
 * Feature property, set by the adapters from their `intronCarets` slot, that
 * carries the caret direction to the glyph. Renderers run in a web worker
 * with only the track's adapter and renderer config, so the adapter is where
 * a track can choose it.
 */
export const INTRON_CARETS = 'intronCarets'
export const DEFAULT_CARET_MODE: CaretMode = 'strand'
export const caretMode = (v: unknown): CaretMode => (v === 'up' || v === 'strand' ? v : DEFAULT_CARET_MODE)

export interface DrawOptions {
  reversed: boolean
  canvasWidth: number
  carets?: CaretMode
}

export const UTR_HEIGHT_FRACTION = 0.65
export const ARROW_LENGTH = 7
const ARROW_SIZE = 5
/** Gaps narrower than this (in px) are drawn as a plain line, not a caret. */
export const MIN_CARET_WIDTH = 3

const UTR = /(\bUTR|_UTR|untranslated[_\s]region)\b/i
export const isUTR = (part: PartLayout) => UTR.test(String(part.feature.get('type') ?? ''))

const offScreen = (x: number, w: number, canvasWidth: number) => x + w < 0 || x > canvasWidth

/** A gene's rows are its transcripts; a transcript is its own single row. */
export function rowsOf(layout: PartLayout) {
  return layout.children.some(c => c.children.length) ? layout.children : [layout]
}

/** Visual gaps between the parts of a row, left to right, in px. */
export function intronGaps(parts: PartLayout[]) {
  const sorted = [...parts].sort((a, b) => a.x - b.x)
  const gaps: { left: number; right: number }[] = []
  let edge = Number.NEGATIVE_INFINITY
  for (const p of sorted) {
    if (edge > Number.NEGATIVE_INFINITY && p.x > edge) {
      gaps.push({ left: edge, right: p.x })
    }
    edge = Math.max(edge, p.x + p.width)
  }
  return gaps
}

function drawCaret(ctx: CanvasRenderingContext2D, left: number, right: number, baseY: number, apexY: number) {
  ctx.beginPath()
  ctx.moveTo(left, baseY)
  if (right - left >= MIN_CARET_WIDTH) {
    ctx.lineTo((left + right) / 2, apexY)
  }
  ctx.lineTo(right, baseY)
  ctx.stroke()
}

function drawArrow(ctx: CanvasRenderingContext2D, row: PartLayout, direction: number, color: string) {
  if (!direction) {
    return
  }
  const y = row.y + row.height / 2
  const x = direction > 0 ? row.x + row.width : row.x
  const tip = x + ARROW_LENGTH * direction
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(tip, y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + (ARROW_LENGTH / 2) * direction, y - ARROW_SIZE / 2)
  ctx.lineTo(x + (ARROW_LENGTH / 2) * direction, y + ARROW_SIZE / 2)
  ctx.lineTo(tip, y)
  ctx.closePath()
  ctx.fill()
}

function drawBox(ctx: CanvasRenderingContext2D, part: PartLayout, style: ModelStyle) {
  let { y, height } = part
  if (isUTR(part)) {
    y += ((1 - UTR_HEIGHT_FRACTION) / 2) * height
    height *= UTR_HEIGHT_FRACTION
  }
  const width = Math.max(1, part.width)
  ctx.fillStyle = style.fill(part)
  ctx.fillRect(part.x, y, width, height)
  const outline = style.outline(part)
  if (outline) {
    ctx.strokeStyle = outline
    ctx.lineWidth = 1
    ctx.strokeRect(part.x, y, width, height)
  }
}

export function drawRow(
  ctx: CanvasRenderingContext2D,
  row: PartLayout,
  style: ModelStyle,
  { reversed, canvasWidth, carets = DEFAULT_CARET_MODE }: DrawOptions,
) {
  if (offScreen(row.x - ARROW_LENGTH, row.width + 2 * ARROW_LENGTH, canvasWidth)) {
    return
  }
  const strand = Number(row.feature.get('strand') ?? 0)
  const direction = strand * (reversed ? -1 : 1)
  const stroke = style.stroke(row)
  if (!row.children.length) {
    drawBox(ctx, row, style)
  } else {
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1
    // carets run from the middle of the exons to the top of the row, or to
    // its bottom for the minus strand. Only the apex y changes, so both
    // directions draw the same paths at the same cost (measured: ~0.80 ms per
    // draw of a 53-transcript gene either way; see plugin/README.md)
    const baseY = row.y + row.height / 2
    const apexY = carets === 'strand' && strand < 0 ? row.y + row.height : row.y
    for (const g of intronGaps(row.children)) {
      if (!offScreen(g.left, g.right - g.left, canvasWidth)) {
        drawCaret(ctx, g.left, g.right, baseY, apexY)
      }
    }
    for (const part of row.children) {
      if (!offScreen(part.x, part.width, canvasWidth)) {
        drawBox(ctx, part, style)
      }
    }
  }
  drawArrow(ctx, row, direction, stroke)
}

export function drawModel(
  ctx: CanvasRenderingContext2D,
  layout: PartLayout,
  style: ModelStyle,
  opts: DrawOptions,
) {
  for (const row of rowsOf(layout)) {
    drawRow(ctx, row, style, opts)
  }
}
