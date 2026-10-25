#!/usr/bin/env node
// Usage: generate.mjs <mineRoot> <taxon> [<mineRoot> <taxon> ...] [options]
//   e.g. generate.mjs https://www.humanmine.org/humanmine 9606 https://www.flymine.org/flymine 7227 -o config.json
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

import { DEFAULT_EXCLUDE, DEFAULT_GENE_MODELS, DEFAULT_NEST_EXONS, DEFAULT_PLUGIN_URL, generateConfig } from './lib.mjs'

const HELP = `Usage: generate.mjs <mineRoot> <taxon> [<mineRoot> <taxon> ...] [options]

Generates a JBrowse 2 config.json for jbrowse-plugin-intermine from each mine's
service/jbrowse/config/<taxon>/trackList.json. Several mine/taxon pairs give
one config serving every assembly.

Options:
  -o, --out <file>        write here instead of stdout
      --plugin-url <url>  plugin bundle URL (default ${DEFAULT_PLUGIN_URL})
      --exclude <A,B>     classes to leave out (default ${DEFAULT_EXCLUDE.join(',')})
      --include <A,B>     only these classes (overrides --exclude)
      --gene-models <A,B> classes drawn as genes with transcripts, exons and CDS
                          (default ${DEFAULT_GENE_MODELS.join(',')})
      --nest-exons <A,B>  classes drawn as transcripts with exons and CDS
                          (default ${DEFAULT_NEST_EXONS.join(',')})
  -h, --help
`

export function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      'plugin-url': { type: 'string' },
      exclude: { type: 'string' },
      include: { type: 'string' },
      'gene-models': { type: 'string' },
      'nest-exons': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help) return { help: true }
  if (positionals.length === 0 || positionals.length % 2) {
    throw new Error('Expected pairs of <mineRoot> <taxon>')
  }
  const datasets = []
  for (let i = 0; i < positionals.length; i += 2) {
    const [mineRoot, taxon] = [positionals[i], positionals[i + 1]]
    if (!/^https?:\/\//.test(mineRoot)) throw new Error(`Mine root must be an http(s) URL: ${mineRoot}`)
    if (!/^\d+$/.test(taxon)) throw new Error(`Taxon must be an NCBI taxon id: ${taxon}`)
    datasets.push({ mineRoot, taxon })
  }
  const list = s => (s === undefined ? undefined : s.split(',').map(x => x.trim()).filter(Boolean))
  return {
    datasets,
    out: values.out,
    opts: {
      ...(values['plugin-url'] ? { pluginUrl: values['plugin-url'] } : {}),
      ...(values.exclude !== undefined ? { exclude: list(values.exclude) } : {}),
      ...(values.include !== undefined ? { include: list(values.include) } : {}),
      ...(values['gene-models'] !== undefined ? { geneModels: list(values['gene-models']) } : {}),
      ...(values['nest-exons'] !== undefined ? { nestExons: list(values['nest-exons']) } : {}),
    },
  }
}

async function main() {
  let cli
  try {
    cli = parseCli(process.argv.slice(2))
  } catch (e) {
    console.error(`${e.message}\n\n${HELP}`)
    process.exit(2)
  }
  if (cli.help) return console.log(HELP)
  const config = await generateConfig(cli.datasets, cli.opts)
  const json = `${JSON.stringify(config, null, 2)}\n`
  if (cli.out) {
    writeFileSync(cli.out, json)
    console.error(`Wrote ${cli.out}: ${config.assemblies.length} assembly(ies), ${config.tracks.length} tracks`)
  } else {
    process.stdout.write(json)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error(e.message)
    process.exit(1)
  })
}
