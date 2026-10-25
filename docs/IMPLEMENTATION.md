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
| Exon/CDS nesting | `subfeatures` is always empty, but exon `uniqueID` is `exon-<transcriptId>-<n>` and mRNA/transcript `uniqueID` is the transcript id (`NM_019040.5`). The adapter nests exons under transcripts by that convention, with no extra query. CDS and UTR returned nothing in HumanMine's data in the probed region, so they are not required. |
| Gene to transcript link | Not in the REST data (genes and transcripts share no id). v1 shows genes as flat boxes and transcripts, with exons nested, as a separate track. |
| Strand | String `"1"` / `"-1"`; convert to number. |
| Type casing | Request `type=Gene`, response `type: "gene"`; `transcript`, `exon`, `mRNA` likewise lower-cased/unchanged. |
| Names `tracks` | Class names (`Gene`, `Region`, ...), used to pick the track a hit opens. |

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
- [ ] **4. Feature adapter** (`InterMineFeatureAdapter`): config schema,
  `getRefNames`, `getRegions`-free `getFeatures`, `freeResources`,
  `getRegionStats` / `estimateRegionsStats` using `stats/region`. Exon
  nesting when `nestExons` is set. Tests.
- [ ] **5. Sequence adapter** (`InterMineSequenceAdapter`) with chunking so
  requests stay bounded. Tests.
- [ ] **6. Text-search adapter** (`InterMineTextSearchAdapter`), with the
  1-based to interbase fix. Tests.
- [ ] **7. Plugin wiring and feature-detail link.** Register adapters, text
  search adapter type, and an `intermineUrl` link in feature details
  ("Open in HumanMine"). Tests for `install`.
- [ ] **8. Live and browser acceptance.** `test:live` hits HumanMine through
  the adapters; `test:e2e` serves a built bundle plus a `jbrowse-web` page
  with a hand-written 9606 config in headless Chromium and asserts a drawn
  canvas, no `pageerror`, and that PAX6 is found by name. Documented in
  the plugin README.

### Phase 2: config generator (`config/`)

- [ ] **9. Generator.** Node ES module CLI: `<mineRoot> <taxon>` to a
  JBrowse 2 `config.json`. Assembly name `<mine>-<taxon>` (lower-case, e.g.
  `humanmine-9606`). Skips the catch-all `SequenceFeature` track by default,
  adds exon-nested transcript track, text search adapter, plugin entry.
  Multi-assembly merge. Tests with the captured `trackList.json`.

### Phase 3: Docker

- [ ] **10. Container.** `Dockerfile` (pinned `jbrowse-web` zip with SHA-256,
  plugin bundle, generated configs), `default.conf` (no `X-Frame-Options`,
  cache `static/`, never `config.json`), `docker-compose.yml`
  (`jbrowse2`, `JBROWSE2_HTTP_PORT` default 14881), build script and a smoke
  test that builds, starts and curls it. Notes for the vhost and fallback
  sub-path in `docs/DEPLOY.md`.

### Phase 4: BlueGenes tool

- [ ] **11. Tool** (`bluegenes-tool/`): fork of
  `@intermine/bluegenes-jbrowse-tool` building JBrowse 2 URLs, with the URL
  builder unit-tested and the assembly naming rule shared with the
  generator.

### Wrap-up

- [ ] **12. Docs and CI.** Top-level README status/layout, `docs/DEPLOY.md`,
  GitHub Actions running the offline tests and build. Final review pass.
