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

  const child = spawn('pnpm', ['run', 'storybook', '--', '--ci'], {
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
const formatMiB = (value) => typeof value === 'number' ? `${(value / 1024 / 1024).toFixed(1)} MiB` : 'n/a'
const formatStats = (stats) => stats ? `${formatMiB(stats.median)} / ${formatMiB(stats.p95)}` : 'n/a'
const formatMetricStats = (stats) => stats ? `${formatNumber(stats.median)} / ${formatNumber(stats.p95)}` : 'n/a'
const formatComparisonStats = (stats, suffix = '') => stats
  ? `${formatNumber(stats.median)} / ${formatNumber(stats.p95)}${suffix}`
  : '待同协议补测'
const getLegacyScenario = (legacy, atomCount) =>
  legacy?.static?.find((scenario) => scenario.atomCount === atomCount) ?? null
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
  const staticRows = report.static.map((scenario) => `| ${scenario.atomCount.toLocaleString()} 原子静态 | ${formatNumber(scenario.summary.buildMs.median)} / ${formatNumber(scenario.summary.buildMs.p95)} | ${formatNumber(scenario.summary.medianFrameMs.median)} / ${formatNumber(scenario.summary.medianFrameMs.p95)} | ${formatNumber(scenario.summary.p95FrameMs.median)} / ${formatNumber(scenario.summary.p95FrameMs.p95)} | ${formatNumber(scenario.summary.drawCalls.median)} | ${formatNumber(scenario.summary.geometries.median)} |`).join('\n')
  const comparisonRows = report.static.map((scenario) => {
    const legacyScenario = getLegacyScenario(legacy, scenario.atomCount)
    return `| ${scenario.atomCount.toLocaleString()} 原子静态 | ${formatComparisonStats(legacyScenario?.summary?.buildMs, ' ms')} | ${formatComparisonStats(scenario.summary.buildMs, ' ms')} | ${legacyScenario ? `${formatComparisonStats(legacyScenario.summary.drawCalls)} / ${formatComparisonStats(legacyScenario.summary.geometries)}` : '待同协议补测'} | ${formatComparisonStats(scenario.summary.drawCalls)} / ${formatComparisonStats(scenario.summary.geometries)} | ${legacyScenario ? '旧版与新版已按同协议实测；详细百分比见下方' : '旧版基线尚未生成'} |`
  }).join('\n')
  const legacyInteractive = legacy?.interactive?.summary
  const heapRows = [
    ...report.static.map((scenario) => `| ${scenario.atomCount.toLocaleString()} 原子静态 | ${formatStats(scenario.summary.memoryAfterBuild)} | ${formatStats(scenario.summary.memoryAfterDestroy)} | ${formatStats(scenario.summary.memoryAfter3Seconds)} | ${formatStats(scenario.summary.memoryAfter6Seconds)} | ${formatStats(scenario.summary.memoryAfterPressureSettled)} | ${formatStats(scenario.summary.stableDelta6Seconds)} |`),
    `| 1,000 原子交互 | ${formatStats(report.interactive.summary.memoryAfterBuild)} | ${formatStats(report.interactive.summary.memoryAfterDestroy)} | ${formatStats(report.interactive.summary.memoryAfter3Seconds)} | ${formatStats(report.interactive.summary.memoryAfter6Seconds)} | ${formatStats(report.interactive.summary.memoryAfterPressureSettled)} | ${formatStats(report.interactive.summary.stableDelta6Seconds)} |`,
  ].join('\n')
  const interactiveComparison = legacyInteractive
    ? `| 1,000 原子交互 | ${formatComparisonStats(legacyInteractive.buildMs, ' ms')} | ${formatComparisonStats(report.interactive.summary.buildMs, ' ms')} | ${formatComparisonStats(legacyInteractive.drawCalls)} / ${formatComparisonStats(legacyInteractive.geometries)} | ${formatComparisonStats(report.interactive.summary.drawCalls)} / ${formatComparisonStats(report.interactive.summary.geometries)} | 新版 240 次指针事件合并为 ${formatNumber(report.interactive.summary.hoverRaycasts.median)} 次拾取；旧版为 ${formatNumber(legacyInteractive.hoverRaycasts.median)} 次 |`
    : `| 1,000 原子交互 | 待同协议补测 | ${formatComparisonStats(report.interactive.summary.buildMs, ' ms')} | 待同协议补测 | ${formatComparisonStats(report.interactive.summary.drawCalls)} / ${formatComparisonStats(report.interactive.summary.geometries)} | 旧版基线尚未生成 |`
  const resultHeading = formal ? '### 8.4 当前版本最新 30 轮结果' : '### 最新 30 轮性能结果'
  const environment = formal
    ? '本次测试使用当前基准报告记录的设备、浏览器 WebGL、DPR、球体分段和标签参数。表中格式为“30 轮中位数 / P95”。'
    : '测试环境和参数以本次自动报告中的 environment 字段为准。表中格式为“30 轮中位数 / P95”。'
  return `${resultHeading}

${environment}

#### 旧实现与新实现的量化对照状态

旧实现来自参考仓库的源码路径，新实现来自当前组件库构建产物。当前自动脚本只在新组件库中运行；因此凡是旧实现没有同一机器、同一浏览器、同一场景、同一采样协议的实测值，统一写为“待同协议补测”，不使用源码差异推算百分比。新实现列出本次 30 轮中位数 / P95。

| 场景 | 旧实现构建耗时 | 新实现构建耗时 | 旧实现 draw calls/geometry | 新实现 draw calls/geometry | 量化结论 |
| --- | ---: | ---: | ---: | ---: | --- |
${comparisonRows}
${interactiveComparison}

这张表用于区分“已确认的实现优势”和“需要旧版复测才能声称的性能提升”。draw calls、geometry、hover raycast 和生命周期资源等指标的当前版本实测见下表；旧版数值必须在关闭当前优化路径、固定同一协议后补采。

| 场景 | 构建耗时${formal ? '（ms）' : ''} | 帧间隔中位数${formal ? '（ms）' : ''} | 帧间隔 P95${formal ? '（ms）' : ''} | draw calls | geometry |
| --- | ---: | ---: | ---: | ---: | ---: |
${staticRows}
| 1,000 原子交互 | ${formatNumber(report.interactive.summary.buildMs.median)} / ${formatNumber(report.interactive.summary.buildMs.p95)} | ${formatNumber(report.interactive.summary.medianFrameMs.median)} / ${formatNumber(report.interactive.summary.medianFrameMs.p95)} | ${formatNumber(report.interactive.summary.p95FrameMs.median)} / ${formatNumber(report.interactive.summary.p95FrameMs.p95)} | ${formatNumber(report.interactive.summary.drawCalls.median)} | ${formatNumber(report.interactive.summary.geometries.median)} |

240 个连续指针事件在本次基准中合并为 ${formatNumber(report.interactive.summary.hoverRaycasts.median)} 次实际 hover raycast。该结果反映当前合帧协议，不代表所有设备和所有输入序列都固定为该数值。

${formal ? '#### 8.4.2 交互内存和生命周期资源' : '### 最新 JS Heap 与生命周期资源结果'}

本次报告记录了浏览器 \`performance.memory.usedJSHeapSize\` 的 JS Heap 快照，单位为 MiB；它不是系统 RAM，也不是 GPU VRAM。每行依次记录构建后、销毁后一帧、销毁 3 秒后、销毁 6 秒后、压力缓冲释放稳定后的观测值和 6 秒相对构建差值。3 秒/6 秒值用于观察延迟 GC；压力释放稳定值不是强制 GC，也不能等同于正式 heap snapshot。

| 场景 | 构建后 | 销毁后一帧 | 销毁 3 秒后 | 销毁 6 秒后 | 压力释放稳定后 | 6 秒相对构建差值 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${heapRows}

生命周期测试为 ${report.protocol.roundCount} 轮 × ${report.protocol.lifecycleReplacements} 次同名场景替换，共 ${report.protocol.roundCount * report.protocol.lifecycleReplacements} 次替换；geometry 峰值/最终值为 ${formatMetricStats(report.lifecycle.peakGeometry)} / ${formatMetricStats(report.lifecycle.finalGeometry)}，texture 峰值/最终值为 ${formatMetricStats(report.lifecycle.peakTexture)} / ${formatMetricStats(report.lifecycle.finalTexture)}。6 秒稳定 Heap 首轮/末轮/总差值/每轮斜率为 ${formatMiB(report.lifecycle.stableHeapTrend.first)} / ${formatMiB(report.lifecycle.stableHeapTrend.last)} / ${formatMiB(report.lifecycle.stableHeapTrend.delta)} / ${formatMiB(report.lifecycle.stableHeapTrend.slopePerRound)}。生命周期 Heap 仍需结合页面基线和正式 heap snapshot 解释，不单独包装成系统内存释放比例。

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
    const page = await browser.newPage()
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
