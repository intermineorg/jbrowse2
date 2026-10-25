import { describe, expect, it } from 'vitest'

import {
  buildModels,
  cdsQuery,
  codingSegments,
  objectReportUrl,
  structureQuery,
} from '../src/intermine/geneModels'
import { fixture, ROOT } from './helpers'

import type { ModelQueryArgs } from '../src/intermine/geneModels'
import type { InterMineFeatureData, RawQueryResults } from '../src/intermine/types'

const FLY = 'https://www.flymine.org/flymine'
const geneArgs: ModelQueryArgs = {
  intermineClass: 'Gene',
  level: 'gene',
  refName: '11',
  start: 31800000,
  end: 31801000,
  taxon: '9606',
}
const q = (name: string) => fixture<RawQueryResults>(`${name}.json`)
const empty: RawQueryResults = { results: [] }
const spans = (fs: InterMineFeatureData[] | undefined, type: string) =>
  (fs ?? []).filter(f => f.type === type).map(f => [f.start, f.end])

describe('model queries', () => {
  it('select genes overlapping the region (1-based) with transcripts and exons, outer-joined', () => {
    const xml = structureQuery(geneArgs)
    expect(xml).toContain(
      'view="Gene.id Gene.primaryIdentifier Gene.symbol Gene.name Gene.chromosomeLocation.start Gene.chromosomeLocation.end Gene.chromosomeLocation.strand ' +
        'Gene.transcripts.id Gene.transcripts.primaryIdentifier Gene.transcripts.symbol Gene.transcripts.name Gene.transcripts.chromosomeLocation.start Gene.transcripts.chromosomeLocation.end ' +
        'Gene.transcripts.exons.chromosomeLocation.start Gene.transcripts.exons.chromosomeLocation.end"',
    )
    expect(xml).toContain('<join path="Gene.transcripts" style="OUTER"/><join path="Gene.transcripts.exons" style="OUTER"/>')
    expect(xml).toContain('<constraint path="Gene.chromosomeLocation" op="OVERLAPS"><value>11:31800001..31801000</value></constraint>')
    expect(xml).toContain('<constraint path="Gene.organism.taxonId" op="=" value="9606"/>')
  })

  it('transcript level reads exons straight off the class', () => {
    const xml = structureQuery({ ...geneArgs, intermineClass: 'MRNA', level: 'transcript' })
    expect(xml).toContain('MRNA.exons.chromosomeLocation.start')
    expect(xml).not.toContain('transcripts')
    expect(cdsQuery({ ...geneArgs, intermineClass: 'MRNA', level: 'transcript' })).toContain(
      'view="MRNA.id MRNA.CDSs.chromosomeLocation.start MRNA.CDSs.chromosomeLocation.end"',
    )
  })

  it('CDS query is an inner join on the transcripts of the same genes', () => {
    const xml = cdsQuery(geneArgs)
    expect(xml).toContain('view="Gene.transcripts.id Gene.transcripts.CDSs.chromosomeLocation.start Gene.transcripts.CDSs.chromosomeLocation.end"')
    expect(xml).not.toContain('<join')
  })

  it('escapes values', () => {
    expect(structureQuery({ ...geneArgs, refName: 'a<b', taxon: '1"2' })).toContain('<value>a&lt;b:31800001..31801000</value>')
  })
})

describe('codingSegments', () => {
  const exons = [{ start: 0, end: 10 }, { start: 20, end: 30 }, { start: 40, end: 50 }]
  it('clips one start-to-stop span to the exons', () => {
    expect(codingSegments(exons, [{ start: 5, end: 45 }])).toEqual([
      { start: 5, end: 10 }, { start: 20, end: 30 }, { start: 40, end: 45 },
    ])
  })
  it('handles one CDS row per exon, and duplicates', () => {
    const per = [{ start: 22, end: 30 }, { start: 40, end: 44 }, { start: 40, end: 44 }]
    expect(codingSegments(exons, per)).toEqual([{ start: 22, end: 30 }, { start: 40, end: 44 }])
  })
  it('is empty without CDS', () => {
    expect(codingSegments(exons, [])).toEqual([])
  })
})

