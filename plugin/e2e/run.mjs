// Serves jbrowse-web + the built plugin + a generated config on localhost and drives it in
// headless Chromium (browser-check.cjs). Used by test/intermine.e2e.test.ts.
//
// Chromium comes from, in order: $E2E_CHROME (a local binary, with puppeteer
// resolvable via NODE_PATH or node_modules) or Docker
// (zenika/alpine-chrome:with-puppeteer). Returns { skipped } if neither exists.
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

import { e2eConfig, PLUGIN_FILE } from './config.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
export const JBROWSE_VERSION = '4.3.0'
export const JBROWSE_SHA256 = 'a9d42417102ee088a1cbf85c6d857c1065d66984ea6c56f3115ef9dd56d76702'
const cache = join(root, '.e2e-cache')
const IMAGE = 'zenika/alpine-chrome:with-puppeteer'

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json', '.wasm': 'application/wasm',
  '.txt': 'text/plain', '.svg': 'image/svg+xml',
}

export async function ensureJBrowseWeb() {
  const dir = join(cache, `jbrowse-web-v${JBROWSE_VERSION}`)
  if (existsSync(join(dir, 'index.html'))) return dir
  mkdirSync(cache, { recursive: true })
  const zip = join(cache, `jbrowse-web-v${JBROWSE_VERSION}.zip`)
  const url = `https://github.com/GMOD/jbrowse-components/releases/download/v${JBROWSE_VERSION}/jbrowse-web-v${JBROWSE_VERSION}.zip`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const sha = createHash('sha256').update(buf).digest('hex')
  if (sha !== JBROWSE_SHA256) throw new Error(`jbrowse-web checksum mismatch: ${sha}`)
  writeFileSync(zip, buf)
  mkdirSync(dir, { recursive: true })
  execFileSync('unzip', ['-q', '-o', zip, '-d', dir])
  return dir
}

export async function startServer(webDir, config) {
  config ??= await e2eConfig()
  const bundle = join(root, 'dist', PLUGIN_FILE)
  if (!existsSync(bundle)) throw new Error(`Build the plugin first (npm run build): ${bundle} missing`)
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let file
    if (path === '/config.json') {
      res.writeHead(200, { 'content-type': MIME['.json'] })
      res.end(JSON.stringify(config))
      return
    }
    if (path === `/${PLUGIN_FILE}`) file = bundle
    else {
      file = normalize(join(webDir, path === '/' ? 'index.html' : path))
      if (!file.startsWith(webDir)) { res.writeHead(403).end(); return }
    }
    if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end('not found'); return }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
    createReadStream(file).pipe(res)
  })
  return new Promise(resolve => {
    server.listen(0, '0.0.0.0', () => resolve({ server, port: server.address().port }))
  })
}

const sh = (cmd, args) => { try { execFileSync(cmd, args, { stdio: 'ignore' }); return true } catch { return false } }

function runProcess(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env } })
    let out = ''
    let err = ''
    p.stdout.on('data', d => (out += d))
    p.stderr.on('data', d => (err += d))
    p.on('close', code => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err || out}`))))
  })
}

/** Returns the parsed browser-check report, or `{ skipped: reason }`. */
export async function runBrowserCheck(port, outDir) {
  mkdirSync(outDir, { recursive: true })
  const url = `http://localhost:${port}`
  const proxy = process.env.https_proxy || process.env.HTTPS_PROXY || ''
  let out
  if (process.env.E2E_CHROME) {
    out = await runProcess('node', [join(here, 'browser-check.cjs'), url, outDir], {
      E2E_CHROME: process.env.E2E_CHROME, E2E_PROXY: proxy,
    })
  } else if (sh('docker', ['image', 'inspect', IMAGE]) || sh('docker', ['pull', '-q', IMAGE])) {
    execFileSync('chmod', ['777', outDir])
    out = await runProcess('docker', [
      'run', '--rm', '--network', 'host',
      '-e', `E2E_PROXY=${proxy}`,
      '-v', `${here}:/e2e:ro`, '-v', `${outDir}:/out`,
      '--entrypoint', 'sh', IMAGE,
      '-c', `cd /usr/src/app && NODE_PATH=/usr/src/app/node_modules node /e2e/browser-check.cjs ${url} /out`,
    ])
  } else {
    return { skipped: 'no Chromium: set E2E_CHROME or install Docker' }
  }
  return JSON.parse(out.trim().split('\n').pop())
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const webDir = await ensureJBrowseWeb()
  const { server, port } = await startServer(webDir)
  const outDir = process.argv[2] || join(root, 'test-screenshots')
  try {
    console.log(JSON.stringify(await runBrowserCheck(port, outDir), null, 2))
  } finally {
    server.close()
  }
}
