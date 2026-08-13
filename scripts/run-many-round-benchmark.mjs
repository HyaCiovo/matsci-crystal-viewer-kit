import { existsSync } from 'node:fs'
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'
import process from 'node:process'
import { chromium } from 'playwright'

const STORYBOOK_URL = process.env.STORYBOOK_URL ?? 'http://127.0.0.1:6006'
const STORY_PATH = '/?path=/story/crystal-toolkit-viewer-performance-benchmarks--many-round-protocol'
const REPO_DIR = fileURLToPath(new URL('..', import.meta.url))
const OUTPUT_DIR = join(REPO_DIR, 'benchmark-results')
const LEGACY_BASELINE_PATH = process.env.LEGACY_BASELINE_PATH ?? join(
  OUTPUT_DIR,
  'legacy-reference',
  'latest.json',
)
const README_PATH = join(REPO_DIR, 'README.md')
const TECHNICAL_DOC_PATH = process.env.TECHNICAL_DOC_PATH ?? join(
  REPO_DIR,
  'docs',
  'matsci-crystal-viewer-kit-technical-specification.md',
)
const MAX_WAIT_MS = Number(process.env.BENCHMARK_TIMEOUT_MS ?? 2 * 60 * 60 * 1000)
const POLL_MS = 5000
const BENCHMARK_PROTOCOL_VERSION = 'crystal-viewer-benchmark-v2'
const BENCHMARK_VIEWPORT = { width: 1280, height: 720 }
const BENCHMARK_DEVICE_SCALE_FACTOR = 1
const DOCUMENT_IMPROVEMENT_THRESHOLD = 0.2

const firstExecutable = async (paths) => {
  for (const path of paths) {
    try {
      await access(path)
      return path
    } catch {
      // Try the next known browser location.
    }
  }
  return null
}

const findChromiumExecutable = async () => {
  const explicit = process.env.CHROMIUM_EXECUTABLE_PATH
  if (explicit) return explicit

  const cacheDir = join(homedir(), 'Library', 'Caches', 'ms-playwright')
  let versions = []
  try {
    versions = await readdir(cacheDir)
  } catch {
    return null
  }
  const candidates = versions
    .filter((entry) => entry.startsWith('chromium-'))
    .sort()
    .reverse()
    .flatMap((entry) => [
      join(cacheDir, entry, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
      join(cacheDir, entry, 'chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
      join(cacheDir, entry, 'chrome-linux', 'chrome'),
    ])
  return firstExecutable(candidates)
}

const isStorybookReady = async () => {
  try {
    const response = await fetch(STORYBOOK_URL)
    return response.ok
  } catch {
    return false
  }
}

const startStorybookIfNeeded = async () => {
  if (await isStorybookReady()) return null

  const child = spawn('pnpm', [
    'exec',
    'storybook',
    'dev',
    '--port',
    '6006',
    '--no-open',
    '--disable-telemetry',
  ], {
    cwd: REPO_DIR,
    stdio: 'inherit',
  })
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    if (await isStorybookReady()) return child
    await sleep(1000)
  }
  child.kill('SIGTERM')
  throw new Error(`Storybook did not become ready at ${STORYBOOK_URL}`)
}

const formatNumber = (value) => Number(value).toFixed(2)
const formatMetricStats = (stats) => stats ? `${formatNumber(stats.median)} / ${formatNumber(stats.p95)}` : 'n/a'
const hasStrongReduction = (legacyStats, currentStats) => {
  if (!legacyStats || !currentStats) return false
  const isReduced = (legacyValue, currentValue) => typeof legacyValue === 'number'
    && typeof currentValue === 'number'
    && legacyValue > 0
    && (legacyValue - currentValue) / legacyValue >= DOCUMENT_IMPROVEMENT_THRESHOLD
  return isReduced(legacyStats.median, currentStats.median)
    && isReduced(legacyStats.p95, currentStats.p95)
}
const reductionLabel = (legacyStats, currentStats) => {
  const median = ((legacyStats.median - currentStats.median) / legacyStats.median) * 100
  const p95 = ((legacyStats.p95 - currentStats.p95) / legacyStats.p95) * 100
  return `中位数 ${median.toFixed(1)}%，P95 ${p95.toFixed(1)}%`
}
const hasComparableProtocol = (report) => report?.protocol?.version === BENCHMARK_PROTOCOL_VERSION
  && report.protocol.roundCount === 30
  && report.protocol.interactiveRoundCount === 30
  && report.protocol.sampleCount === 8
  && report.protocol.warmupCount === 5
  && report.protocol.hoverEventCount === 240
  && report.protocol.lifecycleReplacements === 30
  && report.protocol.mountWidth === 800
  && report.protocol.mountHeight === 600
  && report.protocol.sphereSegments === 20
  && report.protocol.deviceScaleFactor === BENCHMARK_DEVICE_SCALE_FACTOR
const getLegacyScenario = (legacy, atomCount) =>
  legacy?.static?.find((scenario) => scenario.atomCount === atomCount) ?? null
const buildStrongImprovementRows = (report, legacy) => {
  if (!hasComparableProtocol(report) || !hasComparableProtocol(legacy)) return []

  const rows = []
  for (const scenario of report.static) {
    const legacyScenario = getLegacyScenario(legacy, scenario.atomCount)
    if (!legacyScenario) continue
    const entries = [
      ['构建耗时 (ms)', legacyScenario.summary.buildMs, scenario.summary.buildMs],
      ['draw calls', legacyScenario.summary.drawCalls, scenario.summary.drawCalls],
    ]
    for (const [metric, legacyStats, currentStats] of entries) {
      if (!hasStrongReduction(legacyStats, currentStats)) continue
      rows.push({
        scene: `${scenario.atomCount.toLocaleString()} 原子静态`,
        metric,
        legacyStats,
        currentStats,
      })
    }
  }

  const interactiveEntries = [
    ['hover raycast 次数', legacy.interactive?.summary?.hoverRaycasts, report.interactive?.summary?.hoverRaycasts],
    ['draw calls', legacy.interactive?.summary?.drawCalls, report.interactive?.summary?.drawCalls],
  ]
  for (const [metric, legacyStats, currentStats] of interactiveEntries) {
    if (!hasStrongReduction(legacyStats, currentStats)) continue
    rows.push({ scene: '1,000 原子交互', metric, legacyStats, currentStats })
  }

  const lifecycleEntries = [
    ['geometry 峰值', legacy.lifecycle?.peakGeometry, report.lifecycle?.peakGeometry],
    ['geometry 最终值', legacy.lifecycle?.finalGeometry, report.lifecycle?.finalGeometry],
  ]
  for (const [metric, legacyStats, currentStats] of lifecycleEntries) {
    if (!hasStrongReduction(legacyStats, currentStats)) continue
    rows.push({ scene: '30 x 30 生命周期替换', metric, legacyStats, currentStats })
  }
  return rows
}
const replaceBenchmarkBlock = (source, block) => {
  const start = '<!-- BENCHMARK_RESULTS_START -->'
  const end = '<!-- BENCHMARK_RESULTS_END -->'
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end)
  if (startIndex < 0 || endIndex < startIndex) {
    throw new Error('Benchmark document markers were not found')
  }
  return `${source.slice(0, startIndex)}${start}\n${block.trim()}\n\n${end}${source.slice(endIndex + end.length)}`
}

