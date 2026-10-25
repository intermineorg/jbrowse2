// Loads the built plugin into a real jbrowse-web in headless Chromium, pointed at
// live HumanMine and FlyMine. Needs: `npm run build`, network access, and Chromium (E2E_CHROME)
// or Docker. Screenshots land in test-screenshots/.
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureJBrowseWeb, runBrowserCheck, startServer } from '../e2e/run.mjs'

type Drawn = { drawnCanvases: number; errors: string[]; failure?: string }
type Report = {
  skipped?: string
  features?: Drawn
  'models-human'?: Drawn
  'models-fly'?: Drawn
  'models-detail'?: Drawn
  sequence?: { sequenceText: boolean; errors: string[]; failure?: string }
  tool?: { drawnCanvases: number; location: string; errors: string[]; failure?: string }
  search?: { location: string; errors: string[]; failure?: string }
}

let report: Report
let server: { close: () => void } | undefined

beforeAll(async () => {
  const webDir = await ensureJBrowseWeb()
  const started = await startServer(webDir)
  server = started.server
  report = await runBrowserCheck(started.port, join(__dirname, '..', 'test-screenshots'))
})

afterAll(() => server?.close())

describe('JBrowse 2 with the InterMine plugin (live HumanMine and FlyMine)', () => {
  it('draws gene and exon-nested transcript tracks with no page errors', ctx => {
    if (report.skipped) return ctx.skip()
    expect(report.features?.failure).toBeUndefined()
    expect(report.features!.drawnCanvases).toBeGreaterThanOrEqual(2)
    expect(report.features!.errors).toEqual([])
  })

  // screenshots models-*.png show the caret introns, CDS/UTR and 3' arrowheads
  for (const name of ['models-human', 'models-fly', 'models-detail'] as const) {
    it(`draws gene models with no page errors (${name})`, ctx => {
      if (report.skipped) return ctx.skip()
      const r = report[name]
      expect(r?.failure).toBeUndefined()
      expect(r!.drawnCanvases).toBeGreaterThanOrEqual(1)
      expect(r!.errors).toEqual([])
    })
  }

  it('shows the reference sequence at base-pair zoom', ctx => {
    if (report.skipped) return ctx.skip()
    expect(report.sequence?.failure).toBeUndefined()
    expect(report.sequence!.sequenceText).toBe(true)
    expect(report.sequence!.errors).toEqual([])
  })

  it('finds PAX6 by name in the location box', ctx => {
    if (report.skipped) return ctx.skip()
    expect(report.search?.failure).toBeUndefined()
    // JBrowse pads the hit, so check the view contains PAX6 (11:31,789,026-31,817,961) and is zoomed in on it
    const m = /^11:([\d,]+)\.\.([\d,]+)$/.exec(report.search!.location)
    expect(m, report.search!.location).not.toBeNull()
    const [start, end] = [m![1]!, m![2]!].map(x => Number(x.replaceAll(',', '')))
    expect(start).toBeLessThanOrEqual(31789026)
    expect(end).toBeGreaterThanOrEqual(31817961)
    expect(end! - start!).toBeLessThan(100_000)
    expect(report.search!.errors).toEqual([])
  })

  it('opens the view the BlueGenes tool links to (assembly, loc and tracks from the URL)', ctx => {
    if (report.skipped) return ctx.skip()
    expect(report.tool?.failure).toBeUndefined()
    // requested 11:31786132..31820855 (PAX6 plus 10% flank); JBrowse snaps to whole pixels
    const m = /^11:([\d,]+)\.\.([\d,]+)$/.exec(report.tool!.location)
    expect(m, report.tool!.location).not.toBeNull()
    const [start, end] = [m![1]!, m![2]!].map(x => Number(x.replaceAll(',', '')))
    expect(Math.abs(start! - 31786132)).toBeLessThan(100)
    expect(Math.abs(end! - 31820855)).toBeLessThan(100)
    expect(report.tool!.drawnCanvases).toBeGreaterThanOrEqual(2)
    expect(report.tool!.errors).toEqual([])
  })
})
