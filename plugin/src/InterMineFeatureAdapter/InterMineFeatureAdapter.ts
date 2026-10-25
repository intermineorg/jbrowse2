import { BaseFeatureDataAdapter } from '@jbrowse/core/data_adapters/BaseAdapter'
import SimpleFeature from '@jbrowse/core/util/simpleFeature'
import { ObservableCreate } from '@jbrowse/core/util/rxjs'

import {
  fetchFeatures,
  fetchRefSeqs,
  fetchRegionStats,
  mineRootFromBaseUrl,
  nestExons,
  toFeatureData,
} from '../intermine/client'

import type { InterMineFeatureData } from '../intermine/types'
import type { BaseOptions } from '@jbrowse/core/data_adapters/BaseAdapter'
import type { Feature } from '@jbrowse/core/util/simpleFeature'
import type { AugmentedRegion as Region } from '@jbrowse/core/util/types'

/**
 * Exons are fetched over the span of the returned transcripts so a transcript
 * is never cached with only the exons that fall in the viewed region. Beyond
 * this span the request falls back to the viewed region.
 */
export const MAX_EXON_SPAN = 5_000_000

function toSimpleFeature(f: InterMineFeatureData): Feature {
  const { uniqueId, subfeatures, ...rest } = f
  return new SimpleFeature({
    id: uniqueId,
    data: { ...rest, uniqueId, ...(subfeatures ? { subfeatures } : {}) },
  })
}

export default class InterMineFeatureAdapter extends BaseFeatureDataAdapter {
  private refNames?: Promise<string[]>

  protected get baseUrl(): string {
    return this.getConf('baseUrl')
  }

  protected get type(): string {
    return this.getConf('intermineClass')
  }

  protected get mineRoot(): string {
    return this.getConf('mineRoot') || mineRootFromBaseUrl(this.baseUrl)
  }

  async getRefNames(opts?: BaseOptions) {
    if (!this.refNames) {
      this.refNames = fetchRefSeqs(this.baseUrl, undefined, opts?.signal)
        .then(r => r.map(x => x.name))
        .catch((e: unknown) => {
          this.refNames = undefined
          throw e
        })
    }
    return this.refNames
  }

  getFeatures(region: Region, opts: BaseOptions = {}) {
    return ObservableCreate<Feature>(async observer => {
      try {
        const features = await this.fetchRegion(region, opts)
        for (const f of features) {
          observer.next(toSimpleFeature(f))
        }
        observer.complete()
      } catch (e) {
        observer.error(e)
      }
    })
  }

  protected async fetchRegion(region: Region, opts: BaseOptions): Promise<InterMineFeatureData[]> {
    const { refName, start, end } = region
    const { baseUrl, type, mineRoot } = this
    const { signal } = opts

    const res = await fetchFeatures(baseUrl, refName, start, end, type, undefined, signal)
    const features = res.features.map(f => toFeatureData(f, refName, type, mineRoot))
    if (!this.getConf('nestExons') || features.length === 0) {
      return features
    }

    const lo = Math.min(...features.map(f => f.start))
    const hi = Math.max(...features.map(f => f.end))
    const [exonStart, exonEnd] = hi - lo <= MAX_EXON_SPAN ? [lo, hi] : [start, end]
    const exonType: string = this.getConf('exonType')
    const exonRes = await fetchFeatures(baseUrl, refName, exonStart, exonEnd, exonType, undefined, signal)
    const exons = exonRes.features.map(f => toFeatureData(f, refName, exonType, mineRoot))
    return nestExons(features, exons)
  }

  /**
   * Uses the server's own count for the region, so dense tracks show JBrowse's
   * "zoom in" prompt (as `region_feature_densities` did in JBrowse 1) without
   * downloading the features first. Falls back to sampling if stats fail.
   */
  async getRegionFeatureDensityStats(region: Region, opts?: BaseOptions) {
    const { refName, start, end } = region
    try {
      const s = await fetchRegionStats(this.baseUrl, refName, start, end, this.type, undefined, opts?.signal)
      return { featureDensity: s.featureCount / Math.max(1, end - start) }
    } catch {
      return super.getRegionFeatureDensityStats(region, opts)
    }
  }

  freeResources() {}
}
