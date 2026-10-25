import Plugin from '@jbrowse/core/Plugin'

import { version } from './version'

import type PluginManager from '@jbrowse/core/PluginManager'

export default class InterMinePlugin extends Plugin {
  name = 'InterMinePlugin'
  version = version

  install(_pluginManager: PluginManager) {}
}
