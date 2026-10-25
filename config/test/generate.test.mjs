import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { parseCli } from '../generate.mjs'
import {
  assemblyName,
  buildAssemblyConfig,
  generateConfig,
  mergeConfigs,
  trackListUrl,
} from '../lib.mjs'

const fixture = name =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'))
const HUMAN = 'https://www.humanmine.org/humanmine'
const FLY = 'https://www.flymine.org/flymine'
const human = fixture('humanmine-9606-trackList.json')
const fly = fixture('flymine-7227-trackList.json')

const fakeFetch = byUrl => async url =>
  url in byUrl
    ? new Response(JSON.stringify(byUrl[url]))
    : new Response('nope', { status: 404 })

test('track list url', () => {
  assert.equal(trackListUrl(`${HUMAN}/`, '9606'), `${HUMAN}/service/jbrowse/config/9606/trackList.json`)
})

test('assembly names follow dataset_id, lower-cased', () => {
  assert.equal(assemblyName(HUMAN, '9606', 'Humanmine-9606'), 'humanmine-9606')
  assert.equal(assemblyName(FLY, '7227', 'FlyMine-7227'), 'flymine-7227')
  assert.equal(assemblyName(`${HUMAN}/`, '9606'), 'humanmine-9606')
})

test('human config: assembly, sequence adapter, plugin-ready tracks', () => {
  const c = buildAssemblyConfig(human, HUMAN, '9606')
  const base = `${HUMAN}/service/jbrowse/9606`
  assert.equal(c.assemblies.length, 1)
  assert.equal(c.assemblies[0].name, 'humanmine-9606')
  assert.deepEqual(c.assemblies[0].sequence, {
    type: 'ReferenceSequenceTrack',
    trackId: 'humanmine-9606-sequence',
    adapter: { type: 'InterMineSequenceAdapter', baseUrl: base },
  })
  // 101 tracks: 100 feature classes + sequence; SequenceFeature is skipped
  assert.equal(c.tracks.length, 99)
  assert.ok(!c.tracks.some(t => t.adapter.intermineClass === 'SequenceFeature'))
  const gene = c.tracks.find(t => t.trackId === 'humanmine-9606-Gene')
  assert.deepEqual(gene, {
    type: 'FeatureTrack',
    trackId: 'humanmine-9606-Gene',
    name: 'Gene',
    category: ['Features'],
    assemblyNames: ['humanmine-9606'],
    adapter: { type: 'InterMineFeatureAdapter', baseUrl: base, intermineClass: 'Gene' },
  })
})

test('transcript classes nest exons, others do not', () => {
  const c = buildAssemblyConfig(human, HUMAN, '9606')
  const by = id => c.tracks.find(t => t.trackId === `humanmine-9606-${id}`).adapter
  assert.equal(by('Transcript').nestExons, true)
  assert.equal(by('MRNA').nestExons, true)
  assert.equal(by('Gene').nestExons, undefined)
  assert.equal(by('Exon').nestExons, undefined)
  const none = buildAssemblyConfig(human, HUMAN, '9606', { nestExons: [] })
  assert.ok(none.tracks.every(t => t.adapter.nestExons === undefined))
})

test('include/exclude options', () => {
  const only = buildAssemblyConfig(human, HUMAN, '9606', { include: ['Gene', 'MRNA'] })
  assert.deepEqual(only.tracks.map(t => t.trackId).sort(), ['humanmine-9606-Gene', 'humanmine-9606-MRNA'])
  const all = buildAssemblyConfig(human, HUMAN, '9606', { exclude: [] })
  assert.equal(all.tracks.length, 100)
  assert.ok(all.tracks.some(t => t.adapter.intermineClass === 'SequenceFeature'))
})

test('text search adapter is configured for the assembly and opens class tracks', () => {
  const c = buildAssemblyConfig(human, HUMAN, '9606')
  assert.deepEqual(c.aggregateTextSearchAdapters, [
    {
      type: 'InterMineTextSearchAdapter',
      textSearchAdapterId: 'humanmine-9606-names',
      baseUrl: `${HUMAN}/service/jbrowse/9606`,
      trackIdPrefix: 'humanmine-9606-',
      assemblyNames: ['humanmine-9606'],
    },
  ])
})

test('a track list without a reference sequence track is rejected', () => {
  const bad = { ...human, tracks: human.tracks.filter(t => !t.query.reference) }
  assert.throws(() => buildAssemblyConfig(bad, HUMAN, '9606'), /reference sequence/)
})

test('merged config serves several assemblies with one plugin entry', async () => {
  const config = await generateConfig(
    [{ mineRoot: HUMAN, taxon: '9606' }, { mineRoot: FLY, taxon: '7227' }],
    {
      pluginUrl: 'https://jbrowse2.intermine.org/plugin.js',
      fetch: fakeFetch({ [trackListUrl(HUMAN, '9606')]: human, [trackListUrl(FLY, '7227')]: fly }),
    },
  )
  assert.deepEqual(config.assemblies.map(a => a.name), ['humanmine-9606', 'flymine-7227'])
  assert.deepEqual(config.plugins, [{ name: 'InterMine', url: 'https://jbrowse2.intermine.org/plugin.js' }])
  assert.equal(config.configuration.disableAnalytics, true)
  assert.equal(config.aggregateTextSearchAdapters.length, 2)
  const ids = config.tracks.map(t => t.trackId)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes('flymine-7227-Gene'))
  assert.ok(config.tracks.find(t => t.trackId === 'flymine-7227-Gene').adapter.baseUrl.startsWith(FLY))
})

test('duplicate assemblies are rejected', () => {
  const f = buildAssemblyConfig(human, HUMAN, '9606')
  assert.throws(() => mergeConfigs([f, f]), /Duplicate assembly/)
})

test('HTTP failures name the url', async () => {
  await assert.rejects(
    generateConfig([{ mineRoot: HUMAN, taxon: '1' }], { fetch: fakeFetch({}) }),
    /HTTP 404 fetching .*config\/1\/trackList\.json/,
  )
})

test('cli parsing', () => {
  const c = parseCli([HUMAN, '9606', FLY, '7227', '-o', 'x.json', '--exclude', 'A, B', '--nest-exons', ''])
  assert.deepEqual(c.datasets, [{ mineRoot: HUMAN, taxon: '9606' }, { mineRoot: FLY, taxon: '7227' }])
  assert.equal(c.out, 'x.json')
  assert.deepEqual(c.opts, { exclude: ['A', 'B'], nestExons: [] })
  assert.throws(() => parseCli([HUMAN]), /pairs/)
  assert.throws(() => parseCli(['humanmine', '9606']), /http/)
  assert.throws(() => parseCli([HUMAN, 'human']), /taxon/)
  assert.equal(parseCli(['-h']).help, true)
})

test('cli prints usage on bad arguments', () => {
  const script = fileURLToPath(new URL('../generate.mjs', import.meta.url))
  assert.throws(() => execFileSync('node', [script], { stdio: 'pipe' }), e => e.status === 2 && /Usage/.test(String(e.stderr)))
})
