// Hand-written JBrowse 2 config for the e2e run: one human assembly read live
// from HumanMine. (config/ generates the production equivalents.)
export const MINE = 'https://www.humanmine.org/humanmine'
export const TAXON = '9606'
export const ASSEMBLY = 'humanmine-9606'
export const PLUGIN_FILE = 'jbrowse-plugin-intermine.umd.production.min.js'

export function e2eConfig({ mine = MINE, taxon = TAXON, assembly = ASSEMBLY } = {}) {
  const baseUrl = `${mine}/service/jbrowse/${taxon}`
  const track = (cls, extra = {}) => ({
    type: 'FeatureTrack',
    trackId: `${assembly}-${cls}`,
    name: cls,
    assemblyNames: [assembly],
    adapter: { type: 'InterMineFeatureAdapter', baseUrl, intermineClass: cls, ...extra },
  })
  return {
    configuration: { disableAnalytics: true },
    plugins: [{ name: 'InterMine', url: PLUGIN_FILE }],
    assemblies: [
      {
        name: assembly,
        sequence: {
          type: 'ReferenceSequenceTrack',
          trackId: `${assembly}-sequence`,
          adapter: { type: 'InterMineSequenceAdapter', baseUrl },
        },
      },
    ],
    tracks: [track('Gene'), track('Transcript', { nestExons: true })],
    aggregateTextSearchAdapters: [
      {
        type: 'InterMineTextSearchAdapter',
        textSearchAdapterId: `${assembly}-names`,
        baseUrl,
        trackIdPrefix: `${assembly}-`,
        assemblyNames: [assembly],
      },
    ],
  }
}
