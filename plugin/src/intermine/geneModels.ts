import { parseStrand } from './client'

import type { InterMineFeatureData, RawQueryResults } from './types'

/**
 * Gene models (gene > transcript > exon/CDS) from the mine's query service.
 *
 * The JBrowse 1 REST store returns every feature flat, and how exons relate to
 * transcripts is only implied by mine-specific id conventions (HumanMine
 * `exon-<transcript>-<n>`, FlyMine `<gene>:<n>`, shared between transcripts).
 * The query service (`service/query/results`) has the real collections
 * (`Gene.transcripts`, `Transcript.exons`, `Transcript.CDSs`) in every mine.
 *
 * Query service locations are 1-based and inclusive; everything returned here
 * is interbase, like the REST store.
 */

/** `gene`: Gene > transcripts > exons. `transcript`: transcript > exons. */
export type ModelLevel = 'gene' | 'transcript'

export interface ModelQueryArgs {
  intermineClass: string
  level: ModelLevel
  refName: string
  /** interbase */
  start: number
  end: number
  taxon: string
}

const xmlEscape = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/** Path of the transcripts within the query. */
const transcriptPath = ({ intermineClass, level }: ModelQueryArgs) =>
  level === 'gene' ? `${intermineClass}.transcripts` : intermineClass

function pathQuery(
  args: ModelQueryArgs,
  view: string[],
  joins: string[],
) {
  const { intermineClass: c, refName, start, end, taxon } = args
  const region = `${refName}:${start + 1}..${end}`
  return (
    `<query model="genomic" view="${view.join(' ')}">` +
    joins.map(j => `<join path="${j}" style="OUTER"/>`).join('') +
    `<constraint path="${c}.chromosomeLocation" op="OVERLAPS"><value>${xmlEscape(region)}</value></constraint>` +
    `<constraint path="${c}.organism.taxonId" op="=" value="${xmlEscape(taxon)}"/>` +
    `</query>`
  )
}

/** Column order of `structureQuery` results, as consumed by `buildModels`. */
const ROOT_COLS = ['id', 'primaryIdentifier', 'symbol', 'name', 'chromosomeLocation.start', 'chromosomeLocation.end', 'chromosomeLocation.strand']
const TX_COLS = ['id', 'primaryIdentifier', 'symbol', 'name', 'chromosomeLocation.start', 'chromosomeLocation.end']
const EXON_COLS = ['chromosomeLocation.start', 'chromosomeLocation.end']

/**
 * Root features overlapping the region, with their transcripts (for genes) and
 * every exon of each, whether or not it is in the region. Outer joins keep
 * genes without transcripts and transcripts without exons.
 */
export function structureQuery(args: ModelQueryArgs) {
  const c = args.intermineClass
  const t = transcriptPath(args)
  const view = ROOT_COLS.map(x => `${c}.${x}`)
  if (args.level === 'gene') {
    view.push(...TX_COLS.map(x => `${t}.${x}`))
  }
  view.push(...EXON_COLS.map(x => `${t}.exons.${x}`))
  const joins = args.level === 'gene' ? [t, `${t}.exons`] : [`${t}.exons`]
  return pathQuery(args, view, joins)
}

/**
 * Coding spans of the same transcripts. Mines store a CDS either as one span
 * from start to stop codon (FlyMine) or one per exon; both work, because the
 * spans are clipped to the exons.
 */
export function cdsQuery(args: ModelQueryArgs) {
  const t = transcriptPath(args)
  return pathQuery(
    args,
    [`${t}.id`, `${t}.CDSs.chromosomeLocation.start`, `${t}.CDSs.chromosomeLocation.end`],
    [],
  )
}

type Cell = string | number | null | undefined
type Span = { start: number; end: number }

interface TxAcc {
  objectId: string
  primaryIdentifier?: string
  symbol?: string
  name?: string
  span?: Span
  exons: Map<string, Span>
}

interface RootAcc extends TxAcc {
  strand: 1 | -1 | 0
  transcripts: Map<string, TxAcc>
}

const str = (v: Cell) => (v === null || v === undefined || v === '' ? undefined : String(v))
const num = (v: Cell) => (v === null || v === undefined || v === '' ? undefined : Number(v))

/** 1-based inclusive -> interbase, or undefined when either end is missing. */
function span(s: Cell, e: Cell): Span | undefined {
  const a = num(s)
  const b = num(e)
  return a === undefined || b === undefined ? undefined : { start: a - 1, end: b }
}

function addExon(tx: TxAcc, s: Cell, e: Cell) {
  const x = span(s, e)
  if (x) {
    tx.exons.set(`${x.start}-${x.end}`, x)
  }
}

/** Merge touching or overlapping spans. */
function union(spans: Span[]) {
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  const out: Span[] = []
  for (const s of sorted) {
    const last = out.at(-1)
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end)
    } else {
      out.push({ ...s })
    }
  }
  return out
}

/** Parts of the exons that lie within the coding spans. */
export function codingSegments(exons: Span[], cds: Span[]) {
  const out: Span[] = []
  for (const c of union(cds)) {
    for (const x of exons) {
      const start = Math.max(x.start, c.start)
      const end = Math.min(x.end, c.end)
      if (start < end) {
        out.push({ start, end })
      }
    }
  }
  return union(out)
}

