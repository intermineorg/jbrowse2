import AdapterType from '@jbrowse/core/pluggableElementTypes/AdapterType'

import AdapterClass from './InterMineFeatureAdapter'
import configSchema from './configSchema'

import type PluginManager from '@jbrowse/core/PluginManager'

export default function register(pluginManager: PluginManager) {
  pluginManager.addAdapterType(
    () =>
      new AdapterType({
        name: 'InterMineFeatureAdapter',
        displayName: 'InterMine feature adapter',
        configSchema,
        adapterMetadata: {
          category: 'InterMine',
          description: 'Features of one InterMine class, read live from a mine',
        },
        AdapterClass,
      }),
  )
}

export { configSchema }
