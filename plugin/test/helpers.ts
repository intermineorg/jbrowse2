import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { vi } from 'vitest'

export const BASE = 'https://www.humanmine.org/humanmine/service/jbrowse/9606'
export const ROOT = 'https://www.humanmine.org/humanmine'

export const fixtureText = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8')

export const fixture = <T>(name: string) => JSON.parse(fixtureText(name)) as T

type Handler = (url: URL) => unknown

/**
 * Stubs global fetch with a router over recorded HumanMine responses.
 * Returns the list of requested URLs.
 */
export function mockMine(overrides: Record<string, Handler> = {}) {
  const requested: string[] = []
  const routes: Record<string, Handler> = {
    refseqs: () => fixture('refSeqs.json'),
    'type:Gene': () => fixture('genes-pax6.json'),
    'type:Transcript': () => fixture('transcripts-pax6.json'),
    'type:Exon': () => fixture('exons-pax6.json'),
    reference: () => fixture('reference-pax6.json'),
    stats: () => fixture('stats-region-gene.json'),
    names: () => fixture('names-pax6.json'),
    ...overrides,
  }
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    requested.push(url.toString())
    const p = url.pathname
    let key: string | undefined
    if (p.endsWith('/seq/refSeqs.json')) {
      key = 'refseqs'
    } else if (p.includes('/stats/region/')) {
      key = 'stats'
    } else if (p.includes('/names/')) {
      key = 'names'
    } else if (url.searchParams.get('reference') === 'true') {
      key = 'reference'
    } else if (p.includes('/features/')) {
      key = `type:${url.searchParams.get('type')}`
    }
    const h = key ? routes[key] : undefined
    if (!h) {
      return new Response('not found', { status: 404 })
    }
    return new Response(JSON.stringify(h(url)), { status: 200 })
  })
  return requested
}
