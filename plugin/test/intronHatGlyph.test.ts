import PluginManager from '@jbrowse/core/PluginManager'
import SimpleFeature from '@jbrowse/core/util/simpleFeature'
import { describe, expect, it } from 'vitest'

import InterMinePlugin from '../src'
import { matchesInterMineModel } from '../src/IntronHatGlyph'
import {
  ARROW_LENGTH,
  caretMode,
  drawModel,
  intronGaps,
  MIN_CARET_WIDTH,
  rowsOf,
  UTR_HEIGHT_FRACTION,
} from '../src/IntronHatGlyph/drawModel'

import type { ModelStyle, PartLayout } from '../src/IntronHatGlyph/drawModel'

/** Records canvas calls as compact strings. */
function recorder() {
  const calls: string[] = []
  const ctx = {
    set fillStyle(v: string) { calls.push(`fill=${v}`) },
    set strokeStyle(v: string) { calls.push(`stroke=${v}`) },
    lineWidth: 1,
    beginPath: () => calls.push('begin'),
    moveTo: (x: number, y: number) => calls.push(`M${x},${y}`),
    lineTo: (x: number, y: number) => calls.push(`L${x},${y}`),
    closePath: () => calls.push('close'),
    stroke: () => calls.push('S'),
    fill: () => calls.push('F'),
    fillRect: (x: number, y: number, w: number, h: number) => calls.push(`R${x},${y},${w},${h}`),
    strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`O${x},${y},${w},${h}`),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

const feat = (data: Record<string, unknown>) => ({ get: (k: string) => data[k] })
const part = (type: string, x: number, width: number, y = 10, height = 10): PartLayout => ({
  x, y, width, height, children: [], feature: feat({ type }),
})
const row = (strand: number, children: PartLayout[], x = 100, width = 200, y = 10): PartLayout => ({
  x, y, width, height: 10, children, feature: feat({ type: 'mRNA', strand }),
})
const style: ModelStyle = {
  fill: p => (String(p.feature.get('type')).includes('UTR') ? 'blue' : 'gold'),
  outline: () => undefined,
  stroke: () => 'grey',
}
const opts = { reversed: false, canvasWidth: 1000 }

describe('caret introns', () => {
  it('finds the gaps between parts, merging touching and overlapping parts', () => {
    const parts = [part('CDS', 150, 50), part('five_prime_UTR', 100, 20), part('CDS', 120, 10), part('three_prime_UTR', 200, 100)]
    expect(intronGaps(parts)).toEqual([{ left: 130, right: 150 }])
  })

  it('draws a caret per intron, rising from the middle of the row to its top', () => {
    const { ctx, calls } = recorder()
    drawModel(ctx, row(1, [part('exon', 100, 20), part('exon', 160, 40), part('exon', 280, 20)]), style, opts)
    const s = calls.join(' ')
    // intron 120..160: base at y=15 (middle), apex at y=10 (top) halfway
    expect(s).toContain('begin M120,15 L140,10 L160,15 S')
    expect(s).toContain('begin M200,15 L240,10 L280,15 S')
    // exons drawn after the introns, so carets never cover them
    expect(s.indexOf('R100,10,20,10')).toBeGreaterThan(s.indexOf('L160,15'))
  })

  it('minus-strand carets point down by default, or up when carets is up', () => {
    const minus = row(-1, [part('exon', 100, 20), part('exon', 160, 40)])
    const down = recorder()
    drawModel(down.ctx, minus, style, opts)
    // apex at the bottom of the row (y=20)
    expect(down.calls.join(' ')).toContain('begin M120,15 L140,20 L160,15 S')
    const up = recorder()
    drawModel(up.ctx, minus, style, { ...opts, carets: 'up' })
    expect(up.calls.join(' ')).toContain('begin M120,15 L140,10 L160,15 S')
    // plus strand always up; strand, not screen direction, decides
    const plus = recorder()
    drawModel(plus.ctx, row(1, [part('exon', 100, 20), part('exon', 160, 40)]), style, { ...opts, reversed: true })
    expect(plus.calls.join(' ')).toContain('begin M120,15 L140,10 L160,15 S')
    expect([caretMode('up'), caretMode('strand'), caretMode(undefined), caretMode('x')]).toEqual(['up', 'strand', 'strand', 'strand'])
  })

  it('narrow introns are a straight join, not a caret', () => {
    const { ctx, calls } = recorder()
    const gap = MIN_CARET_WIDTH - 1
    drawModel(ctx, row(1, [part('exon', 100, 20), part('exon', 120 + gap, 20)], 100, 40 + gap), style, opts)
    expect(calls.join(' ')).toContain(`begin M120,15 L${120 + gap},15 S`)
  })

  it('UTRs are thinner and centred; CDS full height', () => {
    const { ctx, calls } = recorder()
    drawModel(ctx, row(1, [part('five_prime_UTR', 100, 20), part('CDS', 120, 180)]), style, opts)
    const h = 10 * UTR_HEIGHT_FRACTION
    expect(calls).toContain(`R100,${10 + (10 - h) / 2},20,${h}`)
    expect(calls).toContain('R120,10,180,10')
    expect(calls[calls.indexOf(`R100,${10 + (10 - h) / 2},20,${h}`) - 1]).toBe('fill=blue')
  })

  it('arrowhead at the 3\' end: right for plus strand, left for minus, flipped when reversed', () => {
    const plus = recorder()
    drawModel(plus.ctx, row(1, [part('exon', 100, 200)]), style, opts)
    expect(plus.calls.join(' ')).toContain(`M300,15 L${300 + ARROW_LENGTH},15`)
    const minus = recorder()
    drawModel(minus.ctx, row(-1, [part('exon', 100, 200)]), style, opts)
    expect(minus.calls.join(' ')).toContain(`M100,15 L${100 - ARROW_LENGTH},15`)
    const rev = recorder()
    drawModel(rev.ctx, row(-1, [part('exon', 100, 200)]), style, { ...opts, reversed: true })
    expect(rev.calls.join(' ')).toContain(`M300,15 L${300 + ARROW_LENGTH},15`)
    const none = recorder()
    drawModel(none.ctx, row(0, [part('exon', 100, 200)]), style, opts)
    expect(none.calls.join(' ')).not.toContain('close')
  })

  it('a gene draws one row per transcript; a transcript without exons is a box', () => {
    const t1 = row(1, [part('exon', 100, 20), part('exon', 200, 20)], 100, 120, 10)
    const t2 = row(1, [], 100, 50, 30)
    const gene: PartLayout = { x: 100, y: 10, width: 120, height: 30, children: [t1, t2], feature: feat({ type: 'gene', strand: 1 }) }
    expect(rowsOf(gene)).toEqual([t1, t2])
    expect(rowsOf(t1)).toEqual([t1])
    const { ctx, calls } = recorder()
    drawModel(ctx, gene, style, opts)
    expect(calls).toContain('M120,15')
    expect(calls).toContain('R100,30,50,10')
  })

  it('skips rows that are off screen', () => {
    const { ctx, calls } = recorder()
    drawModel(ctx, row(1, [part('exon', 2000, 20)], 2000, 20), style, opts)
    expect(calls).toEqual([])
  })
})

describe('glyph registration', () => {
  it('matches InterMine features with structure only', () => {
    const structured = new SimpleFeature({
      id: 'g',
      data: { start: 0, end: 10, intermineClass: 'Gene', subfeatures: [{ uniqueId: 't', start: 0, end: 10 }] },
    })
    expect(matchesInterMineModel(structured)).toBe(true)
    expect(matchesInterMineModel(new SimpleFeature({ id: 'f', data: { start: 0, end: 10, intermineClass: 'Gene' } }))).toBe(false)
    const foreign = new SimpleFeature({ id: 'x', data: { start: 0, end: 10, subfeatures: [{ uniqueId: 'y', start: 0, end: 10 }] } })
    expect(matchesInterMineModel(foreign)).toBe(false)
  })

  it('is registered as a pluggable glyph', () => {
    const pm = new PluginManager([new InterMinePlugin()]).createPluggableElements()
    pm.configure()
    const g = pm.getGlyphType('InterMineIntronHat')
    expect(g).toBeDefined()
    expect(g!.priority).toBeGreaterThan(0)
  })
})
