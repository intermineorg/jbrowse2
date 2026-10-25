import AdapterType from '@jbrowse/core/pluggableElementTypes/AdapterType'

import AdapterClass from './InterMineGeneModelAdapter'
import configSchema from './configSchema'

import type PluginManager from '@jbrowse/core/PluginManager'

export default function register(pluginManager: PluginManager) {
  pluginManager.addAdapterType(
    () =>
      new AdapterType({
        name: 'InterMineGeneModelAdapter',
        displayName: 'InterMine gene model adapter',
        configSchema,
        adapterMetadata: {
          category: 'InterMine',
          description: 'Genes or transcripts with their exon structure, read live from a mine',
        },
        AdapterClass,
      }),
  )
}

export { configSchema }
