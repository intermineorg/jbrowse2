# jbrowse-plugin-intermine

A [JBrowse 2](https://jbrowse.org/jb2/) plugin that reads genome data live
from an [InterMine](https://intermine.org) web service, using the same
`service/jbrowse` endpoints that InterMine already exposes for JBrowse 1. No
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

`test:live` skips itself (with a warning) when HumanMine is unreachable;
set `INTERMINE_BASE` to point it at another mine's
`.../service/jbrowse/<taxon>`.

`test:e2e` needs `npm run build` first. It downloads the pinned jbrowse-web
release (SHA-256 checked) into `.e2e-cache/`, serves it with the plugin and a
generated config on localhost, and drives it in headless Chromium against
live HumanMine. It asserts that:

- the Gene and exon-nested Transcript tracks draw canvases with no page or
  console errors;
- the reference sequence shows at base-pair zoom;
- typing `PAX6` in the location box navigates to the gene.

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
| `nestExons` | `false` | for transcript tracks: also fetch `exonType` features and nest them as subfeatures (matched by the transcript id embedded in each exon id) |
| `exonType` | `Exon` | class used for exons |

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
report page (genes: `/report/Gene/<id>`; other classes with a primary
identifier: `/portal.do?class=<Class>&externalids=<id>`; exons: none). No
custom widget is needed.
