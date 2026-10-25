// Runs inside a Chromium + puppeteer environment (see run.mjs). Loads JBrowse 2
// pages served by the e2e static server and prints one JSON report to stdout.
//
//   node browser-check.cjs <baseUrl> <outDir>
//
// Env: E2E_CHROME (default /usr/bin/chromium-browser), E2E_PROXY (optional
// http proxy, e.g. http://gateway.docker.internal:3128).
const puppeteer = require('puppeteer')

const [baseUrl, outDir = '.'] = process.argv.slice(2)
const ASSEMBLY = 'humanmine-9606'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const args = ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--ignore-certificate-errors']
if (process.env.E2E_PROXY) {
  args.push(`--proxy-server=${process.env.E2E_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1')
}

// Count canvases that contain at least one non-transparent pixel.
const countDrawnCanvases = () =>
  [...document.querySelectorAll('canvas')].filter(c => {
    try {
      const ctx = c.getContext('2d')
      if (!ctx || !c.width || !c.height) return false
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true
    } catch {}
    return false
  }).length

async function waitFor(fn, timeout = 90000, step = 1000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const v = await fn()
    if (v) return v
    await sleep(step)
  }
  return false
}

async function open(browser, name, query, withConfig = true) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1400, height: 900 })
  const errors = []
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  page.on('requestfailed', r => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`))
  await page.goto(`${baseUrl}/?${withConfig ? 'config=config.json&' : ''}${query}`, { waitUntil: 'domcontentloaded' })
  return { page, errors, name }
}

const shot = (page, name) => page.screenshot({ path: `${outDir}/${name}.png` })

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.E2E_CHROME || '/usr/bin/chromium-browser',
    headless: 'new',
    args,
  })
  const report = {}
  try {
    const scenario = async (name, fn) => {
      try {
        await fn()
      } catch (e) {
        report[name] = { ...(report[name] || {}), failure: String(e.message || e) }
      }
    }
    // 1. Gene + transcript (exon-nested) tracks over PAX6
    await scenario('features', async () => {
      const s = await open(
        browser,
        'features',
        `assembly=${ASSEMBLY}&loc=11:31,780,000..31,830,000&tracks=${ASSEMBLY}-Gene,${ASSEMBLY}-Transcript`,
      )
      const drawn = await waitFor(async () => {
        const n = await s.page.evaluate(countDrawnCanvases)
        return n >= 2 ? n : 0
      })
      await sleep(2000)
      await shot(s.page, 'features')
      report.features = { drawnCanvases: drawn || 0, errors: s.errors }
      await s.page.close()
    })
    // 1a. Gene models (caret introns, CDS thick, UTR thin) in both mines
    const models = {
      'models-human': `assembly=${ASSEMBLY}&loc=11:31,785,000..31,822,000&tracks=${ASSEMBLY}-Gene`,
      'models-fly': 'assembly=flymine-7227&loc=2L:7,495,000..7,582,000&tracks=flymine-7227-Gene,flymine-7227-MRNA',
      // close-up: CDS/UTR boundaries, short introns, 3' arrowheads (RapGAP1 is on the minus strand)
      'models-detail': 'assembly=flymine-7227&loc=2L:7,497,600..7,501,800&tracks=flymine-7227-Gene',
      // both strands: the 3' end of ELP4 (plus, carets up) beside PAX6 (minus, carets down)
      'models-strands': `assembly=${ASSEMBLY}&loc=11:31,740,000..31,800,000&tracks=${ASSEMBLY}-Gene`,
    }
    for (const [name, query] of Object.entries(models)) {
      await scenario(name, async () => {
        const s = await open(browser, name, query)
        const drawn = await waitFor(async () => {
          const n = await s.page.evaluate(countDrawnCanvases)
          return n >= 1 ? n : 0
        })
        await sleep(3000)
        await shot(s.page, name)
        report[name] = { drawnCanvases: drawn || 0, errors: s.errors }
        await s.page.close()
      })
    }
    // 1b. The URL the BlueGenes tool builds (no config param: the site's own config.json)
    if (process.env.E2E_TOOL_QUERY) {
      await scenario('tool', async () => {
        const s = await open(browser, 'tool', process.env.E2E_TOOL_QUERY, false)
        const drawn = await waitFor(async () => {
          const n = await s.page.evaluate(countDrawnCanvases)
          return n >= 2 ? n : 0
        })
        const box = 'input[placeholder="Search for location"]'
        await s.page.waitForSelector(box, { timeout: 60000 })
        const location = await s.page.$eval(box, el => el.value)
        await sleep(2000)
        await shot(s.page, 'tool')
        report.tool = { drawnCanvases: drawn || 0, location, errors: s.errors }
        await s.page.close()
      })
    }
    // 2. Reference sequence at base-pair zoom
    await scenario('sequence', async () => {
      const s = await open(
        browser,
        'sequence',
        `assembly=${ASSEMBLY}&loc=11:31,789,026..31,789,085&tracks=${ASSEMBLY}-sequence`,
      )
      const letters = await waitFor(async () => {
        const txt = await s.page.evaluate(() => document.body.innerText)
        return /[ACGT]{10}/.test(txt.replace(/\s/g, '')) ? true : false
      }, 60000).catch(() => false)
      await shot(s.page, 'sequence')
      report.sequence = { sequenceText: !!letters, errors: s.errors }
      await s.page.close()
    })
    // 3. Find a gene by name in the location box
    await scenario('search', async () => {
      const s = await open(browser, 'search', `assembly=${ASSEMBLY}&loc=1:1..100000&tracks=${ASSEMBLY}-Gene`)
      const box = 'input[placeholder="Search for location"]'
      await s.page.waitForSelector(box, { timeout: 60000 })
      // let the session finish loading (assemblies, text search adapters) before typing
      await waitFor(() => s.page.evaluate(() => !!window.JBrowseSession), 60000)
      await waitFor(async () => (await s.page.evaluate(countDrawnCanvases)) > 0, 60000)
      await s.page.click(box, { clickCount: 3 })
      await s.page.keyboard.type('PAX6', { delay: 50 })
      await sleep(1500)
      await s.page.keyboard.press('Enter')
      await sleep(3000)
      // multiple hits open a chooser dialog; take the first
      const dialogText = await s.page.evaluate(() => document.querySelector('[role="dialog"]')?.innerText || '')
      await shot(s.page, 'search-dialog')
      if (dialogText) {
        const clicked = await s.page.evaluate(() => {
          const row = [...document.querySelectorAll('[role="dialog"] [role="row"], [role="dialog"] tr')].find(r =>
            /^PAX6\b/.test(r.innerText.trim()),
          )
          const btn = row?.querySelector('button, [role="button"], a') || row
          if (btn) { btn.click(); return true }
          return false
        })
        report.searchDialogClicked = clicked
        await sleep(3000)
      }
      const loc = await waitFor(async () => {
        const v = await s.page.$eval(box, el => el.value)
        return /^11:/.test(v) ? v : ''
      }, 30000)
      await shot(s.page, 'search')
      report.search = { dialogText, location: loc || '', errors: s.errors }
      await s.page.close()
    })
  } finally {
    await browser.close()
  }
  console.log(JSON.stringify(report))
})().catch(e => {
  console.error(e)
  process.exit(1)
})
