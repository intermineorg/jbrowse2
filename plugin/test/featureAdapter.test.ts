import { firstValueFrom } from 'rxjs'
import { toArray } from 'rxjs/operators'
import { afterEach, describe, expect, it, vi } from 'vitest'

import InterMineFeatureAdapter, {
  MAX_EXON_SPAN,
} from '../src/InterMineFeatureAdapter/InterMineFeatureAdapter'
import configSchema from '../src/InterMineFeatureAdapter/configSchema'
import { BASE, fixture, mockMine, ROOT } from './helpers'

import type { RawFeaturesResponse } from '../src/intermine/types'

afterEach(() => vi.unstubAllGlobals())

function make(conf: Record<string, unknown> = {}) {
  return new InterMineFeatureAdapter(
    configSchema.create({
      type: 'InterMineFeatureAdapter',
      baseUrl: BASE,
      ...conf,
    }),
  )
}

const region = { assemblyName: 'humanmine-9606', refName: '11', start: 31780000, end: 31830000 }
const collect = (a: InterMineFeatureAdapter, r = region) =>
  firstValueFrom(a.getFeatures(r).pipe(toArray()))

describe('InterMineFeatureAdapter', () => {
  it('reads ref names once from refSeqs.json', async () => {
    const requested = mockMine()
    const a = make()
    const names = await a.getRefNames()
    expect(names).toContain('11')
    expect(names).toContain('X')
    await a.getRefNames()
    expect(requested.filter(u => u.endsWith('refSeqs.json'))).toHaveLength(1)
  })

  it('retries ref names after a failure', async () => {
    mockMine({ refseqs: () => { throw new Error('x') } })
    const a = make()
    await expect(a.getRefNames()).rejects.toThrow()
    mockMine()
    expect(await a.getRefNames()).toContain('11')
  })

  it('emits SimpleFeatures with interbase coordinates and links', async () => {
    const requested = mockMine()
    const feats = await collect(make({ intermineClass: 'Gene' }))
    expect(requested).toContain(
      `${BASE}/features/11?start=31780000&end=31830000&type=Gene`,
    )
    expect(feats).toHaveLength(4)
    const pax6 = feats.find(f => f.get('symbol') === 'PAX6')!
    expect(pax6.id()).toBe('Gene:5080')
    expect(pax6.get('refName')).toBe('11')
    expect(pax6.get('start')).toBe(31789025)
    expect(pax6.get('end')).toBe(31817961)
    expect(pax6.get('strand')).toBe(-1)
    expect(pax6.get('type')).toBe('gene')
    expect(pax6.get('intermineUrl')).toBe(`${ROOT}/report/Gene/5080`)
  })

  it('uses mineRoot from config when given', async () => {
    mockMine()
    const feats = await collect(make({ mineRoot: 'https://example.org/m' }))
    expect(feats[0]!.get('intermineUrl')).toMatch(/^https:\/\/example\.org\/m\/report\/Gene\//)
  })

  it('does not nest by default', async () => {
    mockMine()
    const feats = await collect(make({ intermineClass: 'Transcript' }))
    expect(feats.every(f => !f.get('subfeatures'))).toBe(true)
  })

  it('nests exons under transcripts when nestExons is set', async () => {
    const requested = mockMine()
    const feats = await collect(make({ intermineClass: 'Transcript', nestExons: true }))
    const raw = fixture<RawFeaturesResponse>('transcripts-pax6.json').features
    const lo = Math.min(...raw.map(f => f.start))
    const hi = Math.max(...raw.map(f => f.end))
    expect(requested.some(u => u.includes(`start=${lo}&end=${hi}&type=Exon`))).toBe(true)

    const t = feats.find(f => f.id() === 'Transcript:NR_160917.2')!
    const subs = t.get('subfeatures')!
    expect(subs.length).toBeGreaterThan(1)
    expect(subs[0]!.get('type')).toBe('exon')
    expect(subs[0]!.get('strand')).toBe(-1)
    expect(subs[0]!.parent!()!.id()).toBe(t.id())
  })

  it('falls back to the viewed region for exons when transcripts span too much', async () => {
    const wide = fixture<RawFeaturesResponse>('transcripts-pax6.json')
    wide.features[0]!.end = wide.features[0]!.start + MAX_EXON_SPAN + 1
    const requested = mockMine({ 'type:Transcript': () => wide })
    await collect(make({ intermineClass: 'Transcript', nestExons: true }))
    expect(
      requested.some(u => u.includes(`start=${region.start}&end=${region.end}&type=Exon`)),
    ).toBe(true)
  })

  it('does not request exons when there are no transcripts', async () => {
    const requested = mockMine({ 'type:Transcript': () => ({ features: [] }) })
    expect(await collect(make({ intermineClass: 'Transcript', nestExons: true }))).toEqual([])
    expect(requested.some(u => u.includes('type=Exon'))).toBe(false)
  })

  it('reports service errors through the observable', async () => {
    mockMine({
      'type:Gene': () => ({ features: [], wasSuccessful: false, error: 'Service failed' }),
    })
    await expect(collect(make())).rejects.toThrow('Service failed')
  })

  it('derives feature density from stats/region', async () => {
    const requested = mockMine()
    const s = await make().getRegionFeatureDensityStats({
      assemblyName: 'a', refName: '11', start: 31000000, end: 32000000,
    })
    expect(s.featureDensity).toBeCloseTo(8 / 1_000_000)
    expect(requested[0]).toBe(`${BASE}/stats/region/11?start=31000000&end=32000000&type=Gene`)
  })

  it('falls back to sampling when stats fail', async () => {
    mockMine({ stats: () => { throw new Error('nope') } })
    const s = await make().getRegionFeatureDensityStats({
      assemblyName: 'a', refName: '11', start: 31780000, end: 31830000,
    })
    expect(typeof s.featureDensity).toBe('number')
  })
})
