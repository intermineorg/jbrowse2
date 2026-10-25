// The e2e run uses the real config generator (../../config) against live
// HumanMine, so generator, plugin and JBrowse are exercised together.
import { generateConfig } from '../../config/lib.mjs'

export const MINE = 'https://www.humanmine.org/humanmine'
export const TAXON = '9606'
export const ASSEMBLY = 'humanmine-9606'
export const PLUGIN_FILE = 'jbrowse-plugin-intermine.umd.production.min.js'

export const e2eConfig = ({ mine = MINE, taxon = TAXON } = {}) =>
  generateConfig([{ mineRoot: mine, taxon }], { pluginUrl: PLUGIN_FILE })
