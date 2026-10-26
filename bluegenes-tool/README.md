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

## Installing

On the server, tools are npm packages under `data/tools/@intermine/<name>/`
in each mine's deployment, bind-mounted into the bluegenes container. **(you)**

```sh
cd ~/intermine/docker/humanmine/data/tools
cp tools.edn tools.edn.bak
cp -r ~/intermine/docker/jbrowse2/bluegenes-tool @intermine/bluegenes-jbrowse2-tool   # dist/ is committed
rm -rf @intermine/bluegenes-jbrowse2-tool/{node_modules,test}
```

In `@intermine/bluegenes-jbrowse2-tool/config.json` set `jbrowse2Url` to
where JBrowse 2 is published for this mine (e.g.
`https://www.humanmine.org/jbrowse2/`; the default is
`https://jbrowse2.intermine.org/`). In `tools.edn` add the line

```
         "@intermine/bluegenes-jbrowse2-tool" "0.1.0"
```

inside the `:tools` map, beside `"@intermine/bluegenes-jbrowse-tool" "1.0.1"`.

**Every entry in `tools.edn` is a name *and* a version string.** The
file is one EDN map, so an entry without its version (or an unbalanced quote
or brace) makes the whole file unreadable. BlueGenes then lists **no tools
at all**, so every report page loses every tool panel, and it logs the
misleading `Tool config ./tools/tools.edn is missing`; check with
`docker logs <mine>_bluegenes 2>&1 | grep -i "tool config"`. A trailing
newline is harmless.

Then restart BlueGenes (`docker-compose restart bluegenes` in the mine's
directory) and check that `https://www.<mine>.org/api/tools/all` lists every
tool as before plus this one, with your `jbrowse2Url`. To undo:
`mv tools.edn.bak tools.edn`, delete `@intermine/bluegenes-jbrowse2-tool`,
restart BlueGenes.

**Add it to the report page layout.** Installing a tool is not enough when
the mine has a saved report page layout for `Gene` (HumanMine has one, read
from `<mine>/service/bluegenes-properties`, key `layout.report`): only
mines without a saved layout show every installed tool automatically. Log
in to BlueGenes as the mine's superuser, open **Admin**, and under **Report
page layout** select the class `Gene`, open the `Genomics` category, add
*JBrowse 2 Genome Browser* from the "Available classes, tools and templates"
box, and **Save changes**. To replace JBrowse 1 rather than show both,
also remove *JBrowse Genome Browser* from the category, as on HumanMine and
FlyMine. The layout is stored in the mine, so it applies to every user at
once with no restart; to undo, reverse the change and save again. The
JBrowse 1 tool can stay installed, and the classic webapp keeps using the
JBrowse 1 container.

## Development

```sh
npm install
npm test         # node --test: URL building, main() against stubs, bundle shape
npm run build    # esbuild -> dist/bundle.js (+ copies style.css); commit dist/
```

**Bump `version` in `package.json` with every change to `dist/` or
`config.json`.** BlueGenes loads the tool as
`/tools/@intermine/bluegenes-jbrowse2-tool/dist/bundle.js?v=<version>`, and
the bundle is served without cache headers, so with an unchanged version
visitors' browsers can keep the old bundle for days or weeks. After
installing a new build on a mine, `/api/tools/all` should show the new
version. (The `tools.edn` entry records the installed version; update it to
match when reinstalling.)

`main()` takes injectable dependencies (`queryData`, `fetch`, `document`) as a
sixth argument for tests; BlueGenes calls it with five. The repository's
browser test (`plugin/`, `npm run test:e2e`) opens the URL this tool builds
for PAX6 in the real JBrowse 2 and checks the view and tracks.