/** InterMine report page for an object id, as BlueGenes routes it. */
export function objectReportUrl(mineRoot: string | undefined, intermineClass: string, objectId: string) {
  return mineRoot
    ? `${mineRoot.replace(/\/+$/, '')}/report/${encodeURIComponent(intermineClass)}/${encodeURIComponent(objectId)}`
    : undefined
}

export interface BuildModelsArgs {
  intermineClass: string
  level: ModelLevel
  refName: string
  mineRoot?: string
}

/**
 * Turn the rows of `structureQuery` and `cdsQuery` into nested features: a
 * gene (or transcript) with transcripts, each with exons plus the coding parts
 * of those exons as CDS. JBrowse infers the UTRs from the difference and draws
 * them thinner. Transcripts with a CDS are typed `mRNA`, others `transcript`.
 */
export function buildModels(
  structure: RawQueryResults,
  cds: RawQueryResults,
  { intermineClass, level, refName, mineRoot }: BuildModelsArgs,
): InterMineFeatureData[] {
  const roots = new Map<string, RootAcc>()
  for (const row of structure.results) {
    const [id, pid, sym, name, s, e, strand, ...rest] = row as Cell[]
    const rootId = str(id)
    if (!rootId) {
      continue
    }
    let root = roots.get(rootId)
    if (!root) {
      root = {
        objectId: rootId,
        primaryIdentifier: str(pid),
        symbol: str(sym),
        name: str(name),
        span: span(s, e),
        strand: parseStrand(str(strand)),
        exons: new Map(),
        transcripts: new Map(),
      }
      roots.set(rootId, root)
    }
    if (level === 'transcript') {
      addExon(root, rest[0], rest[1])
      continue
    }
    const [tid, tpid, tsym, tname, ts, te, xs, xe] = rest
    const txId = str(tid)
    if (!txId) {
      continue
    }
    let tx = root.transcripts.get(txId)
    if (!tx) {
      tx = {
        objectId: txId,
        primaryIdentifier: str(tpid),
        symbol: str(tsym),
        name: str(tname),
        span: span(ts, te),
        exons: new Map(),
      }
      root.transcripts.set(txId, tx)
    }
    addExon(tx, xs, xe)
  }

  const cdsByTx = new Map<string, Span[]>()
  for (const [tid, s, e] of cds.results as Cell[][]) {
    const txId = str(tid)
    const x = span(s, e)
    if (txId && x) {
      cdsByTx.set(txId, [...(cdsByTx.get(txId) ?? []), x])
    }
  }

  const transcriptClass = level === 'gene' ? 'Transcript' : intermineClass

  const toTranscript = (tx: TxAcc, strand: 1 | -1 | 0, parentId: string): InterMineFeatureData | undefined => {
    const exons = [...tx.exons.values()].sort((a, b) => a.start - b.start)
    const loc = tx.span ?? (exons.length ? { start: exons[0]!.start, end: Math.max(...exons.map(x => x.end)) } : undefined)
    if (!loc) {
      return undefined
    }
    const coding = codingSegments(exons, cdsByTx.get(tx.objectId) ?? [])
    const uniqueId = `${parentId}${transcriptClass}:${tx.primaryIdentifier ?? tx.objectId}`
    const part = (type: string) => (x: Span, i: number): InterMineFeatureData => ({
      uniqueId: `${uniqueId}:${type}:${i}`,
      refName,
      start: x.start,
      end: x.end,
      strand,
      type,
      intermineId: `${tx.primaryIdentifier ?? tx.objectId}:${type}:${i + 1}`,
      intermineClass: type === 'exon' ? 'Exon' : 'CDS',
    })
    return {
      uniqueId,
      refName,
      start: loc.start,
      end: loc.end,
      strand,
      type: coding.length ? 'mRNA' : 'transcript',
      name: tx.symbol ?? tx.primaryIdentifier ?? tx.objectId,
      ...(tx.name && tx.name !== tx.symbol ? { description: tx.name } : {}),
      intermineId: tx.primaryIdentifier ?? tx.objectId,
      intermineClass: transcriptClass,
      ...withUrl(objectReportUrl(mineRoot, transcriptClass, tx.objectId)),
      ...(exons.length
        ? { subfeatures: [...exons.map(part('exon')), ...coding.map(part('CDS'))] }
        : {}),
    }
  }

  const out: InterMineFeatureData[] = []
  for (const root of roots.values()) {
    if (!root.span) {
      continue
    }
    if (level === 'transcript') {
      const tx = toTranscript(root, root.strand, '')
      if (tx) {
        out.push(tx)
      }
      continue
    }
    const uniqueId = `${intermineClass}:${root.primaryIdentifier ?? root.objectId}`
    const transcripts = [...root.transcripts.values()]
      .map(t => toTranscript(t, root.strand, `${uniqueId}:`))
      .filter((t): t is InterMineFeatureData => !!t)
    out.push({
      uniqueId,
      refName,
      start: root.span.start,
      end: root.span.end,
      strand: root.strand,
      type: 'gene',
      name: root.symbol ?? root.primaryIdentifier ?? root.objectId,
      ...(root.name && root.name !== root.symbol ? { description: root.name } : {}),
      ...(root.symbol ? { symbol: root.symbol } : {}),
      intermineId: root.primaryIdentifier ?? root.objectId,
      intermineClass,
      ...withUrl(objectReportUrl(mineRoot, intermineClass, root.objectId)),
      ...(transcripts.length ? { subfeatures: transcripts } : {}),
    })
  }
  return out
}

const withUrl = (url: string | undefined) => (url ? { intermineUrl: url } : {})
