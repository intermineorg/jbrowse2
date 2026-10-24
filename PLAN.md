# JBrowse 2 for InterMine: implementation brief

Written 2026-10-24 at the end of a Claude Code session that deployed
JBrowse 1 and repaired the BlueGenes tool store on HumanMine and FlyMine.
It is addressed to a future session (or person) starting the JBrowse 2 work
from zero. Everything marked *verified* was checked against the live
HumanMine web service on that date; re-check anything that matters before
building on it.

## 1. Context

- The maintainer runs HumanMine (https://www.humanmine.org) and FlyMine
  (https://www.flymine.org) with Docker on one server, deployed from
  https://github.com/intermineorg/docker_template into
  `~/intermine/docker/humanmine` and `~/intermine/docker/flymine`.
- JBrowse 1.16.11 runs from https://github.com/intermineorg/jbrowse as a
  single shared container, published under each mine as
  `https://www.<mine>.org/jbrowse/` by an nginx `location /jbrowse/` in the
  mine's own front end (variable upstream `http://jbrowse:80`, container
  joined to each mine's `<dir>_frontend` network via a compose override).
  Copy that packaging pattern; do not fork that repository. JBrowse 1 keeps
  running alongside JBrowse 2 indefinitely, because the classic webapp and
  the current BlueGenes tool hard-code JBrowse 1 URLs.
- BlueGenes tools are npm packages under `data/tools/@intermine/<name>/`
  on the host, bind-mounted into the bluegenes container; the report page
  loads `dist/bundle.js` and passes `config.json` to the tool's `main`.
- Working conventions of the maintainer: commit locally and give exact
  shell/git commands; **they push themselves**; keep GitHub steps explicit.
  Verify in a headless browser before claiming something renders (the
  previous session used `zenika/alpine-chrome:with-puppeteer` with
  `--proxy-server` pointed at the sandbox proxy). In that sandbox the proxy
  returns 403 for CDNs such as cdn.jsdelivr.net until allowed, which makes
  tools that rely on CDN globals fail only in the sandbox; do not mistake
  that for a production bug.

## 2. Why this is mostly a plugin, not a container

JBrowse 1 does no data work of its own here. InterMine implements the
JBrowse 1 **REST Store** protocol in its web service, and JBrowse 1 reads
everything from it. JBrowse 2 has no adapter for that protocol. Therefore:

1. The core deliverable is a JBrowse 2 plugin with adapters that read
   InterMine's existing endpoints (section 3). It is plain TypeScript,
   testable against the public HumanMine service from any machine, and
   usable by any JBrowse 2 instance, not only this Docker image.
2. The container is then a thin wrapper, like intermineorg/jbrowse.
3. A small fork of the BlueGenes JBrowse tool is needed to embed JBrowse 2
   (section 5).

Do not plan on changing InterMine's Java web service. The project is
lightly maintained and the existing endpoints are sufficient.

## 3. The InterMine JBrowse REST API (verified 2026-10-24)

Base: `<mine root>/service/jbrowse`, e.g.
`https://www.humanmine.org/humanmine/service/jbrowse`. `<taxon>` is an NCBI
taxon id (9606 human, 7227 fly; FlyMine answers the same shapes at
`https://www.flymine.org/flymine/service/jbrowse`). CORS is open (JBrowse 1
runs cross-origin against it today).

| Purpose | URL | Notes |
|---|---|---|
| Track list | `config/<taxon>/trackList.json` | JSON with `tracks` (101 for human: one `CanvasFeatures` track per feature class, each `storeClass: JBrowse/Store/SeqFeature/REST`, `baseUrl: <base>/<taxon>`, `query: {type: <Class>}`; plus one `SequenceTrack` with `query: {reference: true}`), `names: {type: REST, url: <base>/names/<taxon>}`, `dataset_id`. |
| Reference sequences | `config/<taxon>/seq/refSeqs.json` | `[{"name":"1","start":0,"end":248956422}, ...]`. Note the `seq/` segment; `config/<taxon>/refSeqs.json` is 404. |
| Features in a region | `<taxon>/features/<ref>?start=S&end=E&type=<Class>` | `{"features":[{"symbol","name","start","end","strand":"-1","type":"gene","uniqueID":"5080","subfeatures":[]}, ...], "wasSuccessful":true}`. `uniqueID` is the InterMine object id for genes (`<mine root>/report/Gene/<id>` is the report page) and the primary identifier for transcripts. `strand` is a string. `subfeatures` was **always empty** in every probe (genes, mRNAs), so gene models come back as flat boxes; to draw exon structure the adapter would have to fetch `type=Exon` (and/or `type=CDS`, `UTR`) for the same region and nest them under their transcripts itself. Check whether exons carry a parent reference; if not, nesting needs a query to the main InterMine API. |
| Reference sequence | `<taxon>/features/<ref>?start=S&end=E&reference=true` | `{"features":[{"start":S,"end":E,"seq":"CCTG..."}]}`. |
| Global stats | `<taxon>/stats/global` | `{"featureDensity":0.0209,"featureCount":64489555}`. |
| Region stats | `<taxon>/stats/region/<ref>?start=S&end=E` | `{"featureDensity":0.0395,"featureCount":395}`. The `type` parameter should also be honoured; verify. |
| Name search | `names/<taxon>?startswith=PAX6` or `?equals=PAX6` | `[{"name":"PAX6","location":{"ref":"11","start":31789026,"end":31817961,"objectName":"5080","tracks":["Gene",...]}}]`. |

Coordinate caution: the features endpoint returned PAX6 as `start 31789025`,
the names endpoint as `start 31789026`. JBrowse 1 REST stores are
interbase (0-based half-open), which the features call appears to follow,
while the names call looks 1-based. Pin this down with a known feature
before writing the adapters; JBrowse 2 features are interbase.

InterMine source for these endpoints: search the `intermine/intermine`
repository for `jbrowse` under the `intermine/webservice` module (Java
package `org.intermine.webservice.server.jbrowse`), useful for parameter
names that the probes above did not exercise.

## 4. Deliverables and order

### Phase 1: plugin (`plugin/`)

Start from GMOD's `jbrowse-plugin-template` (check its README for the
current bootstrap command and the `@jbrowse/core` version it targets).
Package name suggestion: `jbrowse-plugin-intermine`. Keep its own
`package.json` so it can be published to npm from this repository and split
out later with `git subtree split` if wanted.

Adapters to implement (class names are the `@jbrowse/core` base classes
at the time of writing; confirm against the installed version):

1. `InterMineFeatureAdapter` extends `BaseFeatureDataAdapter`.
   Config: `baseUrl` (`<base>/<taxon>`), `type` (InterMine class),
   `mineRoot` (for report links). `getRefNames()` from
   `config/<taxon>/seq/refSeqs.json`; `getFeatures(region)` fetches
   `features/<ref>?start&end&type` and emits `SimpleFeature`s with
   `uniqueId`, `refName`, `start`, `end`, `strand` (number), `type`,
   `name`, `symbol`, and a link attribute to the report page. Optionally
   `estimateRegionsStats` via `stats/region` so dense tracks degrade the
   way JBrowse 1 did with `region_feature_densities`.
2. `InterMineSequenceAdapter` extends `BaseSequenceAdapter` (or whatever
   the version calls the reference-sequence base): `getRefNames()` from
   `refSeqs.json`, `getFeatures(region)` from `features/<ref>?reference=true`.
3. `InterMineTextSearchAdapter` extends `BaseTextSearchAdapter`, wrapping
   `names/<taxon>?startswith=` so the location box finds genes by symbol.
4. A feature-detail widget tweak or `formatDetails` callback so the panel
   shows a clickable "Open in <mine>" link. Lowest priority.

Acceptance: a local `jbrowse-web` (or `@jbrowse/react-linear-genome-view`
in a test page) with a hand-written config for human assembly `9606`
shows the reference sequence, a Gene track and finds PAX6 by name, all
read live from HumanMine. Automate the check with a headless Chromium
script that loads the page and asserts a `canvas` with drawn features and
no `pageerror`.

### Phase 2: config generator (`config/`)

A small Node (or Python) script: input mine root and taxon, output a
JBrowse 2 `config.json` with one assembly (name `<dataset_id>` or
`<Mine>-<taxon>`), the sequence adapter, one track per entry of
`trackList.json` (skip the catch-all `SequenceFeature` track or leave it
off by default, it is huge), the text-search adapter, and the plugin
declared under `plugins` with its bundle URL. Re-run per mine release.
Consider a merged multi-assembly config so one JBrowse 2 instance serves
every mine, as the JBrowse 1 dataset drop-down does.

### Phase 3: Docker

Mirror intermineorg/jbrowse: `Dockerfile` that downloads a pinned
`jbrowse-web` release zip (SHA-256 pinned), copies the plugin bundle and the
generated configs in, nginx `default.conf` that sends no `X-Frame-Options`
(report pages iframe it) and caches `static/` but not `config.json`;
`docker-compose.yml` with container `jbrowse2`, port variable
`JBROWSE2_HTTP_PORT` (default suggestion 14881); the same
`docker-compose.override.yml.example` joining `humanmine_frontend` and
`flymine_frontend`. In docker_template add `set $jbrowse2
http://jbrowse2:80;` and a `location /jbrowse2/` block beside the existing
`/jbrowse/` one (JBrowse 2 web must be told its base path; check the
release's `index.html` and `jbrowse-web` docs for serving under a
sub-path, since asset URLs in the build are absolute by default).

### Phase 4: BlueGenes tool

The installed `@intermine/bluegenes-jbrowse-tool` (1.0.1) builds, per
gene, an iframe `src` of
`${config.jbrowseUrl}${encodeURIComponent(mineRoot + '/service/jbrowse/config/' + taxon)}&loc=${loc}&tracks=${projectTitle}-${taxon}-Gene`
with `config.jbrowseUrl` = `https://www.humanmine.org/jbrowse/?data=`
(default in the published package: `https://jbrowse.intermine.org/?data=`).
Fork it as a new tool, e.g. `@intermine/bluegenes-jbrowse2-tool`, that
builds a JBrowse 2 URL instead:
`<jbrowse2 base>/?config=<config url>&assembly=<name>&loc=<ref>:<start>-<end>&tracks=<trackId>,...`
(confirm the exact parameter names against the `jbrowse-web` version
used). Keep `config.json` keys `accepts`, `classes`, `columnMapping`,
`toolName`, add `jbrowse2Url` and the assembly naming rule. Install it in
`data/tools/@intermine/` beside the JBrowse 1 tool so both panels can be
compared on a report page before retiring the old one.

## 5. Alternative considered: static files, no plugin

Export each mine's genome and features as indexed files (FASTA + `.fai`,
GFF3 bgzipped + tabix) and serve them from the container. JBrowse 2 reads
these natively, so this needs no adapter and is the quickest route to a
demo. Costs: data duplicated outside the mine, a regeneration step per
release, and no direct link from features to InterMine objects. Use only
for a first look or if the adapter stalls; the live-adapter route is the
one that matches how InterMine already works.

