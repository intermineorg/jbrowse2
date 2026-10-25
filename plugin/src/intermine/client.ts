import type {
  Fetcher,
  InterMineFeatureData,
  RawFeature,
  RawFeaturesResponse,
  RawNameHit,
  RawRefSeq,
  RawRegionStats,
  RawSequenceResponse,
  ServiceEnvelope,
} from './types'

/**
 * `baseUrl` is `<mine root>/service/jbrowse/<taxon>`, exactly as it appears in a
 * mine's trackList.json. Everything else is derived from it.
 */
export function splitBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  if (i < 0 || i === trimmed.length - 1) {
    throw new Error(`Invalid InterMine baseUrl: ${baseUrl}`)
  }
  return { serviceBase: trimmed.slice(0, i), taxon: trimmed.slice(i + 1) }
}

/** `<mine root>/service/jbrowse/<taxon>` -> `<mine root>`. */
export function mineRootFromBaseUrl(baseUrl: string) {
  const { serviceBase } = splitBaseUrl(baseUrl)
  return serviceBase.replace(/\/service\/jbrowse$/, '')
}

function qs(params: Record<string, string | number | undefined>) {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) {
      parts.push(`${k}=${encodeURIComponent(String(v))}`)
    }
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

export function refSeqsUrl(baseUrl: string) {
  const { serviceBase, taxon } = splitBaseUrl(baseUrl)
  return `${serviceBase}/config/${encodeURIComponent(taxon)}/seq/refSeqs.json`
}

export function featuresUrl(
  baseUrl: string,
  refName: string,
  start: number,
  end: number,
  type: string,
) {
  const b = baseUrl.replace(/\/+$/, '')
  return `${b}/features/${encodeURIComponent(refName)}${qs({ start, end, type })}`
}

export function referenceUrl(
  baseUrl: string,
  refName: string,
  start: number,
  end: number,
) {
  const b = baseUrl.replace(/\/+$/, '')
  return `${b}/features/${encodeURIComponent(refName)}${qs({ start, end, reference: 'true' })}`
}

export function regionStatsUrl(
  baseUrl: string,
  refName: string,
  start: number,
  end: number,
  type?: string,
) {
  const b = baseUrl.replace(/\/+$/, '')
  return `${b}/stats/region/${encodeURIComponent(refName)}${qs({ start, end, type })}`
}

export function namesUrl(
  baseUrl: string,
  mode: 'startswith' | 'equals',
  query: string,
) {
  const { serviceBase, taxon } = splitBaseUrl(baseUrl)
  return `${serviceBase}/names/${encodeURIComponent(taxon)}${qs({ [mode]: query })}`
}

