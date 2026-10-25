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
npm test            # offline unit tests (fixtures, no network)
npm run typecheck   # type-check src and tests
npm run build       # tsc + UMD bundle in dist/
```

The bundle is `dist/jbrowse-plugin-intermine.umd.production.min.js`; load it
from a JBrowse 2 config with

```json
"plugins": [{ "name": "InterMine", "url": "https://.../jbrowse-plugin-intermine.umd.production.min.js" }]
```

Targets `@jbrowse/core` 4.x.
