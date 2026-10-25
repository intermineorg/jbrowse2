// Turns a mine's JBrowse 1 track list into a JBrowse 2 config for
// jbrowse-plugin-intermine. No dependencies; `fetch` is injectable for tests.

export const DEFAULT_PLUGIN_URL = 'jbrowse-plugin-intermine.umd.production.min.js'
export const PLUGIN_NAME = 'InterMine'

/** Catch-all class that spans every other feature; huge, so off by default. */
export const DEFAULT_EXCLUDE = ['SequenceFeature']
/**
 * Classes drawn as gene models (gene > transcripts > exons/CDS) and as
 * transcripts with exons/CDS, both read from the mine's query service by the
 * plugin's InterMineGeneModelAdapter. Other classes are flat boxes.
 */
export const DEFAULT_GENE_MODELS = ['Gene']
export const DEFAULT_NEST_EXONS = ['Transcript', 'MRNA']
/**
 * Intron carets on gene model tracks: `strand` (up on the plus strand, down
 * on the minus strand) or `up` (all up). Written into each model track's
 * adapter so it can be flipped in config.json without regenerating.
 */
export const INTRON_CARETS = ['strand', 'up']
export const DEFAULT_INTRON_CARETS = 'strand'
/** Initial height (px) of gene model and transcript tracks. */
export const MODEL_TRACK_HEIGHT = 300

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

function featureAdapter(baseUrl, intermineClass, { geneModels, nestExons, intronCarets }) {
  const level = geneModels.includes(intermineClass)
    ? 'gene'
    : nestExons.includes(intermineClass)
      ? 'transcript'
      : undefined
  return level
    ? { type: 'InterMineGeneModelAdapter', baseUrl, intermineClass, level, intronCarets }
    : { type: 'InterMineFeatureAdapter', baseUrl, intermineClass }
}

/**
 * One mine/taxon -> a config fragment: one assembly, its feature tracks and its
 * text search adapter.
 */
export function buildAssemblyConfig(trackList, mineRoot, taxon, opts = {}) {
  const {
    exclude = DEFAULT_EXCLUDE,
    include,
    geneModels = DEFAULT_GENE_MODELS,
    nestExons = DEFAULT_NEST_EXONS,
    intronCarets = DEFAULT_INTRON_CARETS,
  } = opts
  if (!INTRON_CARETS.includes(intronCarets)) {
    throw new Error(`intronCarets must be one of ${INTRON_CARETS.join(', ')}: ${intronCarets}`)
  }
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
    const trackId = `${assembly}-${cls}`
    const adapter = featureAdapter(trim(t.baseUrl || baseUrl), cls, { geneModels, nestExons, intronCarets })
    tracks.push({
      type: 'FeatureTrack',
      trackId,
      name: t.key || cls,
      ...(t.category ? { category: [t.category] } : {}),
      assemblyNames: [assembly],
      adapter,
      // a gene stacks all its transcripts; the default 100px shows only a few
      ...(adapter.level
        ? { displays: [{ type: 'LinearBasicDisplay', displayId: `${trackId}-LinearBasicDisplay`, height: MODEL_TRACK_HEIGHT }] }
        : {}),
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
