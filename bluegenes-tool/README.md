# @intermine/bluegenes-jbrowse2-tool

A [BlueGenes](https://github.com/intermine/bluegenes) report-page tool that
shows a gene in [JBrowse 2](https://jbrowse.org/jb2/), a fork of
`@intermine/bluegenes-jbrowse-tool` (JBrowse 1) that builds JBrowse 2 URLs.
The JBrowse 2 site is the one in this repository (`../Dockerfile`), whose
generated config has an assembly per mine.

For a gene it looks up the chromosome, location and organism, reads the
mine's `project.title` from `service/web-properties`, and embeds an iframe:

```
<jbrowse2Url>?[config=<jbrowse2ConfigUrl>&]assembly=<title>-<taxon>&loc=<ref>:<start>..<end>&tracks=<assembly>-Gene,<assembly>-Transcript
```

e.g. for PAX6 on HumanMine (`flank` 0.1):

```
https://jbrowse2.intermine.org/?assembly=humanmine-9606&loc=11%3A31786132..31820855&tracks=humanmine-9606-Gene,humanmine-9606-Transcript
```

The assembly name is `<project title>-<taxon id>` lower-cased, the same rule
the config generator applies to the server's `dataset_id`; a test checks the
two agree. Track ids are `<assembly>-<InterMine class>`. JBrowse 2 location
strings are 1-based, like InterMine's chromosome locations, so they are passed
through as is.

## Tool config (`config.json`)

| Key | Default | |
|---|---|---|
| `accepts`, `classes`, `columnMapping`, `toolName`, `files`, `version` | as the JBrowse 1 tool | BlueGenes tool API; `toolName.cljs` is `bluegenesJBrowse2Tool` |
| `jbrowse2Url` | `https://jbrowse2.intermine.org/` | root of the JBrowse 2 site; use `https://www.<mine>.org/jbrowse2/` for the sub-path fallback (docs/DEPLOY.md) |
| `jbrowse2ConfigUrl` | `""` | config for JBrowse 2 to load; empty uses the site's own `config.json`, which is right for the shared site |
| `tracks` | `["Gene", "Transcript"]` | InterMine classes opened on load; each must exist in the config (the generator makes one per class). `Transcript` shows exon structure |
| `flank` | `0.1` | widen the view by this fraction of the gene length on each side |

## Installing next to the JBrowse 1 tool

On the server, tools are npm packages under `data/tools/@intermine/<name>/`
in each mine's deployment, bind-mounted into the bluegenes container. **(you)**

```sh
cd ~/intermine/docker/humanmine/data/tools/@intermine
cp -r <this repo>/bluegenes-tool bluegenes-jbrowse2-tool     # dist/ is committed
rm -rf bluegenes-jbrowse2-tool/node_modules bluegenes-jbrowse2-tool/test
```

then add the tool to the mine's BlueGenes tool list the same way
`bluegenes-jbrowse-tool` is listed, and reload. Both panels then appear on a
gene report page, so they can be compared before the JBrowse 1 tool is
retired. Nothing else changes: the JBrowse 1 tool and the classic webapp keep
using the JBrowse 1 container.

## Development

```sh
npm install
npm test         # node --test: URL building, main() against stubs, bundle shape
npm run build    # esbuild -> dist/bundle.js (+ copies style.css); commit dist/
```

`main()` takes injectable dependencies (`queryData`, `fetch`, `document`) as a
sixth argument for tests; BlueGenes calls it with five. The repository's
browser test (`plugin/`, `npm run test:e2e`) opens the URL this tool builds
for PAX6 in the real JBrowse 2 and checks the view and tracks.
