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
