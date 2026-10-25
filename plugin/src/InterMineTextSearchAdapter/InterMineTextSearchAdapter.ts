import { BaseAdapter } from '@jbrowse/core/data_adapters/BaseAdapter'
import BaseResult from '@jbrowse/core/TextSearch/BaseResults'

import { fetchNames, usableNameHits } from '../intermine/client'

import type { RawNameHit } from '../intermine/types'
import type {
  BaseTextSearchAdapter,
  BaseTextSearchArgs,
} from '@jbrowse/core/data_adapters/BaseAdapter'

export default class InterMineTextSearchAdapter
  extends BaseAdapter
  implements BaseTextSearchAdapter
{
  /**
   * The endpoint offers `startswith` and `equals` only, so `full` searches
   * behave as prefix searches.
   */
  async searchIndex(args: BaseTextSearchArgs) {
    const query = args.queryString.trim()
    if (!query) {
      return []
    }
    const baseUrl: string = this.getConf('baseUrl')
    const mode = args.searchType === 'exact' ? 'equals' : 'startswith'
    const hits = usableNameHits(await fetchNames(baseUrl, mode, query))
    const results = hits.map(h => this.toResult(h, query))
    results.sort((a, b) => b.getScore() - a.getScore())
    return args.limit ? results.slice(0, args.limit) : results
  }

  private toResult(hit: RawNameHit, query: string) {
    const { ref, start, end, tracks } = hit.location
    const exact = hit.name.toLowerCase() === query.toLowerCase()
    const prefix: string = this.getConf('trackIdPrefix')
    const preferred: string = this.getConf('preferredClass')
    const cls = tracks?.includes(preferred) ? preferred : tracks?.[0]
    return new BaseResult({
      label: hit.name,
      // The names endpoint reports 1-based starts, which is what a JBrowse
      // location string expects.
      locString: `${ref}:${start}-${end}`,
      displayString: `${hit.name} (${ref}:${start.toLocaleString('en')}-${end.toLocaleString('en')})`,
      matchedAttribute: 'name',
      matchedObject: hit,
      relevance: exact ? 'exact' : 'prefix',
      score: exact ? 2 : 1,
      ...(prefix && cls ? { trackId: `${prefix}${cls}` } : {}),
    })
  }

  freeResources() {}
}
