import { ConfigurationSchema } from '@jbrowse/core/configuration'

/** Gene-name search over a mine's `names/<taxon>` endpoint. */
export default ConfigurationSchema(
  'InterMineTextSearchAdapter',
  {
    baseUrl: {
      type: 'string',
      description:
        'Feature endpoint, `<mine root>/service/jbrowse/<taxon>`, as in the mine\'s trackList.json',
      defaultValue: '',
    },
    trackIdPrefix: {
      type: 'string',
      description:
        'Prefix that turns an InterMine class into a track id (`humanmine-9606-` gives `humanmine-9606-Gene`), so a result can open its track. Leave empty to open only the location',
      defaultValue: '',
    },
    preferredClass: {
      type: 'string',
      description: 'Class whose track is opened when a hit lists several',
      defaultValue: 'Gene',
    },
  },
  { explicitlyTyped: true },
)