describe('buildModels: HumanMine PAX6 (no CDS data)', () => {
  const [pax6, ...others] = buildModels(q('models-pax6-structure'), q('models-pax6-cds'), {
    intermineClass: 'Gene',
    level: 'gene',
    refName: '11',
    mineRoot: ROOT,
  })

  it('one gene, interbase, labelled by symbol, linked by object id', () => {
    expect(others).toHaveLength(0)
    expect(pax6).toMatchObject({
      uniqueId: 'Gene:5080',
      refName: '11',
      start: 31789025,
      end: 31817961,
      strand: -1,
      type: 'gene',
      name: 'PAX6',
      symbol: 'PAX6',
      description: 'paired box 6',
      intermineId: '5080',
      intermineClass: 'Gene',
      intermineUrl: `${ROOT}/report/Gene/1234788`,
    })
  })

  it('every transcript, each with its exons sorted and none with CDS', () => {
    const txs = pax6!.subfeatures!
    expect(txs).toHaveLength(53)
    expect(txs.every(t => t.type === 'transcript' && t.strand === -1)).toBe(true)
    const t = txs.find(x => x.intermineId === 'NR_160917.2')!
    expect(t).toMatchObject({
      uniqueId: 'Gene:5080:Transcript:NR_160917.2',
      name: 'NR_160917.2',
      description: 'paired box 6, transcript variant 53',
      intermineClass: 'Transcript',
      intermineUrl: `${ROOT}/report/Transcript/48602355`,
      start: 31789025,
      end: 31817961,
    })
    const ex = spans(t.subfeatures, 'exon')
    expect(ex.length).toBeGreaterThan(5)
    expect(ex).toContainEqual([31817808, 31817961])
    expect(ex).toEqual([...ex].sort((a, b) => a[0]! - b[0]!))
    expect(spans(t.subfeatures, 'CDS')).toEqual([])
    // the exons span the transcript
    expect(ex[0]![0]).toBe(t.start)
    expect(ex.at(-1)![1]).toBe(t.end)
  })
})

describe('buildModels: FlyMine RapGAP1 (exons shared between transcripts, one CDS span each)', () => {
  const genes = buildModels(q('models-rapgap1-structure'), q('models-rapgap1-cds'), {
    intermineClass: 'Gene',
    level: 'gene',
    refName: '2L',
    mineRoot: FLY,
  })
  const rf = genes[0]!.subfeatures!.find(t => t.name === 'RapGAP1-RF')!

  it('coding transcripts are mRNA with CDS clipped to their exons', () => {
    expect(genes.map(g => g.name)).toEqual(['RapGAP1'])
    expect(genes[0]!.subfeatures).toHaveLength(5)
    expect(rf.type).toBe('mRNA')
    expect(rf.intermineId).toBe('FBtr0334848')
    expect(spans(rf.subfeatures, 'exon')).toEqual([
      [7497804, 7499180], [7499265, 7499754], [7499812, 7501525], [7536274, 7536473], [7543982, 7544427],
    ])
    // CDS 7499025..7544056 (1-based)
    expect(spans(rf.subfeatures, 'CDS')).toEqual([
      [7499024, 7499180], [7499265, 7499754], [7499812, 7501525], [7536274, 7536473], [7543982, 7544056],
    ])
  })

  it('transcript level gives the same transcripts on their own', () => {
    const mrnas = buildModels(q('models-rapgap1-mrna-structure'), q('models-rapgap1-mrna-cds'), {
      intermineClass: 'MRNA',
      level: 'transcript',
      refName: '2L',
      mineRoot: FLY,
    })
    expect(mrnas).toHaveLength(5)
    const m = mrnas.find(x => x.name === 'RapGAP1-RF')!
    expect(m).toMatchObject({ uniqueId: 'MRNA:FBtr0334848', intermineClass: 'MRNA', type: 'mRNA', strand: -1 })
    expect(m.intermineUrl).toBe(`${FLY}/report/MRNA/2694656`)
    expect(spans(m.subfeatures, 'CDS')).toEqual(spans(rf.subfeatures, 'CDS'))
  })
})

describe('buildModels edge cases', () => {
  const opts = { intermineClass: 'Gene', level: 'gene' as const, refName: '1' }
  const gene = [7, 'G1', null, null, 101, 200, '1']

  it('keeps genes without transcripts and transcripts without exons, flat', () => {
    const [g] = buildModels({ results: [[...gene, null, null, null, null, null, null, null, null]] }, empty, opts)
    expect(g).toMatchObject({ uniqueId: 'Gene:G1', name: 'G1', start: 100, end: 200, strand: 1 })
    expect(g!.subfeatures).toBeUndefined()
    expect(g!.intermineUrl).toBeUndefined()
    const [h] = buildModels({ results: [[...gene, 8, 'T1', 'sym', 'sym', 101, 150, null, null]] }, empty, opts)
    expect(h!.subfeatures).toHaveLength(1)
    expect(h!.subfeatures![0]).toMatchObject({ name: 'sym', start: 100, end: 150, type: 'transcript' })
    expect(h!.subfeatures![0]!.description).toBeUndefined()
    expect(h!.subfeatures![0]!.subfeatures).toBeUndefined()
  })

  it('de-duplicates repeated exon rows', () => {
    const row = [...gene, 8, 'T1', null, null, 101, 200, 101, 120]
    const [g] = buildModels({ results: [row, row, [...gene, 8, 'T1', null, null, 101, 200, 181, 200]] }, empty, opts)
    expect(spans(g!.subfeatures![0]!.subfeatures, 'exon')).toEqual([[100, 120], [180, 200]])
  })

  it('object report urls', () => {
    expect(objectReportUrl(`${ROOT}/`, 'Gene', '1234788')).toBe(`${ROOT}/report/Gene/1234788`)
    expect(objectReportUrl(undefined, 'Gene', '1')).toBeUndefined()
  })
})
