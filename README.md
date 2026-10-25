# JBrowse 2 for InterMine

[JBrowse 2](https://jbrowse.org/jb2/) on InterMine report pages, fed live from
a mine's own web service, as
[intermineorg/jbrowse](https://github.com/intermineorg/jbrowse) does for
JBrowse 1. No genome data is copied out of the mine: InterMine already serves
the JBrowse 1 REST-store protocol under `<mine>/service/jbrowse`, and a small
plugin teaches JBrowse 2 to read it.

**Status: implemented and tested against live HumanMine; not yet deployed.**
Gene and other feature tracks (transcripts with exon structure), the
reference sequence and name search all work in a real jbrowse-web in headless
Chromium. What remains needs the maintainer or the front-end admins: the
`jbrowse2.intermine.org` virtual host, installing the BlueGenes tool, and
publishing to npm. [docs/DEPLOY.md](docs/DEPLOY.md) lists each step.

[PLAN.md](PLAN.md) is the original brief; [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)
records what was built, the API behaviour verified against HumanMine (interbase
coordinates, 1-based name hits, `stats/region` honouring `type`, exon nesting
by id), and where the result differs from the brief.

| Path | Purpose |
|------|---------|
| [`plugin/`](plugin/) | `jbrowse-plugin-intermine`: feature, sequence and text-search adapters (TypeScript, `@jbrowse/core` 4.x) |
| [`config/`](config/) | Generator that turns a mine's JBrowse 1 track list into a JBrowse 2 `config.json`, for one or several mines |
| `Dockerfile`, `docker-compose.yml`, `default.conf`, `docker/` | jbrowse-web (pinned, SHA-256 checked) + plugin bundle + generated config behind nginx, laid out like intermineorg/jbrowse; `docker/smoke-test.sh` checks the built image |
| [`bluegenes-tool/`](bluegenes-tool/) | `@intermine/bluegenes-jbrowse2-tool`, the BlueGenes report-page tool that embeds JBrowse 2 for a gene |
| [`docs/`](docs/) | Deployment guide and implementation notes |

## Quick start

```sh
docker compose up -d --build        # JBrowse 2 on http://localhost:14881/
```

Open `http://localhost:14881/?assembly=humanmine-9606&loc=11:31,780,000..31,830,000&tracks=humanmine-9606-Gene,humanmine-9606-Transcript`.

## Tests

| Command (in the directory) | What it covers |
|---|---|
| `plugin/ $ npm test` | adapters, client, plugin registration; offline, recorded HumanMine fixtures |
| `plugin/ $ npm run test:live` | adapters against the live HumanMine service |
| `plugin/ $ npm run build && npm run test:e2e` | the built plugin and generated config in real jbrowse-web, headless Chromium (needs Docker or `E2E_CHROME`): tracks draw, sequence shows, PAX6 found by name, the BlueGenes tool's URL opens the right view |
| `config/ $ npm test` | generator, with recorded HumanMine and FlyMine track lists |
| `bluegenes-tool/ $ npm test` | URL building, `main()`, bundle shape |
| `docker/smoke-test.sh` (`BROWSER=1` adds Chromium) | image build, headers, caching, healthcheck |

CI runs the offline suites and the Docker smoke test; see
[.github/workflows/ci.yml](.github/workflows/ci.yml).

License: MIT.
