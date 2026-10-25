import { firstValueFrom } from 'rxjs'
import { toArray } from 'rxjs/operators'
import { afterEach, describe, expect, it, vi } from 'vitest'

import InterMineGeneModelAdapter from '../src/InterMineGeneModelAdapter/InterMineGeneModelAdapter'
import configSchema from '../src/InterMineGeneModelAdapter/configSchema'
import { BASE, fixture, mockMine, ROOT } from './helpers'

afterEach(() => vi.unstubAllGlobals())

function make(conf: Record<string, unknown> = {}) {
  return new InterMineGeneModelAdapter(
    configSchema.create({ type: 'InterMineGeneModelAdapter', baseUrl: BASE, ...conf }),
  )
}

const region = { assemblyName: 'humanmine-9606', refName: '11', start: 31800000, end: 31801000 }
const collect = (a: InterMineGeneModelAdapter) => firstValueFrom(a.getFeatures(region).pipe(toArray()))

describe('InterMineGeneModelAdapter', () => {
  it('POSTs structure and CDS queries for the region and taxon to the query service', async () => {
    const requested = mockMine()
    await collect(make())
    const queries = requested.filter(u => u.startsWith(`${ROOT}/service/query/results `))
    expect(queries).toHaveLength(2)
    for (const q of queries) {
      expect(q).toContain('<value>11:31800001..31801000</value>')
      expect(q).toContain('<constraint path="Gene.organism.taxonId" op="=" value="9606"/>')
    }
    expect(queries.filter(q => q.includes('.CDSs.'))).toHaveLength(1)
  })

  it('emits genes with nested transcripts and exons as SimpleFeatures', async () => {
    mockMine()
    const [pax6, ...rest] = await collect(make())
    expect(rest).toHaveLength(0)
    expect(pax6!.id()).toBe('Gene:5080')
    expect(pax6!.get('name')).toBe('PAX6')
    expect(pax6!.get('intermineUrl')).toBe(`${ROOT}/report/Gene/1234788`)
    const txs = pax6!.get('subfeatures')!
    expect(txs).toHaveLength(53)
    const exon = txs[0]!.get('subfeatures')![0]!
    expect(exon.get('type')).toBe('exon')
    expect(exon.parent!()!.parent!()!.id()).toBe('Gene:5080')
  })

  it('transcript level queries the class itself', async () => {
    const requested = mockMine({
      'query:structure': () => fixture('models-rapgap1-mrna-structure.json'),
      'query:cds': () => fixture('models-rapgap1-mrna-cds.json'),
    })
    const feats = await collect(make({ intermineClass: 'MRNA', level: 'transcript' }))
    expect(requested.some(u => u.includes('view="MRNA.id MRNA.primaryIdentifier'))).toBe(true)
    expect(feats).toHaveLength(5)
    expect(feats[0]!.get('subfeatures')!.some(f => f.get('type') === 'CDS')).toBe(true)
  })

  it('keeps the REST store for ref names and density', async () => {
    const requested = mockMine()
    expect(await make().getRefNames()).toContain('11')
    await make().getRegionFeatureDensityStats(region)
    expect(requested.some(u => u.startsWith(`${BASE}/stats/region/11?`) && u.endsWith('type=Gene'))).toBe(true)
  })

  it('reports query service errors through the observable', async () => {
    mockMine({ 'query:cds': () => ({ results: [], wasSuccessful: false, error: 'bad query' }) })
    await expect(collect(make())).rejects.toThrow('bad query')
  })

  it('uses mineRoot from config for the query service', async () => {
    const requested = mockMine()
    await collect(make({ mineRoot: 'https://www.humanmine.org/humanmine/' })).catch(() => {})
    expect(requested.some(u => u.startsWith(`${ROOT}/service/query/results`))).toBe(true)
  })
})
