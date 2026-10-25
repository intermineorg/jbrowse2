import { ConfigurationSchema } from '@jbrowse/core/configuration'

/**
 * One track's worth of InterMine features: a single InterMine class from one
 * mine's `service/jbrowse/<taxon>` endpoint.
 */
export default ConfigurationSchema(
  'InterMineFeatureAdapter',
  {
    baseUrl: {
      type: 'string',
      description:
        'Feature endpoint, `<mine root>/service/jbrowse/<taxon>`, as in the mine\'s trackList.json',
      defaultValue: '',
    },
    intermineClass: {
      type: 'string',
      description: 'InterMine class to query, e.g. Gene, Transcript, Exon',
      defaultValue: 'Gene',
    },
    mineRoot: {
      type: 'string',
      description:
        'Mine root, e.g. https://www.humanmine.org/humanmine. Derived from baseUrl when empty; used for links back to the mine',
      defaultValue: '',
    },
    nestExons: {
      type: 'boolean',
      description:
        'Fetch exons for the same region and nest them under the features, which must be transcripts',
      defaultValue: false,
    },
    exonType: {
      type: 'string',
      description: 'InterMine class used for exons when nestExons is on',
      defaultValue: 'Exon',
    },
  },
  { explicitlyTyped: true },
)
