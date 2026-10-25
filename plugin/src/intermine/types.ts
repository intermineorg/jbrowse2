/** Shapes returned by InterMine's `service/jbrowse` endpoints (JBrowse 1 REST store). */

export interface RawFeature {
  uniqueID: string
  start: number
  end: number
  /** "1" or "-1" (a string), occasionally absent. */
  strand?: string | number
  /** Lower-cased class, e.g. "gene", "mRNA", "exon". */
  type?: string
  name?: string
  symbol?: string
  subfeatures?: RawFeature[]
}

export interface ServiceEnvelope {
  wasSuccessful?: boolean
  error?: string | null
  statusCode?: number
}

export interface RawFeaturesResponse extends ServiceEnvelope {
  features: RawFeature[]
}

export interface RawSequenceChunk {
  start: number
  end: number
  seq: string
}

export interface RawSequenceResponse extends ServiceEnvelope {
  features: RawSequenceChunk[]
}

export interface RawRegionStats extends ServiceEnvelope {
  featureDensity: number
  featureCount: number
}

export interface RawRefSeq {
  name: string
  start: number
  end: number
}

export interface RawNameHit {
  name: string
  location: {
    ref: string
    /** 1-based, unlike the feature endpoints. */
    start: number
    end: number
    objectName: string
    tracks?: string[]
  }
}

/** `service/query/results?format=json`: one row per result, cells in view order. */
export interface RawQueryResults extends ServiceEnvelope {
  results: (string | number | null)[][]
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

/** A feature as the adapters hand it to JBrowse (before SimpleFeature wrapping). */
export interface InterMineFeatureData {
  uniqueId: string
  refName: string
  start: number
  end: number
  strand: 1 | -1 | 0
  type: string
  name?: string
  symbol?: string
  description?: string
  intermineId: string
  intermineClass: string
  intermineUrl?: string
  subfeatures?: InterMineFeatureData[]
}