const buildDocumentBenchmarkBlock = (report, formal = false, legacy = null) => {
  const resultHeading = formal ? '### 8.4 当前版本最新 30 轮结果' : '### 最新 30 轮性能结果'
  const environment = formal
    ? '本次测试使用当前基准报告记录的设备、浏览器 WebGL、DPR、球体分段和标签参数。表中格式为“30 轮中位数 / P95”。'
    : '测试环境和参数以本次自动报告中的 environment 字段为准。表中格式为“30 轮中位数 / P95”。'
  const protocolStatus = hasComparableProtocol(report) && hasComparableProtocol(legacy)
    ? '旧版参考实现与当前组件库均使用统一基准契约，可以比较大规模静态渲染、高频悬停输入和重复场景替换。'
    : '当前旧版固定报告来自旧协议，不用于量化结论；完成统一协议补测后，脚本将自动恢复可比较状态。'
  const strongImprovementRows = buildStrongImprovementRows(report, legacy)
  const strongImprovementBlock = strongImprovementRows.length > 0
    ? `#### 已验证的明显改善项

下表仅保留旧版和新版在相同 v2 协议下都完成 30 轮、且中位数与 P95 均至少改善 ${(DOCUMENT_IMPROVEMENT_THRESHOLD * 100).toFixed(0)}% 的指标。其余结果保留在原始报告中，不作为正文优化结论。

| 场景 | 指标 | 旧版中位数 / P95 | 新版中位数 / P95 | 降幅 |
| --- | --- | ---: | ---: | --- |
${strongImprovementRows.map(({ scene, metric, legacyStats, currentStats }) => `| ${scene} | ${metric} | ${formatMetricStats(legacyStats)} | ${formatMetricStats(currentStats)} | ${reductionLabel(legacyStats, currentStats)} |`).join('\n')}`
    : '本次同协议对照中没有同时满足中位数与 P95 至少改善 20% 的指标，因此正文不列详细性能数据。'
  return `${resultHeading}

${environment}

#### 对比范围

${protocolStatus}

- 大规模静态场景：观察实例化批处理对构建阶段、稳定帧和渲染提交的影响。
- 高频交互：在同一组连续指针输入下，观察 hover 拾取是否按帧合并。
- 生命周期：在重复场景替换后观察 geometry、texture 和延迟 Heap 快照，排查资源持续累积。

${strongImprovementBlock}

完整原始报告仍由基准脚本保存，用于版本回归和审计；JS Heap 仅表示 JavaScript 堆，不代表系统内存或 GPU VRAM，因此不纳入正文的详细性能对比。

${formal ? '### 8.5 数据解释限制' : ''}`.trim()
}

