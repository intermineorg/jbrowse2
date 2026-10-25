# config: JBrowse 2 config generator

Turns a mine's JBrowse 1 track list
(`<mine root>/service/jbrowse/config/<taxon>/trackList.json`) into a JBrowse 2
`config.json` for [jbrowse-plugin-intermine](../plugin/). Dependency-free
Node (>= 20). Re-run it for each mine release.

```sh
node generate.mjs https://www.humanmine.org/humanmine 9606 -o config.json

# one config serving several mines (JBrowse 2's assembly selector replaces the
# JBrowse 1 dataset drop-down)
node generate.mjs https://www.humanmine.org/humanmine 9606 \
                  https://www.flymine.org/flymine 7227 \
                  --plugin-url https://jbrowse2.intermine.org/jbrowse-plugin-intermine.umd.production.min.js \
                  -o config.json
```

| Option | Default | |
|---|---|---|
| `-o, --out` | stdout | output file |
| `--plugin-url` | `jbrowse-plugin-intermine.umd.production.min.js` | plugin bundle URL (relative URLs resolve against the page) |
| `--exclude A,B` | `SequenceFeature` | classes to skip; the catch-all `SequenceFeature` track is huge |
| `--include A,B` | | only these classes (overrides `--exclude`) |
| `--gene-models A,B` | `Gene` | classes drawn as genes with their transcripts, exons and CDS (`InterMineGeneModelAdapter`, `level: gene`); `''` for none |
| `--nest-exons A,B` | `Transcript,MRNA` | classes drawn as transcripts with exons and CDS (`InterMineGeneModelAdapter`, `level: transcript`); `''` for none |
| `--intron-carets strand\|up` | `strand` | written as `intronCarets` on every gene-model track: `strand` points intron carets down on the minus strand, `up` points them all up. Both draw at the same speed (see `plugin/README.md`). To change an existing config without regenerating, edit that value in `config.json` |

## What it produces

- **Assembly name** `<dataset_id lower-cased>`, e.g. `humanmine-9606`,
  `flymine-7227` (falls back to `<last segment of mine root>-<taxon>`). This is
  the naming rule the BlueGenes tool uses too.
- One `InterMineSequenceAdapter` sequence track `<assembly>-sequence`.
- One `FeatureTrack` per InterMine class, id `<assembly>-<Class>`; names and
  categories come from the track list. `Gene`, `Transcript` and `MRNA` use
  `InterMineGeneModelAdapter` (exon/intron structure, read from the mine's
  query service) and start 300 px tall; every other class is a flat
  `InterMineFeatureAdapter` track.
- An `InterMineTextSearchAdapter` per assembly, whose `trackIdPrefix` lets a
  name hit open the matching class track.
- The plugin under `plugins` (name `InterMine`, which JBrowse maps to the
  `JBrowsePluginInterMine` global of the UMD bundle) and
  `configuration.disableAnalytics`.

Two datasets that map to the same assembly name are an error.

## Tests

```sh
npm test    # node --test, uses recorded HumanMine and FlyMine track lists
```

The plugin's `npm run test:e2e` also runs this generator against live HumanMine
and loads the result in JBrowse.
