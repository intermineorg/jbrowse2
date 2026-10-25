import { BaseSequenceAdapter } from '@jbrowse/core/data_adapters/BaseAdapter'
import SimpleFeature from '@jbrowse/core/util/simpleFeature'
import { ObservableCreate } from '@jbrowse/core/util/rxjs'

import { fetchRefSeqs, fetchSequence } from '../intermine/client'

import type { RawRefSeq } from '../intermine/types'
import type { BaseOptions } from '@jbrowse/core/data_adapters/BaseAdapter'
import type { Feature } from '@jbrowse/core/util/simpleFeature'
import type { AugmentedRegion as Region } from '@jbrowse/core/util/types'

/** Longest sequence slice requested from the server in one call. */
export const CHUNK_SIZE = 100_000
/** How many slices are in flight at once. */
const CONCURRENCY = 4

/** Split `[start, end)` into consecutive slices of at most `size`. */
export function chunkRegion(start: number, end: number, size = CHUNK_SIZE) {
  const chunks: [number, number][] = []
  for (let s = start; s < end; s += size) {
    chunks.push([s, Math.min(s + size, end)])
  }
  return chunks
}

export default class InterMineSequenceAdapter extends BaseSequenceAdapter {
  private refSeqs?: Promise<RawRefSeq[]>

  private get baseUrl(): string {
    return this.getConf('baseUrl')
  }

  private loadRefSeqs(opts?: BaseOptions) {
    if (!this.refSeqs) {
      this.refSeqs = fetchRefSeqs(this.baseUrl, undefined, opts?.signal).catch(
        (e: unknown) => {
          this.refSeqs = undefined
          throw e
        },
      )
    }
    return this.refSeqs
  }

  async getRefNames(opts?: BaseOptions) {
    return (await this.loadRefSeqs(opts)).map(r => r.name)
  }

  async getRegions(opts?: BaseOptions) {
    return (await this.loadRefSeqs(opts)).map(r => ({
      refName: r.name,
      start: r.start,
      end: r.end,
    }))
  }

  getFeatures(region: Region, opts: BaseOptions = {}) {
    return ObservableCreate<Feature>(async observer => {
      try {
        const refSeqs = await this.loadRefSeqs(opts)
        const ref = refSeqs.find(r => r.name === region.refName)
        if (!ref) {
          observer.complete()
          return
        }
        const start = Math.max(region.start, ref.start)
        const end = Math.min(region.end, ref.end)
        const chunks = chunkRegion(start, end)
        for (let i = 0; i < chunks.length; i += CONCURRENCY) {
          const batch = chunks.slice(i, i + CONCURRENCY)
          const results = await Promise.all(
            batch.map(([s, e]) =>
              fetchSequence(this.baseUrl, region.refName, s, e, undefined, opts.signal),
            ),
          )
          results.forEach((res, j) => {
            const [s, e] = batch[j]!
            const seq = res.features[0]?.seq
            if (seq !== undefined) {
              observer.next(
                new SimpleFeature({
                  id: `${region.refName}:${s}-${e}`,
                  data: { refName: region.refName, start: s, end: e, seq },
                }),
              )
            }
          })
        }
        observer.complete()
      } catch (e) {
        observer.error(e)
      }
    })
  }

  freeResources() {}
}
