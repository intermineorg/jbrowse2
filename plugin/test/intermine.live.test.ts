// Calls the real HumanMine service. Skipped (with a reason) when it is unreachable.
import { firstValueFrom } from 'rxjs'
import { toArray } from 'rxjs/operators'
import { beforeAll, describe, expect, it } from 'vitest'

import InterMineFeatureAdapter from '../src/InterMineFeatureAdapter/InterMineFeatureAdapter'
import featureSchema from '../src/InterMineFeatureAdapter/configSchema'
import InterMineSequenceAdapter from '../src/InterMineSequenceAdapter/InterMineSequenceAdapter'
import sequenceSchema from '../src/InterMineSequenceAdapter/configSchema'
import InterMineTextSearchAdapter from '../src/InterMineTextSearchAdapter/InterMineTextSearchAdapter'
import searchSchema from '../src/InterMineTextSearchAdapter/configSchema'
import { nameHitToInterbase, fetchNames } from '../src/intermine/client'

const BASE = process.env.INTERMINE_BASE || 'https://www.humanmine.org/humanmine/service/jbrowse/9606'
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
