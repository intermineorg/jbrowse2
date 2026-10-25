# @intermine/bluegenes-jbrowse2-tool

A [BlueGenes](https://github.com/intermine/bluegenes) report-page tool that
shows a gene in [JBrowse 2](https://jbrowse.org/jb2/), a fork of
`@intermine/bluegenes-jbrowse-tool` (JBrowse 1) that builds JBrowse 2 URLs.
The JBrowse 2 site is the one in this repository (`../Dockerfile`), whose
generated config has an assembly per mine.

For a gene it looks up the chromosome, location and organism, reads the
mine's `project.title` from `service/web-properties`, and embeds an iframe:

```
<jbrowse2Url>?[config=<jbrowse2ConfigUrl>&]assembly=<title>-<taxon>&loc=<ref>:<start>..<end>&tracks=<assembly>-Gene
```

e.g. for PAX6 on HumanMine (`flank` 0.1):

```
https://jbrowse2.intermine.org/?assembly=humanmine-9606&loc=11%3A31786132..31820855&tracks=humanmine-9606-Gene
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
| `tracks` | `["Gene"]` | InterMine classes opened on load; each must exist in the config (the generator makes one per class). The generated `Gene` track draws each gene with all its transcripts and their exons |
| `flank` | `0.1` | widen the view by this fraction of the gene length on each side |

## Installing next to the JBrowse 1 tool

On the server, tools are npm packages under `data/tools/@intermine/<name>/`
in each mine's deployment, bind-mounted into the bluegenes container. **(you)**

```sh
cd ~/intermine/docker/humanmine/data/tools/@intermine
cp -r <this repo>/bluegenes-tool bluegenes-jbrowse2-tool     # dist/ is committed
rm -rf bluegenes-jbrowse2-tool/node_modules bluegenes-jbrowse2-tool/test
```

then add it to the tool list in `data/tools/tools.edn` beside
`bluegenes-jbrowse-tool` (`"@intermine/bluegenes-jbrowse2-tool" "0.1.0"` in
the `:tools` map) and restart BlueGenes (`docker-compose restart bluegenes`
in the mine's directory). `https://www.<mine>.org/api/tools/all` should then
list it, with your `jbrowse2Url`.

**Add it to the report page layout.** Installing a tool is not enough when
the mine has a saved report page layout for `Gene` (HumanMine has one, read
from `<mine>/service/bluegenes-properties`, key `layout.report`): only
mines without a saved layout show every installed tool automatically. Log
in to BlueGenes as the mine's superuser, open **Admin**, and under **Report
page layout** select the class `Gene`, open the `Genomics` category, add
*JBrowse 2 Genome Browser* from the "Available classes, tools and templates"
box, move it next to *JBrowse Genome Browser*, and **Save changes**. The
layout is stored in the mine, so it applies to every user at once with no
restart; to undo, remove the item and save again. Both panels then appear on
a gene report page, so they can be compared before the JBrowse 1 tool is
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
