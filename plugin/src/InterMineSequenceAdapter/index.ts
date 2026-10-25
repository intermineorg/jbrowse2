import AdapterType from '@jbrowse/core/pluggableElementTypes/AdapterType'

import AdapterClass from './InterMineSequenceAdapter'
import configSchema from './configSchema'

import type PluginManager from '@jbrowse/core/PluginManager'

export default function register(pluginManager: PluginManager) {
  pluginManager.addAdapterType(
    () =>
      new AdapterType({
        name: 'InterMineSequenceAdapter',
        displayName: 'InterMine sequence adapter',
        configSchema,
        adapterMetadata: {
          category: 'InterMine',
          description: 'Reference sequence read live from a mine',
        },
        AdapterClass,
      }),
  )
}

export { configSchema }
