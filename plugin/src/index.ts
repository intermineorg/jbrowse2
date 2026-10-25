import Plugin from '@jbrowse/core/Plugin'

import registerFeatureAdapter from './InterMineFeatureAdapter'
import registerGeneModelAdapter from './InterMineGeneModelAdapter'
import registerSequenceAdapter from './InterMineSequenceAdapter'
import registerTextSearchAdapter from './InterMineTextSearchAdapter'
import registerIntronHatGlyph from './IntronHatGlyph'
import { version } from './version'

import type PluginManager from '@jbrowse/core/PluginManager'

export default class InterMinePlugin extends Plugin {
  name = 'InterMinePlugin'
  version = version

  install(pluginManager: PluginManager) {
    registerFeatureAdapter(pluginManager)
    registerGeneModelAdapter(pluginManager)
    registerSequenceAdapter(pluginManager)
    registerTextSearchAdapter(pluginManager)
    registerIntronHatGlyph(pluginManager)
  }
}
