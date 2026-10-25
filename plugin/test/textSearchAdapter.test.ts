import { afterEach, describe, expect, it, vi } from 'vitest'

import InterMineTextSearchAdapter from '../src/InterMineTextSearchAdapter/InterMineTextSearchAdapter'
import configSchema from '../src/InterMineTextSearchAdapter/configSchema'
import { BASE, mockMine } from './helpers'

afterEach(() => vi.unstubAllGlobals())

const make = (conf: Record<string, unknown> = {}) =>
  new InterMineTextSearchAdapter(
    configSchema.create({
      type: 'InterMineTextSearchAdapter',
      baseUrl: BASE,
      ...conf,
    }),
  )

describe('InterMineTextSearchAdapter', () => {
  it('returns gene hits as 1-based location strings, exact match first', async () => {
    const requested = mockMine()
    const results = await make().searchIndex({ queryString: 'PAX6' })
    expect(requested[0]).toBe(
      'https://www.humanmine.org/humanmine/service/jbrowse/names/9606?startswith=PAX6',
    )
    expect(results.map(r => r.getLabel())).toEqual(['PAX6', 'PAX6-AS1', 'PAX6 upstream antisense RNA'])
    expect(results[0]!.getLocation()).toBe('11:31789026-31817961')
    expect(results[0]!.relevance).toBe('exact')
    expect(results[1]!.relevance).toBe('prefix')
    expect(results[0]!.getDisplayString()).toBe('PAX6 (11:31,789,026-31,817,961)')
  })

  it('uses the equals endpoint for exact searches', async () => {
    const requested = mockMine()
    await make().searchIndex({ queryString: 'PAX6', searchType: 'exact' })
    expect(requested[0]).toContain('?equals=PAX6')
  })

  it('opens the gene track when a track prefix is configured', async () => {
    mockMine()
    const [pax6] = await make({ trackIdPrefix: 'humanmine-9606-' }).searchIndex({
      queryString: 'PAX6',
    })
    expect(pax6!.getTrackId()).toBe('humanmine-9606-Gene')
  })

  it('opens no track without a prefix', async () => {
    mockMine()
    const [pax6] = await make().searchIndex({ queryString: 'PAX6' })
    expect(pax6!.getTrackId()).toBeUndefined()
  })

  it('honours limit', async () => {
    mockMine()
    expect(await make().searchIndex({ queryString: 'PAX6', limit: 1 })).toHaveLength(1)
  })

  it('returns nothing for blank queries without calling the server', async () => {
    const requested = mockMine()
    expect(await make().searchIndex({ queryString: '  ' })).toEqual([])
    expect(requested).toHaveLength(0)
  })

  it('returns an empty list when nothing matches', async () => {
    mockMine({ names: () => [] })
    expect(await make().searchIndex({ queryString: 'zzzz' })).toEqual([])
  })
})
