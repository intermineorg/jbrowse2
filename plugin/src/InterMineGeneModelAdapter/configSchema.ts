import { ConfigurationSchema } from '@jbrowse/core/configuration'

import featureSchema from '../InterMineFeatureAdapter/configSchema'

/**
 * Gene models for one InterMine class: genes with transcripts, exons and CDS
 * (`level: gene`), or transcripts with exons and CDS (`level: transcript`).
 */
export default ConfigurationSchema(
  'InterMineGeneModelAdapter',
  {
    level: {
      type: 'string',
      description:
        '`gene`: the class has transcripts (InterMine `Gene.transcripts`); `transcript`: the class has exons directly',
      defaultValue: 'gene',
    },
  },
  { baseConfiguration: featureSchema, explicitlyTyped: true },
)