## 6. Open questions to settle early

- Exon/CDS structure: is nesting feasible from the REST endpoint alone?
  (See the `subfeatures` note above.) If not, decide between flat gene
  boxes for v1 or a second query to `<mine root>/service/query/results`.
- Coordinate system of the names endpoint vs the features endpoint.
- Whether `stats/region` accepts `type`; without it, density scaling per
  track is not possible.
- Sub-path serving of `jbrowse-web` (needed for `/jbrowse2/` under each
  mine); if awkward, Route A from the jbrowse README (own hostname) is the
  fallback, but that currently depends on the DBCLS front-end admins.
- Assembly naming: JBrowse 2 keys everything by assembly name; pick a
  stable scheme (`humanmine-9606`) and use it in the tool, the generator
  and any shared multi-mine config.

## 7. Verification kit that already exists

In the maintainer's previous session scratchpad (not committed anywhere):
puppeteer scripts that load a HumanMine report page through the sandbox
proxy, wait 45 s, and dump per-tool DOM state and console errors. Recreate
as `scripts/check-report-page.js` here when needed; the essential flags
were `--no-sandbox --disable-gpu --proxy-server=http://<proxy>:3128
--ignore-certificate-errors` with `puppeteer-core` and
`/usr/bin/chromium-browser` in `zenika/alpine-chrome:with-puppeteer`.
