# JBrowse 2 for InterMine

Work towards serving [JBrowse 2](https://jbrowse.org/jb2/) on InterMine
report pages, fed live from a mine's own web service, as
[intermineorg/jbrowse](https://github.com/intermineorg/jbrowse) does today
for JBrowse 1.

**Status: planning.** Nothing here runs yet. [PLAN.md](PLAN.md) is the
brief for whoever (or whatever) implements it: what InterMine already
provides, what has to be built, in which order, and how to check it. Read it
first.

Target layout once implemented:

| Path | Purpose |
|------|---------|
| `plugin/` | JBrowse 2 plugin (npm package) with InterMine feature, sequence and text-search adapters |
| `config/` | Generator that turns a mine's JBrowse 1 track list into a JBrowse 2 `config.json` |
| `Dockerfile`, `docker-compose.yml`, `default.conf` | JBrowse 2 web build plus generated configs behind nginx, laid out like intermineorg/jbrowse, intended for https://jbrowse2.intermine.org/ |

License: MIT.
