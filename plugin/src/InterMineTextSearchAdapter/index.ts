import TextSearchAdapterType from '@jbrowse/core/pluggableElementTypes/TextSearchAdapterType'

import AdapterClass from './InterMineTextSearchAdapter'
import configSchema from './configSchema'

import type PluginManager from '@jbrowse/core/PluginManager'

export default function register(pluginManager: PluginManager) {
  pluginManager.addTextSearchAdapterType(
    () =>
      new TextSearchAdapterType({
        name: 'InterMineTextSearchAdapter',
        displayName: 'InterMine text search adapter',
        description: 'Finds features by name using the mine\'s names endpoint',
        configSchema,
        AdapterClass,
      }),
  )
}

export { configSchema }
