# Implementation plan and progress

This expands [PLAN.md](../PLAN.md) (the brief) into ordered steps. Each step
is one commit; tests and docs ship with the code they cover. Tick a step when
its commit lands.

## Scope decisions

- "Complete" means the four phases of PLAN.md section 4 are built and tested
  as far as is possible without access to the production server. Things that
  need the maintainer or the DBCLS admins (the `jbrowse2.intermine.org`
  vhost, npm publish, installing the tool in `data/tools/`, `git push`) are
  documented as explicit steps in `docs/DEPLOY.md`, not performed.
- Commit locally only; the maintainer pushes.
- Tests that need the live HumanMine service or a browser are in separate
  suites (`npm run test:live`, `npm run test:e2e`) and skip with a clear
  message when the network or Chromium is unavailable. The default
  `npm test` is offline and uses recorded fixtures.
- Package manager: npm, with `package-lock.json` committed (the GMOD template
  uses pnpm, but nothing in the plugin depends on it).
- Target `@jbrowse/core` 4.x (4.3.0 at the time of writing).

## Spike results (verified live against HumanMine, 2026-10-25)

These settle PLAN.md section 6.

| Question | Answer |
|---|---|
| Feature coordinates | Interbase (0-based, half-open). `reference=true&start=0&end=10` returns ten `N`s (telomere); sequence length is always `end - start`. Use as is. |
| Names endpoint coordinates | `start` is **1-based** (PAX6: features 31789025, names 31789026). Subtract 1 from `start`; `end` is unchanged. |
| `stats/region` and `type` | Honoured (`type=Gene` 8 features, `type=Exon` 1206, none 1620 over 11:31-32 Mb). Density scaling per track is possible. |
| Exon/CDS nesting | `subfeatures` is always empty. HumanMine exon `uniqueID` is `exon-<transcriptId>-<n>`, so step 4 nested exons by that convention. It is HumanMine-specific: FlyMine exon ids are `<gene>:<n>` (`FBgn0264895:3`), shared between transcripts. Superseded by step 13. |
| Gene to transcript link | Not in the REST data (genes and transcripts share no id). Step 13 reads it from the query service instead. |
| `uniqueID` | The primary identifier, not the object id (now also noted in PLAN.md): HumanMine PAX6 is `5080` (NCBI), object id `1234788`. Report links from flat tracks use the permanent URI `<mine>/gene:5080`; step 4 had wrongly used `report/Gene/5080`, fixed in step 13. |
| Strand | String `"1"` / `"-1"`; convert to number. |
| Type casing | Request `type=Gene`, response `type: "gene"`; `transcript`, `exon`, `mRNA` likewise lower-cased/unchanged. |
| Names `tracks` | Class names (`Gene`, `Region`, ...), used to pick the track a hit opens. |

## Deviations from PLAN.md

- The feature adapter's InterMine class slot is `intermineClass`, not `type`
  (`type` is the adapter discriminator in a JBrowse 2 config; using it for
  both silently queries the wrong class).

## Findings from browser testing

- A text-search adapter config must define `assemblyNames` (and
  `textSearchAdapterId`) or JBrowse silently selects no adapter. Fixed in the
  schema; covered by a unit test and the e2e search test.
- JBrowse's own analytics call (`analytics.jbrowse.org`) is blocked in locked
  down environments and logs console errors; generated configs set
  `configuration.disableAnalytics`.
- The location box runs text search with `searchType: exact` and filters
  results by fuzzy match on `displayString`, which therefore must contain the
  query.

- The jbrowse-web 4.3.0 build references its assets with relative URLs, so the
  `/jbrowse2/` sub-path fallback needs no build changes (verified with a front
  nginx and the headless browser checks); PLAN.md expected absolute URLs.

## Steps

### Phase 1: plugin (`plugin/`)

- [x] **1. Plan** (this file).
- [x] **2. Plugin scaffold.** `plugin/` with `package.json`
  (`jbrowse-plugin-intermine`), TypeScript, rollup UMD build following the
  GMOD template, vitest, an empty `Plugin` subclass, a test that the plugin
  class installs. README for the package.
- [x] **3. InterMine client.** Pure functions with no JBrowse dependency:
  URL builders, interbase conversion, strand parsing, response validation
  (`wasSuccessful`), feature mapping, transcript/exon nesting. Unit tests
  with fixtures captured from HumanMine.
- [x] **4. Feature adapter** (`InterMineFeatureAdapter`): config schema,
  `getRefNames`, `getRegions`-free `getFeatures`, `freeResources`,
  `getRegionStats` / `estimateRegionsStats` using `stats/region`. Exon
  nesting when `nestExons` is set. Tests.
