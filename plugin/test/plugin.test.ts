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
    for (const name of ['InterMineFeatureAdapter', 'InterMineGeneModelAdapter', 'InterMineSequenceAdapter']) {
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

  it('accepts the documented gene model adapter config', () => {
    const pm = new PluginManager([new InterMinePlugin()]).createPluggableElements()
    pm.configure()
    const conf = pm.getAdapterType('InterMineGeneModelAdapter')!.configSchema.create({
      type: 'InterMineGeneModelAdapter',
      baseUrl: 'https://x/service/jbrowse/7227',
      intermineClass: 'MRNA',
      level: 'transcript',
    })
    expect(readConfObject(conf, 'intermineClass')).toBe('MRNA')
    expect(readConfObject(conf, 'level')).toBe('transcript')
    expect(readConfObject(conf, 'mineRoot')).toBe('')
    expect(readConfObject(conf, 'intronCarets')).toBe('strand')
  })

  it('text search config carries the slots JBrowse needs to select the adapter', () => {
    const pm = new PluginManager([new InterMinePlugin()]).createPluggableElements()
    pm.configure()
    const conf = pm.getTextSearchAdapterType('InterMineTextSearchAdapter')!.configSchema.create({
      type: 'InterMineTextSearchAdapter',
      textSearchAdapterId: 'humanmine-9606-names',
      assemblyNames: ['humanmine-9606'],
      baseUrl: 'https://x/service/jbrowse/9606',
    })
    // TextSearchManager selects adapters by readConfObject(conf, 'assemblyNames')
    expect(readConfObject(conf, 'assemblyNames')).toEqual(['humanmine-9606'])
    expect(readConfObject(conf, 'textSearchAdapterId')).toBe('humanmine-9606-names')
  })
})
