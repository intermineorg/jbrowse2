// Loads the built plugin into a real jbrowse-web in headless Chromium, pointed at
// live HumanMine. Needs: `npm run build`, network access, and Chromium (E2E_CHROME)
// or Docker. Screenshots land in test-screenshots/.
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureJBrowseWeb, runBrowserCheck, startServer } from '../e2e/run.mjs'

type Report = {
  skipped?: string
  features?: { drawnCanvases: number; errors: string[]; failure?: string }
  sequence?: { sequenceText: boolean; errors: string[]; failure?: string }
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

describe('JBrowse 2 with the InterMine plugin (live HumanMine)', () => {
  it('draws gene and exon-nested transcript tracks with no page errors', ctx => {
    if (report.skipped) return ctx.skip()
    expect(report.features?.failure).toBeUndefined()
    expect(report.features!.drawnCanvases).toBeGreaterThanOrEqual(2)
    expect(report.features!.errors).toEqual([])
  })

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
})