- [x] **5. Sequence adapter** (`InterMineSequenceAdapter`) with chunking so
  requests stay bounded. Tests.
- [x] **6. Text-search adapter** (`InterMineTextSearchAdapter`), with the
  1-based to interbase fix. Tests.
- [x] **7. Plugin wiring and feature-detail link.** Register adapters and the
  text-search adapter type. The `intermineUrl` attribute is rendered as a
  link by JBrowse's own feature panel, so no widget is needed. Test against a
  real `PluginManager`.
- [x] **8. Live and browser acceptance.** `test:live` hits HumanMine through
  the adapters; `test:e2e` serves a built bundle plus a `jbrowse-web` page
  with a hand-written 9606 config in headless Chromium and asserts a drawn
  canvas, no `pageerror`, and that PAX6 is found by name. Documented in
  the plugin README.

### Phase 2: config generator (`config/`)

- [x] **9. Generator.** Node ES module CLI: `<mineRoot> <taxon>` to a
  JBrowse 2 `config.json`. Assembly name `<mine>-<taxon>` (lower-case, e.g.
  `humanmine-9606`). Skips the catch-all `SequenceFeature` track by default,
  adds exon-nested transcript track, text search adapter, plugin entry.
  Multi-assembly merge. Tests with the captured `trackList.json`.

### Phase 3: Docker

- [x] **10. Container.** `Dockerfile` (pinned `jbrowse-web` zip with SHA-256,
  plugin bundle, generated configs), `default.conf` (no `X-Frame-Options`,
  cache `static/`, never `config.json`), `docker-compose.yml`
  (`jbrowse2`, `JBROWSE2_HTTP_PORT` default 14881), build script and a smoke
  test that builds, starts and curls it. Notes for the vhost and fallback
  sub-path in `docs/DEPLOY.md`.

### Phase 4: BlueGenes tool

- [x] **11. Tool** (`bluegenes-tool/`): fork of
  `@intermine/bluegenes-jbrowse-tool` building JBrowse 2 URLs, with the URL
  builder unit-tested and the assembly naming rule shared with the
  generator.

### Gene structure (added after the first review)

JBrowse 1 on these mines showed genes as single boxes (FlyMine) or as a
density histogram only (HumanMine); the maintainer asked for exon/intron
structure with caret introns and a clear strand. The data is in every mine,
but not in the JBrowse 1 REST store: there `subfeatures` is always empty and
the gene > transcript > exon links exist only in the main model. So no
JBrowse 1 or 2 configuration of the REST store alone could draw gene models.

- [x] **13. Gene models and caret introns.** `InterMineGeneModelAdapter`
  reads `Gene.transcripts.exons` and `Transcript.CDSs` from
  `service/query/results` (two PathQueries per region, `OVERLAPS` on
  `chromosomeLocation`, organism by taxon; verified on HumanMine and FlyMine,
  CORS allowed, ~2 s for PAX6's 53 transcripts). CDS spans are clipped to the
  exons, so JBrowse infers UTRs and draws them thinner (FlyMine; HumanMine
  loads no CDS, so its exons are uniform). A pluggable JBrowse glyph
  (`GlyphType`, JBrowse 4.x) redraws InterMine features with structure using
  carets between exons and an arrowhead at the 3' end, from JBrowse's own
  layout. The generator now makes the `Gene` track a gene-model track (same
  track id, so name search and the BlueGenes tool open it) and the
  `Transcript`/`MRNA` tracks transcript-level gene-model tracks, 300 px tall;
  the tool opens `Gene` only. Report links fixed (above). Tests: query
  building and model assembly against recorded HumanMine and FlyMine
  responses, the drawing code with a recording canvas, live tests on both
  mines, and browser scenarios with screenshots (`models-*.png`).
- [x] **14. Downward carets on the minus strand, switchable.** New adapter
  slot `intronCarets`: `strand` (default) points carets down on the minus
  strand and up on the plus strand; `up` points them all up. The glyph runs
  in JBrowse's render worker, which sees only the track's adapter and
  renderer config, and the renderer's config schema cannot take new slots,
  so the adapter attaches the choice to each feature as a non-enumerable
  property: the glyph can read it, but it is not serialized into the feature
  panel. The generator writes `intronCarets` on every gene-model track and
  takes `--intron-carets`. Browser scenario `models-strands` shows ELP4
  (plus) beside PAX6 (minus).

### Wrap-up

- [x] **12. Docs and CI.** Top-level README status/layout, `docs/DEPLOY.md`,
  GitHub Actions running the offline tests and build. Final review pass.
