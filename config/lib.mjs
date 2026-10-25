// Turns a mine's JBrowse 1 track list into a JBrowse 2 config for
// jbrowse-plugin-intermine. No dependencies; `fetch` is injectable for tests.

export const DEFAULT_PLUGIN_URL = 'jbrowse-plugin-intermine.umd.production.min.js'
export const PLUGIN_NAME = 'InterMine'

/** Catch-all class that spans every other feature; huge, so off by default. */
export const DEFAULT_EXCLUDE = ['SequenceFeature']
/** Classes drawn with their exons nested (see the plugin's `nestExons`). */
export const DEFAULT_NEST_EXONS = ['Transcript', 'MRNA']

const trim = s => s.replace(/\/+$/, '')

export function trackListUrl(mineRoot, taxon) {
  return `${trim(mineRoot)}/service/jbrowse/config/${encodeURIComponent(taxon)}/trackList.json`
}

/**
 * The stable assembly name: the server's own `dataset_id` ("Humanmine-9606")
 * lower-cased, falling back to `<last path segment of mine root>-<taxon>`.
 * The BlueGenes tool applies the same rule, so keep them in step.
 */
export function assemblyName(mineRoot, taxon, datasetId) {
  if (datasetId) return String(datasetId).toLowerCase()
  const mine = trim(mineRoot).split('/').pop()
  return `${mine}-${taxon}`.toLowerCase()
}

export async function fetchTrackList(mineRoot, taxon, fetchImpl = fetch) {
  const url = trackListUrl(mineRoot, taxon)
  const res = await fetchImpl(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res.json()
}

/**
 * One mine/taxon -> a config fragment: one assembly, its feature tracks and its
 * text search adapter.
 */
export function buildAssemblyConfig(trackList, mineRoot, taxon, opts = {}) {
  const {
    exclude = DEFAULT_EXCLUDE,
    include,
    nestExons = DEFAULT_NEST_EXONS,
  } = opts
  const assembly = assemblyName(mineRoot, taxon, trackList.dataset_id)
  const rest = (trackList.tracks ?? []).filter(t => /REST$/.test(t.storeClass ?? ''))

  const seqTrack = rest.find(t => t.query?.reference)
  if (!seqTrack) throw new Error(`No reference sequence track in track list for ${mineRoot} ${taxon}`)
  const baseUrl = trim(seqTrack.baseUrl)

  const tracks = []
  const seen = new Set()
  for (const t of rest) {
    const cls = t.query?.type
    if (!cls || seen.has(cls)) continue
    if (include ? !include.includes(cls) : exclude.includes(cls)) continue
    seen.add(cls)
    tracks.push({
      type: 'FeatureTrack',
      trackId: `${assembly}-${cls}`,
      name: t.key || cls,
      ...(t.category ? { category: [t.category] } : {}),
      assemblyNames: [assembly],
      adapter: {
        type: 'InterMineFeatureAdapter',
        baseUrl: trim(t.baseUrl || baseUrl),
        intermineClass: cls,
        ...(nestExons.includes(cls) ? { nestExons: true } : {}),
      },
    })
  }

  return {
    assemblies: [
      {
        name: assembly,
        displayName: trackList.dataset_id || assembly,
        sequence: {
          type: 'ReferenceSequenceTrack',
          trackId: `${assembly}-sequence`,
          adapter: { type: 'InterMineSequenceAdapter', baseUrl },
        },
      },
    ],
    tracks,
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

/** Merge fragments (and add the plugin) into one config serving every assembly. */
export function mergeConfigs(fragments, { pluginUrl = DEFAULT_PLUGIN_URL } = {}) {
  const config = {
    configuration: { disableAnalytics: true },
    plugins: [{ name: PLUGIN_NAME, url: pluginUrl }],
    assemblies: [],
    tracks: [],
    aggregateTextSearchAdapters: [],
  }
  const ids = new Set()
  const claim = (kind, id) => {
    if (ids.has(`${kind}:${id}`)) throw new Error(`Duplicate ${kind} "${id}" (two datasets map to the same assembly name)`)
    ids.add(`${kind}:${id}`)
  }
  for (const f of fragments) {
    for (const a of f.assemblies) claim('assembly', a.name)
    for (const t of f.tracks) claim('track', t.trackId)
    config.assemblies.push(...f.assemblies)
    config.tracks.push(...f.tracks)
    config.aggregateTextSearchAdapters.push(...f.aggregateTextSearchAdapters)
  }
  return config
}

/** datasets: [{ mineRoot, taxon }] */
export async function generateConfig(datasets, opts = {}) {
  const fetchImpl = opts.fetch ?? fetch
  const fragments = []
  for (const { mineRoot, taxon } of datasets) {
    const trackList = await fetchTrackList(mineRoot, taxon, fetchImpl)
    fragments.push(buildAssemblyConfig(trackList, mineRoot, taxon, opts))
  }
  return mergeConfigs(fragments, opts)
}
