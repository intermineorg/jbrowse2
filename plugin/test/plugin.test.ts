import { describe, expect, it } from 'vitest'

import InterMinePlugin from '../src'
import { version } from '../src/version'

describe('InterMinePlugin', () => {
  it('has a name and the package version', () => {
    const plugin = new InterMinePlugin()
    expect(plugin.name).toBe('InterMinePlugin')
    expect(plugin.version).toBe(version)
  })
})
