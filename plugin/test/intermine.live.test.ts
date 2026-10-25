// Calls the real HumanMine (and, for gene models, FlyMine) services. Skipped
// (with a reason) when HumanMine is unreachable.
import { firstValueFrom } from 'rxjs'
import { toArray } from 'rxjs/operators'
import { beforeAll, describe, expect, it } from 'vitest'

import InterMineFeatureAdapter from '../src/InterMineFeatureAdapter/InterMineFeatureAdapter'
import featureSchema from '../src/InterMineFeatureAdapter/configSchema'
import InterMineGeneModelAdapter from '../src/InterMineGeneModelAdapter/InterMineGeneModelAdapter'
import geneModelSchema from '../src/InterMineGeneModelAdapter/configSchema'
import InterMineSequenceAdapter from '../src/InterMineSequenceAdapter/InterMineSequenceAdapter'
import sequenceSchema from '../src/InterMineSequenceAdapter/configSchema'
import InterMineTextSearchAdapter from '../src/InterMineTextSearchAdapter/InterMineTextSearchAdapter'
import searchSchema from '../src/InterMineTextSearchAdapter/configSchema'
import { nameHitToInterbase, fetchNames } from '../src/intermine/client'

const BASE = process.env.INTERMINE_BASE || 'https://www.humanmine.org/humanmine/service/jbrowse/9606'
const FLY_BASE = 'https://www.flymine.org/flymine/service/jbrowse/7227'
let reachable = false

beforeAll(async () => {
  try {
    reachable = (await fetch(`${BASE.replace(/\/9606$/, '')}/config/9606/seq/refSeqs.json`)).ok
  } catch {
    reachable = false
  }
  if (!reachable) {
    console.warn(`[live] ${BASE} unreachable; live tests skipped`)
  }
})

const region = { assemblyName: 'a', refName: '11', start: 31780000, end: 31830000 }

describe('live HumanMine', () => {
  it('finds PAX6 as a gene on the minus strand', async (ctx) => {
    if (!reachable) return ctx.skip()
    const a = new InterMineFeatureAdapter(
      featureSchema.create({ type: 'InterMineFeatureAdapter', baseUrl: BASE, intermineClass: 'Gene' }),
    )
    const feats = await firstValueFrom(a.getFeatures(region).pipe(toArray()))
    const pax6 = feats.find(f => f.get('symbol') === 'PAX6')!
    expect(pax6.get('strand')).toBe(-1)
    expect(pax6.get('start')).toBe(31789025)
    expect(pax6.get('end')).toBe(31817961)
  })

  it('nests exons under PAX6 transcripts', async (ctx) => {
    if (!reachable) return ctx.skip()
    const a = new InterMineFeatureAdapter(
      featureSchema.create({
        type: 'InterMineFeatureAdapter', baseUrl: BASE, intermineClass: 'Transcript', nestExons: true,
      }),
    )
    const feats = await firstValueFrom(a.getFeatures(region).pipe(toArray()))
    const withExons = feats.filter(f => f.get('subfeatures')?.length)
    expect(withExons.length).toBeGreaterThan(5)
  })

  it('returns the reference sequence for the first bases of PAX6', async (ctx) => {
    if (!reachable) return ctx.skip()
    const a = new InterMineSequenceAdapter(
      sequenceSchema.create({ type: 'InterMineSequenceAdapter', baseUrl: BASE }),
    )
    expect(await a.getSequence({ refName: '11', start: 31789025, end: 31789045 })).toBe('TTTAAAACTCTTGCAAGCAC')
    expect(await a.getSequence({ refName: '11', start: 0, end: 10 })).toBe('NNNNNNNNNN')
  })

  it('name search lands on the same start as the features endpoint', async (ctx) => {
    if (!reachable) return ctx.skip()
    const hits = await fetchNames(BASE, 'equals', 'PAX6')
    const gene = hits.find(h => h.location.objectName === '5080')!
    expect(nameHitToInterbase(gene).start).toBe(31789025)

    const s = new InterMineTextSearchAdapter(
      searchSchema.create({ type: 'InterMineTextSearchAdapter', baseUrl: BASE }),
    )
    const [first] = await s.searchIndex({ queryString: 'PAX6', searchType: 'exact' })
    expect(first!.getLocation()).toBe('11:31789026-31817961')
  })
})

describe('live gene models', () => {
  const models = (baseUrl: string, conf: Record<string, unknown>, r: typeof region) =>
    firstValueFrom(
      new InterMineGeneModelAdapter(
        geneModelSchema.create({ type: 'InterMineGeneModelAdapter', baseUrl, ...conf }),
      ).getFeatures(r).pipe(toArray()),
    )

  it('HumanMine: PAX6 with its transcripts and their exons', async (ctx) => {
    if (!reachable) return ctx.skip()
    const genes = await models(BASE, {}, region)
    const pax6 = genes.find(g => g.get('symbol') === 'PAX6')!
    expect(pax6.get('start')).toBe(31789025)
    const txs = pax6.get('subfeatures')!
    expect(txs.length).toBeGreaterThan(20)
    for (const t of txs) {
      const exons = t.get('subfeatures')!.filter(x => x.get('type') === 'exon')
      expect(exons.length).toBeGreaterThan(0)
      expect(Math.min(...exons.map(x => x.get('start')))).toBe(t.get('start'))
      expect(Math.max(...exons.map(x => x.get('end')))).toBe(t.get('end'))
    }
  })

  it('FlyMine: RapGAP1 transcripts are coding, CDS within exons', async (ctx) => {
    if (!reachable) return ctx.skip()
    const flyRegion = { assemblyName: 'f', refName: '2L', start: 7497600, end: 7501800 }
    const rapgap1 = (await models(FLY_BASE, {}, flyRegion)).find(g => g.get('name') === 'RapGAP1')!
    expect(rapgap1.get('strand')).toBe(-1)
    for (const t of rapgap1.get('subfeatures')!) {
      const subs = t.get('subfeatures')!
      const exons = subs.filter(x => x.get('type') === 'exon')
      const cds = subs.filter(x => x.get('type') === 'CDS')
      expect(t.get('type')).toBe('mRNA')
      expect(cds.length).toBeGreaterThan(0)
      for (const c of cds) {
        expect(exons.some(e => e.get('start') <= c.get('start') && c.get('end') <= e.get('end'))).toBe(true)
      }
    }
    const mrnas = await models(FLY_BASE, { intermineClass: 'MRNA', level: 'transcript' }, flyRegion)
    expect(mrnas.map(m => m.get('name')).sort()).toEqual(rapgap1.get('subfeatures')!.map(t => t.get('name')).sort())
  })
})
