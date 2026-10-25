import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  exonTranscriptId,
  featuresUrl,
  fetchJson,
  mineRootFromBaseUrl,
  namesUrl,
  nameHitToInterbase,
  nestExons,
  parseStrand,
  referenceUrl,
  refSeqsUrl,
  regionStatsUrl,
  reportUrl,
  splitBaseUrl,
  toFeatureData,
  usableNameHits,
} from '../src/intermine/client'

import type {
  RawFeaturesResponse,
  RawNameHit,
} from '../src/intermine/types'

const fixture = <T>(name: string) =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8')) as T

const BASE = 'https://www.humanmine.org/humanmine/service/jbrowse/9606'
const ROOT = 'https://www.humanmine.org/humanmine'

describe('URL builders', () => {
  it('splits the base url into service base and taxon', () => {
    expect(splitBaseUrl(BASE)).toEqual({
      serviceBase: 'https://www.humanmine.org/humanmine/service/jbrowse',
      taxon: '9606',
    })
    expect(splitBaseUrl(`${BASE}/`).taxon).toBe('9606')
    expect(() => splitBaseUrl('nonsense/')).toThrow()
  })

  it('derives the mine root', () => {
    expect(mineRootFromBaseUrl(BASE)).toBe(ROOT)
  })

  it('builds the endpoints PLAN.md documents', () => {
    expect(refSeqsUrl(BASE)).toBe(`${ROOT}/service/jbrowse/config/9606/seq/refSeqs.json`)
    expect(featuresUrl(BASE, '11', 10, 20, 'Gene')).toBe(`${BASE}/features/11?start=10&end=20&type=Gene`)
    expect(referenceUrl(BASE, '11', 10, 20)).toBe(`${BASE}/features/11?start=10&end=20&reference=true`)
    expect(regionStatsUrl(BASE, '11', 10, 20)).toBe(`${BASE}/stats/region/11?start=10&end=20`)
    expect(regionStatsUrl(BASE, '11', 10, 20, 'Gene')).toBe(`${BASE}/stats/region/11?start=10&end=20&type=Gene`)
    expect(namesUrl(BASE, 'startswith', 'PAX 6')).toBe(`${ROOT}/service/jbrowse/names/9606?startswith=PAX%206`)
    expect(namesUrl(BASE, 'equals', 'PAX6')).toBe(`${ROOT}/service/jbrowse/names/9606?equals=PAX6`)
  })

  it('encodes reference names', () => {
    expect(featuresUrl(BASE, 'chr 1/a', 0, 1, 'Gene')).toContain('/features/chr%201%2Fa?')
  })
})

describe('fetchJson', () => {
  const respond = (body: unknown, status = 200) => async () =>
    new Response(JSON.stringify(body), { status })

  it('returns the parsed body', async () => {
    expect(await fetchJson('u', respond({ a: 1 }))).toEqual({ a: 1 })
  })

  it('throws on HTTP errors', async () => {
    await expect(fetchJson('u', respond({}, 500))).rejects.toThrow('HTTP 500')
  })

  it('throws when the service reports failure with a 200', async () => {
    await expect(
      fetchJson('u', respond({ wasSuccessful: false, error: 'boom' })),
    ).rejects.toThrow('boom')
  })

  it('accepts bare arrays (refSeqs, names)', async () => {
    expect(await fetchJson('u', respond([1, 2]))).toEqual([1, 2])
  })
})

