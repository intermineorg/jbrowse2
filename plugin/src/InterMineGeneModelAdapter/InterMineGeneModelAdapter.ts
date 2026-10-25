import InterMineFeatureAdapter from '../InterMineFeatureAdapter/InterMineFeatureAdapter'
import { fetchQueryResults, splitBaseUrl } from '../intermine/client'
import { buildModels, cdsQuery, structureQuery } from '../intermine/geneModels'

import type { ModelLevel } from '../intermine/geneModels'
import type { InterMineFeatureData } from '../intermine/types'
import type { BaseOptions } from '@jbrowse/core/data_adapters/BaseAdapter'
import type { AugmentedRegion as Region } from '@jbrowse/core/util/types'

/**
 * Genes (or transcripts) with their full exon structure, read from the mine's
 * query service. Reference names and the server-side density count still come
 * from the REST store (`baseUrl`), as for the flat feature adapter.
 */
export default class InterMineGeneModelAdapter extends InterMineFeatureAdapter {
  protected async fetchRegion(region: Region, opts: BaseOptions): Promise<InterMineFeatureData[]> {
    const { refName, start, end } = region
    const { type: intermineClass, mineRoot } = this
    const level: ModelLevel = this.getConf('level')
    const { taxon } = splitBaseUrl(this.baseUrl)
    const args = { intermineClass, level, refName, start, end, taxon }
    const { signal } = opts
    const [structure, cds] = await Promise.all([
      fetchQueryResults(mineRoot, structureQuery(args), undefined, signal),
      fetchQueryResults(mineRoot, cdsQuery(args), undefined, signal),
    ])
    return buildModels(structure, cds, { intermineClass, level, refName, mineRoot })
  }
}
