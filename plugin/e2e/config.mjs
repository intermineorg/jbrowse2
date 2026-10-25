// The e2e run uses the real config generator (../../config) against live
// HumanMine and FlyMine, so generator, plugin and JBrowse are exercised together.
import { generateConfig } from '../../config/lib.mjs'

export const MINES = [
  { mineRoot: 'https://www.humanmine.org/humanmine', taxon: '9606' },
  { mineRoot: 'https://www.flymine.org/flymine', taxon: '7227' },
]
export const PLUGIN_FILE = 'jbrowse-plugin-intermine.umd.production.min.js'

export const e2eConfig = ({ datasets = MINES } = {}) =>
  generateConfig(datasets, { pluginUrl: PLUGIN_FILE })