describe('feature mapping', () => {
  it('maps strand strings to numbers', () => {
    expect(parseStrand('1')).toBe(1)
    expect(parseStrand('-1')).toBe(-1)
    expect(parseStrand(undefined)).toBe(0)
    expect(parseStrand(-1)).toBe(-1)
  })

  it('maps PAX6 from the live fixture', () => {
    const res = fixture<RawFeaturesResponse>('genes-pax6.json')
    const raw = res.features.find(f => f.symbol === 'PAX6')!
    const f = toFeatureData(raw, '11', 'Gene', ROOT)
    expect(f).toMatchObject({
      uniqueId: 'Gene:5080',
      refName: '11',
      start: 31789025,
      end: 31817961,
      strand: -1,
      type: 'gene',
      symbol: 'PAX6',
      name: 'paired box 6',
      intermineId: '5080',
      intermineUrl: `${ROOT}/report/Gene/5080`,
    })
  })

  it('links by report page for object ids and portal for identifiers', () => {
    expect(reportUrl(ROOT, 'Gene', '5080')).toBe(`${ROOT}/report/Gene/5080`)
    expect(reportUrl(ROOT, 'MRNA', 'NM_019040.5')).toBe(
      `${ROOT}/portal.do?class=MRNA&externalids=NM_019040.5`,
    )
    expect(reportUrl(ROOT, 'Exon', 'exon-NM_1.1-3')).toBeUndefined()
    expect(reportUrl(undefined, 'Gene', '1')).toBeUndefined()
  })
})

describe('exon nesting', () => {
  it('extracts the transcript id from exon ids', () => {
    expect(exonTranscriptId('exon-NM_019040.5-10')).toBe('NM_019040.5')
    expect(exonTranscriptId('exon-NR_160917.2-8')).toBe('NR_160917.2')
    expect(exonTranscriptId('exon-id-with-dash-1-2')).toBe('id-with-dash-1')
    expect(exonTranscriptId('NM_019040.5')).toBeUndefined()
  })

  it('nests exons under their transcripts, sorted by start', () => {
    const transcripts = fixture<RawFeaturesResponse>('transcripts-pax6.json').features.map(f =>
      toFeatureData(f, '11', 'Transcript', ROOT),
    )
    const exons = fixture<RawFeaturesResponse>('exons-pax6.json').features.map(f =>
      toFeatureData(f, '11', 'Exon', ROOT),
    )
    const nested = nestExons(transcripts, exons)
    expect(nested).toHaveLength(transcripts.length)

    const t = nested.find(x => x.intermineId === 'NR_160917.2')!
    expect(t.subfeatures!.length).toBeGreaterThan(1)
    const starts = t.subfeatures!.map(s => s.start)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
    for (const s of t.subfeatures!) {
      expect(s.type).toBe('exon')
      expect(exonTranscriptId(s.intermineId)).toBe('NR_160917.2')
      expect(s.start).toBeGreaterThanOrEqual(t.start)
      expect(s.end).toBeLessThanOrEqual(t.end)
    }
  })

  it('leaves transcripts without exons untouched and ignores orphans', () => {
    const tr = toFeatureData({ uniqueID: 'T1', start: 0, end: 10 }, '1', 'Transcript')
    const orphan = toFeatureData({ uniqueID: 'exon-X-1', start: 0, end: 5 }, '1', 'Exon')
    expect(nestExons([tr], [orphan])).toEqual([tr])
  })
})

describe('names', () => {
  const hits = fixture<RawNameHit[]>('names-pax6.json')

  it('drops exon rows', () => {
    const usable = usableNameHits(hits)
    expect(usable.map(h => h.location.objectName)).toEqual(['440034', '103157000', '5080'])
  })

  it('removes duplicate hits', () => {
    expect(usableNameHits([hits[2]!, hits[2]!])).toHaveLength(1)
  })

  it('converts the 1-based start to interbase', () => {
    const pax6 = hits.find(h => h.location.objectName === '5080')!
    expect(nameHitToInterbase(pax6)).toEqual({ refName: '11', start: 31789025, end: 31817961 })
  })

  it('names start agrees with the features start for the same gene', () => {
    const genes = fixture<RawFeaturesResponse>('genes-pax6.json')
    const gene = genes.features.find(f => f.uniqueID === '5080')!
    const pax6 = hits.find(h => h.location.objectName === '5080')!
    expect(nameHitToInterbase(pax6).start).toBe(gene.start)
  })
})
