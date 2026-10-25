import { firstValueFrom } from 'rxjs'
import { toArray } from 'rxjs/operators'
import { afterEach, describe, expect, it, vi } from 'vitest'

import InterMineSequenceAdapter, {
  CHUNK_SIZE,
  chunkRegion,
} from '../src/InterMineSequenceAdapter/InterMineSequenceAdapter'
import configSchema from '../src/InterMineSequenceAdapter/configSchema'
import { BASE, mockMine } from './helpers'

afterEach(() => vi.unstubAllGlobals())

const make = () =>
  new InterMineSequenceAdapter(
    configSchema.create({ type: 'InterMineSequenceAdapter', baseUrl: BASE }),
  )

const region = (refName: string, start: number, end: number) => ({
  assemblyName: 'humanmine-9606',
  refName,
  start,
  end,
})

describe('chunkRegion', () => {
  it('splits into consecutive slices', () => {
    expect(chunkRegion(0, 250, 100)).toEqual([[0, 100], [100, 200], [200, 250]])
    expect(chunkRegion(5, 10, 100)).toEqual([[5, 10]])
    expect(chunkRegion(10, 10, 100)).toEqual([])
  })
})

describe('InterMineSequenceAdapter', () => {
  it('lists regions from refSeqs.json', async () => {
    mockMine()
    const regions = await make().getRegions({})
    expect(regions.find(r => r.refName === '1')).toEqual({
      refName: '1',
      start: 0,
      end: 248956422,
    })
  })

  it('fetches a short slice as one feature', async () => {
    const requested = mockMine({
      reference: url => ({
        features: [
          {
            start: Number(url.searchParams.get('start')),
            end: Number(url.searchParams.get('end')),
            seq: 'TTTAAAACTCTTGCAAGCAC',
          },
        ],
      }),
    })
    const feats = await firstValueFrom(
      make().getFeatures(region('11', 31789025, 31789045)).pipe(toArray()),
    )
    expect(requested).toContain(`${BASE}/features/11?start=31789025&end=31789045&reference=true`)
    expect(feats).toHaveLength(1)
    expect(feats[0]!.get('seq')).toBe('TTTAAAACTCTTGCAAGCAC')
    expect(feats[0]!.get('start')).toBe(31789025)
    expect(feats[0]!.get('refName')).toBe('11')
  })

  it('getSequence returns the sequence for a region', async () => {
    mockMine()
    const seq = await make().getSequence({ refName: '11', start: 31789025, end: 31789045 })
    expect(seq).toBe('TTTAAAACTCTTGCAAGCAC')
  })

  it('splits large requests into chunks', async () => {
    const requested = mockMine({
      reference: url => {
        const start = Number(url.searchParams.get('start'))
        const end = Number(url.searchParams.get('end'))
        return { features: [{ start, end, seq: 'A'.repeat(end - start) }] }
      },
    })
    const feats = await firstValueFrom(
      make().getFeatures(region('11', 0, CHUNK_SIZE * 2 + 5)).pipe(toArray()),
    )
    expect(requested.filter(u => u.includes('reference=true'))).toHaveLength(3)
    expect(feats.map(f => f.get('seq').length)).toEqual([CHUNK_SIZE, CHUNK_SIZE, 5])
    expect(feats.map(f => f.get('start'))).toEqual([0, CHUNK_SIZE, CHUNK_SIZE * 2])
  })

  it('clamps to the reference length', async () => {
    const requested = mockMine()
    await firstValueFrom(
      make().getFeatures(region('1', 248956400, 300000000)).pipe(toArray()),
    )
    expect(requested.filter(u => u.includes('reference=true'))).toEqual([
      `${BASE}/features/1?start=248956400&end=248956422&reference=true`,
    ])
  })

  it('completes empty for unknown references', async () => {
    mockMine()
    const feats = await firstValueFrom(
      make().getFeatures(region('nope', 0, 100)).pipe(toArray()),
    )
    expect(feats).toEqual([])
  })

  it('propagates server errors', async () => {
    mockMine({ reference: () => ({ features: [], wasSuccessful: false, error: 'bad' }) })
    await expect(
      firstValueFrom(make().getFeatures(region('11', 0, 10)).pipe(toArray())),
    ).rejects.toThrow('bad')
  })
})
