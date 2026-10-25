import { ConfigurationSchema } from '@jbrowse/core/configuration'

/** The reference sequence of one mine's genome, served by `features/<ref>?reference=true`. */
export default ConfigurationSchema(
  'InterMineSequenceAdapter',
  {
    baseUrl: {
      type: 'string',
      description:
        'Feature endpoint, `<mine root>/service/jbrowse/<taxon>`, as in the mine\'s trackList.json',
      defaultValue: '',
    },
  },
  { explicitlyTyped: true },
)
