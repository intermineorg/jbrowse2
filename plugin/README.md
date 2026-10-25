# jbrowse-plugin-intermine

A [JBrowse 2](https://jbrowse.org/jb2/) plugin that reads genome data live
from an [InterMine](https://intermine.org) web service, using the same
`service/jbrowse` endpoints that InterMine already exposes for JBrowse 1, plus
the standard query service (`service/query/results`) for gene structure. No
data is copied out of the mine.

See [../PLAN.md](../PLAN.md) for the design and
[../docs/IMPLEMENTATION.md](../docs/IMPLEMENTATION.md) for progress and the
verified API behaviour.

## Development

```sh
npm install
npm test            # offline unit tests (recorded fixtures, no network)
npm run typecheck   # type-check src and tests
npm run build       # tsc + UMD bundle in dist/
npm run test:live   # adapters against the live HumanMine service
npm run test:e2e    # built plugin inside real jbrowse-web in headless Chromium
```

### Live and browser tests

`test:live` (HumanMine, and FlyMine for gene models) skips itself (with a
warning) when HumanMine is unreachable;
set `INTERMINE_BASE` to point it at another mine's
`.../service/jbrowse/<taxon>`.

`test:e2e` needs `npm run build` first. It downloads the pinned jbrowse-web
release (SHA-256 checked) into `.e2e-cache/`, serves it with the plugin and a
generated config on localhost, and drives it in headless Chromium against
live HumanMine and FlyMine. It asserts that:

- the Gene and Transcript tracks draw canvases with no page or console
  errors;
- gene models draw for PAX6 (HumanMine) and RapGAP1 (FlyMine), including a
  close-up with CDS, UTRs and caret introns, and ELP4 (plus strand) beside
  PAX6 (minus) to show the caret directions (`models-*.png`);
- the reference sequence shows at base-pair zoom;
- typing `PAX6` in the location box navigates to the gene;
- the URL the BlueGenes tool builds opens the right view.

Chromium comes from `$E2E_CHROME` (a local binary; `puppeteer` must be
resolvable) or, failing that, from Docker
(`zenika/alpine-chrome:with-puppeteer`, run with `--network host`; the
host's `https_proxy` is passed to Chromium). With neither, the tests skip.
Screenshots are written to `test-screenshots/`. To run just the browser step
and print its report: `node e2e/run.mjs [outDir]`.

The bundle is `dist/jbrowse-plugin-intermine.umd.production.min.js`; load it
from a JBrowse 2 config with

```json
"plugins": [{ "name": "InterMine", "url": "https://.../jbrowse-plugin-intermine.umd.production.min.js" }]
```

Targets `@jbrowse/core` 4.x.

## Adapters

### InterMineFeatureAdapter

Features of one InterMine class. Config slots:

| Slot | Default | Meaning |
|---|---|---|
| `baseUrl` | | `<mine root>/service/jbrowse/<taxon>`, as in the mine's `trackList.json` |
| `intermineClass` | `Gene` | InterMine class to query (`Gene`, `Transcript`, `Exon`, ...). Named `intermineClass` rather than `type` because `type` is JBrowse's adapter discriminator |
| `mineRoot` | derived from `baseUrl` | used for the `intermineUrl` link on each feature |
| `nestExons` | `false` | for transcript tracks: also fetch `exonType` features and nest them as subfeatures, matched by the transcript id embedded in HumanMine exon ids (`exon-<transcript>-<n>`). Works for HumanMine only; FlyMine exon ids are `<gene>:<n>`. Superseded by `InterMineGeneModelAdapter`, which the generator now uses |
| `exonType` | `Exon` | class used for exons |
| `intronCarets` | `strand` | features with exon structure: `strand` draws intron carets pointing up on the plus strand and down on the minus strand; `up` points them all up (see [Caret intron glyph](#caret-intron-glyph)) |

```json
{
  "type": "FeatureTrack",
  "trackId": "humanmine-9606-Gene",
  "name": "Gene",
  "assemblyNames": ["humanmine-9606"],
  "adapter": {
    "type": "InterMineFeatureAdapter",
    "baseUrl": "https://www.humanmine.org/humanmine/service/jbrowse/9606",
    "intermineClass": "Gene"
  }
}
```

Coordinates are used as the server returns them (interbase). Feature density
for the "zoom in" prompt comes from `stats/region` with the class as `type`.
Each feature carries `intermineId`, `intermineClass` and, where the mine has a
page for it, `intermineUrl`.

### InterMineGeneModelAdapter

Genes with all their transcripts, and each transcript's exons and coding
region, as JBrowse draws a GFF3 gene. The REST store returns every feature
flat and only implies how exons belong to transcripts through mine-specific
ids, so this adapter reads the real `Gene.transcripts`, `Transcript.exons`
and `Transcript.CDSs` collections from the mine's query service: two
PathQueries per region (structure, outer-joined so genes without transcripts
still show; and CDS), POSTed as forms so there is no CORS preflight.

Takes every `InterMineFeatureAdapter` slot (reference names and the density
count still come from `baseUrl`) plus:

| Slot | Default | Meaning |
|---|---|---|
| `level` | `gene` | `gene`: `intermineClass` has transcripts (`Gene`). `transcript`: it has exons itself (`Transcript`, `MRNA`) |

```json
"adapter": {
  "type": "InterMineGeneModelAdapter",
  "baseUrl": "https://www.flymine.org/flymine/service/jbrowse/7227",
  "intermineClass": "Gene",
  "level": "gene"
}
```

- Whole genes are returned for any region they overlap, so a model is never
  cut at a block edge.
- A CDS is clipped to the exons, so it works whether a mine stores one span
  from start to stop codon (FlyMine) or one per exon. Transcripts with a CDS
  are typed `mRNA` and JBrowse infers the UTRs, drawn thinner; transcripts
  without one (all of HumanMine at present, which loads no CDS) are typed
  `transcript` and their exons are drawn full height.
- Genes are labelled by symbol with the full name as description, and link to
  `report/<Class>/<object id>`; transcripts likewise.

### Caret intron glyph

The plugin registers a JBrowse glyph (`InterMineIntronHat`) for InterMine
features that have exon structure (they carry `intermineClass`; other tracks
keep JBrowse's own glyphs). It draws the layout JBrowse has already computed,
so packing, labels, clicks and mouse-overs are unchanged, but each intron is a
caret ("hat") from exon to exon instead of a straight line, and an arrowhead
marks the 3' end of each transcript, pointing in the direction of
transcription.

Carets point up on the plus strand and down on the minus strand. To point
them all up, the usual convention, set `"intronCarets": "up"` in the track's
adapter (or regenerate the config with `--intron-carets up`). It is an
adapter slot because the glyph runs in JBrowse's render worker, which sees
only the track's adapter and renderer config; the adapter attaches the choice
to each feature as a hidden (non-enumerable) property, so it does not appear
in the feature panel.

**Cost of the two caret directions: none measurable.** Up and down carets are
the same three-point path with a different apex height, so they need the same
canvas calls; choose between them on looks alone. Measured in headless
Chromium (software rendering, the zenika/alpine-chrome image the browser
tests use), calling the glyph's drawing code directly and drawing a PAX6-sized gene (53
transcripts of 14 exons, 12 px rows, 1400 px canvas) 500 times per run,
median of 5 runs after warm-up:

| Gene strand, `intronCarets` | Carets | ms per draw (median; min-max) |
|---|---|---|
| minus, `up` | up | 0.800 (0.795-0.810) |
| minus, `strand` | down | 0.807 (0.799-0.833) |
| plus, `strand` | up | 0.805 (0.803-0.840) |

The differences are within run-to-run noise. Drawing is in any case a small
part of what the user waits for: fetching the models takes hundreds of
milliseconds (next section).

**Cost of gene models compared with flat boxes.** A gene-model track sends
two PathQueries per region to the mine's query service where a flat track
sends one REST request. Measured against the live mines (second request of
two, so the mine's own caches are warm; the first is up to twice as slow):

| Region | Flat `Gene` track (REST) | Gene models (two queries) |
|---|---|---|
| HumanMine 11:31.78-31.83 Mb (PAX6) | 0.27 s, 4 genes | 0.29 s, 672 rows |
| HumanMine 11:31-32 Mb | 0.27 s, 8 genes | 0.34 s, 1481 rows |
| HumanMine 11:64-65 Mb (gene-dense) | 0.27 s, 53 genes | 1.26 s (2.16 s cold), 4321 rows |
| FlyMine 2L:7.495-7.582 Mb | 0.28 s, 6 genes | 0.28 s, 161+17 rows |
| FlyMine 2L:7-8 Mb | 0.34 s, 135 genes | 0.31 s, 1672+270 rows |

So the extra cost is negligible in most views and about 1 s in gene-dense
human regions, where each gene has many transcripts (one row per exon per
transcript). JBrowse caches fetched regions, so panning back is free, and
beyond the density limit it shows "zoom in" without fetching. Colours come from the track's renderer settings (`color1` for
exons/CDS, `color3` for UTRs, `color2` for introns and arrows).

### InterMineSequenceAdapter

Reference sequence for an assembly. One slot, `baseUrl` (as above). Ref names
and lengths come from `<service>/config/<taxon>/seq/refSeqs.json`; sequence
is fetched with `features/<ref>?reference=true` in slices of at most 100 kb,
four at a time, clamped to the reference length.

```json
"sequence": {
  "type": "ReferenceSequenceTrack",
  "trackId": "humanmine-9606-sequence",
  "adapter": {
    "type": "InterMineSequenceAdapter",
    "baseUrl": "https://www.humanmine.org/humanmine/service/jbrowse/9606"
  }
}
```

### InterMineTextSearchAdapter

Finds features by name in the location box, via `names/<taxon>?startswith=`
(or `equals=` for exact searches). Exon rows and duplicates are dropped.
`trackIdPrefix` (e.g. `humanmine-9606-`) lets a result open the matching
class track; `preferredClass` (default `Gene`) picks which class when a hit
belongs to several.

```json
"aggregateTextSearchAdapters": [{
  "type": "InterMineTextSearchAdapter",
  "textSearchAdapterId": "humanmine-9606-names",
  "baseUrl": "https://www.humanmine.org/humanmine/service/jbrowse/9606",
  "trackIdPrefix": "humanmine-9606-",
  "assemblyNames": ["humanmine-9606"]
}]
```

## Links back to the mine

Every feature has `intermineId`, `intermineClass` and `intermineUrl`
attributes. JBrowse 2 shows string values starting with `http(s)://` as links
in the feature panel, so `intermineUrl` is a clickable link to the mine's
report page. Gene models carry object ids and link to `report/<Class>/<id>`.
Flat tracks only have the primary identifier (HumanMine genes: the NCBI id,
e.g. `5080` for PAX6, whose object id is `1234788`), so they use InterMine's
permanent URI `<mine>/<class>:<identifier>` (`/humanmine/gene:5080`), which
redirects to the report page. Permanent URIs are configured per class: they
work for genes on HumanMine and FlyMine but not, for example, for FlyMine
mRNAs. Exons have no link. No custom widget is needed.