const syncDocuments = async (report, legacy = null) => {
  const readAndReplace = async (path, formal) => {
    if (!existsSync(path)) return
    const source = await readFile(path, 'utf8')
    await writeFile(path, replaceBenchmarkBlock(source, buildDocumentBenchmarkBlock(report, formal, legacy)))
  }
  await readAndReplace(README_PATH, false)
  await readAndReplace(TECHNICAL_DOC_PATH, true)
}

const getBenchmarkFrame = (page) =>
  page.frames().find((frame) => frame.url().includes('/iframe.html'))

const readStatus = async (frame) => {
  const text = await frame.locator('body').innerText()
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  return lines.find((line) => line === '已完成' || line.startsWith('运行失败：') || line.includes('/30')) ?? lines.slice(0, 5).join(' ')
}

const readJsonIfPresent = async (path) => {
  if (!existsSync(path)) return null
  return JSON.parse(await readFile(path, 'utf8'))
}

const run = async () => {
  if (process.argv.includes('--sync-only')) {
    const report = await readJsonIfPresent(join(OUTPUT_DIR, 'latest.json'))
    const legacy = await readJsonIfPresent(LEGACY_BASELINE_PATH)
    if (!report) throw new Error(`Current benchmark report not found: ${join(OUTPUT_DIR, 'latest.json')}`)
    await syncDocuments(report, legacy)
    console.log(`Synchronized documents with legacy baseline: ${LEGACY_BASELINE_PATH}`)
    return
  }

  const storybook = await startStorybookIfNeeded()
  const executablePath = await findChromiumExecutable()
  if (!executablePath) {
    throw new Error('Chromium executable not found. Run `pnpm exec playwright install chromium` or set CHROMIUM_EXECUTABLE_PATH.')
  }
  const browser = await chromium.launch({ executablePath, headless: true })
  try {
    const context = await browser.newContext({
      viewport: BENCHMARK_VIEWPORT,
      deviceScaleFactor: BENCHMARK_DEVICE_SCALE_FACTOR,
    })
    const page = await context.newPage()
    await page.goto(`${STORYBOOK_URL}${STORY_PATH}`, { waitUntil: 'domcontentloaded' })
    const deadline = Date.now() + MAX_WAIT_MS
    let frame = getBenchmarkFrame(page)
    while (!frame && Date.now() < deadline) {
      await sleep(1000)
      frame = getBenchmarkFrame(page)
    }
    if (!frame) throw new Error('Storybook benchmark iframe was not found')

    await frame.getByRole('button', { name: '运行完整基准' }).click()
    while (Date.now() < deadline) {
      const status = await readStatus(frame)
      process.stdout.write(`[benchmark] ${status}\n`)
      if (status === '已完成') break
      if (status.startsWith('运行失败：')) throw new Error(status)
      await sleep(POLL_MS)
    }
    if (Date.now() >= deadline) throw new Error('Benchmark timeout exceeded')

    const report = await frame.evaluate(() => window.__CRYSTAL_TOOLKIT_MANY_ROUND_REPORT__)
    const markdown = await frame.evaluate(() => window.__CRYSTAL_TOOLKIT_MANY_ROUND_MARKDOWN__)
    if (!report || !markdown) throw new Error('Benchmark completed without an exported report')

    await mkdir(OUTPUT_DIR, { recursive: true })
    await writeFile(join(OUTPUT_DIR, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`)
    await writeFile(join(OUTPUT_DIR, 'latest.md'), markdown)
    const legacy = await readJsonIfPresent(LEGACY_BASELINE_PATH)
    await syncDocuments(report, legacy)
    console.log(`JSON: ${join(OUTPUT_DIR, 'latest.json')}`)
    console.log(`Markdown: ${join(OUTPUT_DIR, 'latest.md')}`)
    console.log(`README: ${README_PATH}`)
    if (existsSync(TECHNICAL_DOC_PATH)) console.log(`Technical document: ${TECHNICAL_DOC_PATH}`)
  } finally {
    await browser.close()
    if (storybook) storybook.kill('SIGTERM')
  }
}

if (!existsSync(new URL('../node_modules/playwright/package.json', import.meta.url))) {
  throw new Error('Playwright is not installed. Run pnpm install first.')
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
