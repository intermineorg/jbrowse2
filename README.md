# JBrowse 2 for InterMine

[JBrowse 2](https://jbrowse.org/jb2/) on InterMine report pages, fed live from
a mine's own web service, as
[intermineorg/jbrowse](https://github.com/intermineorg/jbrowse) does for
JBrowse 1. No genome data is copied out of the mine: InterMine already serves
the JBrowse 1 REST-store protocol under `<mine>/service/jbrowse`, and a small
plugin teaches JBrowse 2 to read it.

**Status: deployed on HumanMine and FlyMine** (October 2026), as
`https://www.humanmine.org/jbrowse2/` and `https://www.flymine.org/jbrowse2/`;
their gene report pages show the JBrowse 2 panel instead of the JBrowse 1 one.
Genes drawn with all their transcripts (exons as boxes, CDS thick and UTRs
thin where the mine has CDS data, introns as carets that point down on the
minus strand (switchable to all up), an arrowhead for the strand), every other feature class, the reference sequence and name search all
work in a real jbrowse-web in headless Chromium, against HumanMine and
FlyMine, and [intermineorg/mine-tests](https://github.com/intermineorg/mine-tests)
checks both deployments. Not done yet: the shared `jbrowse2.intermine.org`
virtual host and publishing the plugin to npm. [docs/DEPLOY.md](docs/DEPLOY.md)
lists each step. JBrowse 1 keeps running for the classic webapp and other
sites.

[PLAN.md](PLAN.md) is the original brief; [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)
records what was built, the API behaviour verified against HumanMine (interbase
coordinates, 1-based name hits, `stats/region` honouring `type`, gene
structure from the query service), and where the result differs from the brief.

| Path | Purpose |
|------|---------|
| [`plugin/`](plugin/) | `jbrowse-plugin-intermine`: feature, gene-model, sequence and text-search adapters and a caret-intron glyph (TypeScript, `@jbrowse/core` 4.x) |
| [`config/`](config/) | Generator that turns a mine's JBrowse 1 track list into a JBrowse 2 `config.json`, for one or several mines |
| `Dockerfile`, `docker-compose.yml`, `default.conf`, `docker/` | jbrowse-web (pinned, SHA-256 checked) + plugin bundle + generated config behind nginx, laid out like intermineorg/jbrowse; `docker/smoke-test.sh` checks the built image |
| [`bluegenes-tool/`](bluegenes-tool/) | `@intermine/bluegenes-jbrowse2-tool`, the BlueGenes report-page tool that embeds JBrowse 2 for a gene |
| [`docs/`](docs/) | Deployment guide and implementation notes |

## Quick start

```sh
docker-compose up -d --build        # JBrowse 2 on http://localhost:14881/
```

Open `http://localhost:14881/?assembly=humanmine-9606&loc=11:31,780,000..31,830,000&tracks=humanmine-9606-Gene`
(PAX6), or `http://localhost:14881/?assembly=flymine-7227&loc=2L:7,495,000..7,582,000&tracks=flymine-7227-Gene`
(RapGAP1, with CDS and UTRs).

## Tests

| Command (in the directory) | What it covers |
|---|---|
| `plugin/ $ npm test` | adapters, client, plugin registration; offline, recorded HumanMine fixtures |
| `plugin/ $ npm run test:live` | adapters against the live HumanMine (and FlyMine) services |
| `plugin/ $ npm run build && npm run test:e2e` | the built plugin and generated config in real jbrowse-web, headless Chromium (needs Docker or `E2E_CHROME`): tracks and gene models draw in both mines, sequence shows, PAX6 found by name, the BlueGenes tool's URL opens the right view |
| `config/ $ npm test` | generator, with recorded HumanMine and FlyMine track lists |
| `bluegenes-tool/ $ npm test` | URL building, `main()`, bundle shape |
| `docker/smoke-test.sh` (`BROWSER=1` adds Chromium) | image build, headers, caching, healthcheck |

CI runs the offline suites and the Docker smoke test; see
[.github/workflows/ci.yml](.github/workflows/ci.yml).

License: MIT.