/** Fetch JSON and turn both HTTP failures and `wasSuccessful: false` into errors. */
export async function fetchJson<T>(
  url: string,
  fetcher: Fetcher = (u, i) => fetch(u, i),
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetcher(url, signal ? { signal } : undefined)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`)
  }
  const json = (await res.json()) as T
  const env = json as ServiceEnvelope
  if (env && !Array.isArray(json) && env.wasSuccessful === false) {
    throw new Error(`InterMine error for ${url}: ${env.error ?? 'unknown'}`)
  }
  return json
}

export const fetchRefSeqs = (
  baseUrl: string,
  fetcher?: Fetcher,
  signal?: AbortSignal,
) => fetchJson<RawRefSeq[]>(refSeqsUrl(baseUrl), fetcher, signal)

export const fetchFeatures = (
  baseUrl: string,
  refName: string,
  start: number,
  end: number,
  type: string,
  fetcher?: Fetcher,
  signal?: AbortSignal,
) =>
  fetchJson<RawFeaturesResponse>(
    featuresUrl(baseUrl, refName, start, end, type),
    fetcher,
    signal,
  )

export const fetchSequence = (
  baseUrl: string,
  refName: string,
  start: number,
  end: number,
  fetcher?: Fetcher,
  signal?: AbortSignal,
) =>
  fetchJson<RawSequenceResponse>(
    referenceUrl(baseUrl, refName, start, end),
    fetcher,
    signal,
  )

export const fetchRegionStats = (
  baseUrl: string,
  refName: string,
  start: number,
  end: number,
  type?: string,
  fetcher?: Fetcher,
  signal?: AbortSignal,
) =>
  fetchJson<RawRegionStats>(
    regionStatsUrl(baseUrl, refName, start, end, type),
    fetcher,
    signal,
  )

export const fetchNames = (
  baseUrl: string,
  mode: 'startswith' | 'equals',
  query: string,
  fetcher?: Fetcher,
  signal?: AbortSignal,
) => fetchJson<RawNameHit[]>(namesUrl(baseUrl, mode, query), fetcher, signal)

export function parseStrand(s: string | number | undefined): 1 | -1 | 0 {
  const n = typeof s === 'string' ? Number.parseInt(s, 10) : s
  return n === 1 ? 1 : n === -1 ? -1 : 0
}

/**
 * Link to the feature's page in the mine. Genes carry the InterMine object id
 * (`report/Gene/5080`); other classes carry a primary identifier, which the
 * classic portal resolves. Exons have no identifier of their own.
 */
export function reportUrl(
  mineRoot: string | undefined,
  intermineClass: string,
  id: string,
) {
  if (!mineRoot || id.startsWith('exon-')) {
    return undefined
  }
  const root = mineRoot.replace(/\/+$/, '')
  return /^\d+$/.test(id)
    ? `${root}/report/${encodeURIComponent(intermineClass)}/${id}`
    : `${root}/portal.do${qs({ class: intermineClass, externalids: id })}`
}

export function toFeatureData(
  raw: RawFeature,
  refName: string,
  intermineClass: string,
  mineRoot?: string,
): InterMineFeatureData {
  const id = String(raw.uniqueID)
  const data: InterMineFeatureData = {
    uniqueId: `${intermineClass}:${id}`,
    refName,
    start: raw.start,
    end: raw.end,
    strand: parseStrand(raw.strand),
    type: raw.type ?? intermineClass.toLowerCase(),
    intermineId: id,
    intermineClass,
  }
  if (raw.name) {
    data.name = raw.name
  }
  if (raw.symbol) {
    data.symbol = raw.symbol
  }
  const url = reportUrl(mineRoot, intermineClass, id)
  if (url) {
    data.intermineUrl = url
  }
  if (raw.subfeatures?.length) {
    data.subfeatures = raw.subfeatures.map(s =>
      toFeatureData(s, refName, intermineClass, mineRoot),
    )
  }
  return data
}

const EXON_ID = /^exon-(.+)-\d+$/

/** Transcript id encoded in an InterMine exon id (`exon-NM_019040.5-10`). */
export function exonTranscriptId(exonId: string) {
  return EXON_ID.exec(exonId)?.[1]
}

/**
 * The REST endpoint returns every feature flat. Exon ids embed the id of their
 * transcript, so exons are nested under the matching transcript here. Exons
 * whose transcript is not in `transcripts` are ignored.
 */
export function nestExons(
  transcripts: InterMineFeatureData[],
  exons: InterMineFeatureData[],
): InterMineFeatureData[] {
  const byTranscript = new Map<string, InterMineFeatureData[]>()
  for (const exon of exons) {
    const tid = exonTranscriptId(exon.intermineId)
    if (tid) {
      const list = byTranscript.get(tid)
      if (list) {
        list.push(exon)
      } else {
        byTranscript.set(tid, [exon])
      }
    }
  }
  return transcripts.map(t => {
    const list = byTranscript.get(t.intermineId)
    if (!list) {
      return t
    }
    const subfeatures = [...list]
      .sort((a, b) => a.start - b.start)
      .map(e => ({ ...e, type: 'exon' }))
    return { ...t, subfeatures }
  })
}

/** Names hits are 1-based on `start`; JBrowse 2 locations are interbase. */
export function nameHitToInterbase(hit: RawNameHit) {
  const { ref, start, end } = hit.location
  return { refName: ref, start: start - 1, end }
}

/**
 * Drop exon rows and repeated hits from a names response; the endpoint returns
 * one row per matching exon as well as per gene.
 */
export function usableNameHits(hits: RawNameHit[]) {
  const seen = new Set<string>()
  const out: RawNameHit[] = []
  for (const h of hits) {
    if (h.location.objectName.startsWith('exon-')) {
      continue
    }
    const key = `${h.name}|${h.location.ref}|${h.location.start}|${h.location.end}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push(h)
    }
  }
  return out
}
