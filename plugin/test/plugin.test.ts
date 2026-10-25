import { readConfObject } from '@jbrowse/core/configuration'
import PluginManager from '@jbrowse/core/PluginManager'
import { describe, expect, it } from 'vitest'

import InterMinePlugin from '../src'
import { version } from '../src/version'

describe('InterMinePlugin', () => {
  it('has a name and the package version', () => {
    const plugin = new InterMinePlugin()
    expect(plugin.name).toBe('InterMinePlugin')
    expect(plugin.version).toBe(version)
  })

  it('registers its adapters with a real PluginManager', () => {
    const pm = new PluginManager([new InterMinePlugin()]).createPluggableElements()
    pm.configure()
    for (const name of ['InterMineFeatureAdapter', 'InterMineSequenceAdapter']) {
      const t = pm.getAdapterType(name)
      expect(t, name).toBeDefined()
      expect(t!.adapterMetadata?.category).toBe('InterMine')
    }
    expect(pm.getTextSearchAdapterType('InterMineTextSearchAdapter')).toBeDefined()
  })

  it('accepts the documented feature adapter config', () => {
    const pm = new PluginManager([new InterMinePlugin()]).createPluggableElements()
    pm.configure()
    const feat = pm.getAdapterType('InterMineFeatureAdapter')!
    const conf = feat.configSchema.create({
      type: 'InterMineFeatureAdapter',
      baseUrl: 'https://x/service/jbrowse/9606',
      intermineClass: 'Transcript',
      nestExons: true,
    })
    expect(readConfObject(conf, 'intermineClass')).toBe('Transcript')
    expect(readConfObject(conf, 'nestExons')).toBe(true)
    expect(readConfObject(conf, 'exonType')).toBe('Exon')
  })
})
