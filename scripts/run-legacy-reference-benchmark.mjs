import { existsSync } from 'node:fs'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'
import process from 'node:process'
import { chromium } from 'playwright'

const LEGACY_REPO_DIR = process.env.LEGACY_REPO_DIR ?? '/Users/zhujiruo/Desktop/szlab/matsci-ui'
const STORYBOOK_PORT = Number(process.env.LEGACY_STORYBOOK_PORT ?? 6007)
const STORYBOOK_URL = process.env.LEGACY_STORYBOOK_URL ?? `http://127.0.0.1:${STORYBOOK_PORT}`
const STORY_PATH = '/?path=/story/crystal-toolkit-viewer-legacy-many-round-benchmark--protocol'
const REPO_DIR = fileURLToPath(new URL('..', import.meta.url))
const OUTPUT_DIR = join(REPO_DIR, 'benchmark-results', 'legacy-reference')
const OUTPUT_PATH = join(OUTPUT_DIR, 'latest.json')
const OUTPUT_MARKDOWN_PATH = join(OUTPUT_DIR, 'latest.md')
const TEMP_STORY_PATH = join(LEGACY_REPO_DIR, 'src', 'stories', '__codexLegacyManyRoundBenchmark.stories.tsx')
const TEMP_CSS_PATH = join(LEGACY_REPO_DIR, 'src', 'stories', 'legacy-many-round-benchmark.css')
const MAX_WAIT_MS = Number(process.env.LEGACY_BENCHMARK_TIMEOUT_MS ?? 2 * 60 * 60 * 1000)

const STORY_SOURCE = String.raw`import { useCallback, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import * as THREE from 'three'
import Scene from '../components/crystal-toolkit/scene/Scene'
import { Renderer, type JSON3DObject, type ThreePosition } from '../components/crystal-toolkit/scene/constants'
import type { SceneJsonObject } from '../components/crystal-toolkit/scene/simple-scene'
import './legacy-many-round-benchmark.css'

const ATOM_COUNTS = [1000, 5000, 10000]
const ROUND_COUNT = 30
const SAMPLE_COUNT = 8
const WARMUP_COUNT = 5
const HOVER_EVENT_COUNT = 240
const INTERACTIVE_ROUND_COUNT = 5
const LIFECYCLE_REPLACEMENTS = 30
const MEMORY_SHORT_DELAY_MS = 3000
const MEMORY_LONG_DELAY_MS = 6000
const MEMORY_PRESSURE_SETTLE_MS = 2000
const settings = { renderer: Renderer.WEBGL, background: '#ffffff', staticScene: true, secondaryObjectView: false, sphereSegments: 20 }
const percentile = (values: number[], ratio: number) => {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ?? 0
}
const summarize = (values: number[]) => {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return { n: values.length, mean, median: percentile(values, 0.5), p95: percentile(values, 0.95), p99: percentile(values, 0.99), stdev: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length), min: Math.min(...values), max: Math.max(...values) }
}
const statsFor = <T,>(rounds: T[], selector: (round: T) => number) => summarize(rounds.map(selector))
type MemorySample = number | null
const readHeap = (): MemorySample => {
  const used = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize
  return typeof used === 'number' ? used : null
}
const waitForFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const waitForMemorySample = async (delayMs: number) => {
  if (readHeap() === null) return null
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
  await waitForFrame()
  return readHeap()
}
const waitForMemoryReclamation = async () => {
  const after3Seconds = await waitForMemorySample(MEMORY_SHORT_DELAY_MS)
  const after6Seconds = await waitForMemorySample(MEMORY_LONG_DELAY_MS - MEMORY_SHORT_DELAY_MS)
  if (readHeap() === null) return { after3Seconds, after6Seconds, afterPressureSettled: null }
  for (let index = 0; index < 4; index += 1) {
    const pressure = new Uint8Array(8 * 1024 * 1024)
    pressure.fill(index)
    await waitForFrame()
  }
  await new Promise<void>((resolve) => setTimeout(resolve, MEMORY_PRESSURE_SETTLE_MS))
  await waitForFrame()
  return { after3Seconds, after6Seconds, afterPressureSettled: readHeap() }
}
const buildPositionGrid = (atomCount: number): ThreePosition[] => {
  const side = Math.ceil(Math.cbrt(atomCount))
  const positions: ThreePosition[] = []
  for (let index = 0; index < atomCount; index += 1) {
    const x = index % side
    const y = Math.floor(index / side) % side
    const z = Math.floor(index / (side * side))
    positions.push([(x - side / 2) * 1.35, (y - side / 2) * 1.35, (z - side / 2) * 1.35])
  }
  return positions
}
const createSceneData = (atomCount: number, interactive = false): SceneJsonObject & { name: string } => ({
  name: \`legacy-many-rounds-\${atomCount}-\${interactive ? 'interactive' : 'static'}\`,
  contents: [{ name: 'atoms', contents: [{ type: 'spheres' as JSON3DObject, positions: buildPositionGrid(atomCount), color: '#5d8fbe', radius: 0.46, clickable: interactive, tooltip: interactive ? 'Benchmark atom' : undefined }] }],
})
const getRenderer = (scene: Scene) => (scene as unknown as { renderer: THREE.WebGLRenderer }).renderer
const createScene = (mount: HTMLElement, data: SceneJsonObject) => new Scene(data, mount, settings, 0, 0, () => undefined, () => undefined)
const measureScene = async (mount: HTMLElement, data: SceneJsonObject, interactive = false) => {
  const memoryBefore = readHeap()
  const buildStart = performance.now()
  const scene = createScene(mount, data)
  scene.addToScene(data, true)
  const buildMs = performance.now() - buildStart
  const memoryAfterBuild = readHeap()
  let hoverRaycasts = 0
  if (interactive) {
    const legacyScene = scene as unknown as { getClickedReference: (...args: unknown[]) => unknown }
    const originalGetClickedReference = legacyScene.getClickedReference.bind(scene)
    legacyScene.getClickedReference = (...args) => {
      hoverRaycasts += 1
      return originalGetClickedReference(...args)
    }
  }
  await waitForFrame()
  await waitForFrame()
  for (let index = 0; index < WARMUP_COUNT; index += 1) scene.renderScene()
  const samples: number[] = []
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const sampleStart = performance.now()
    scene.renderScene()
    await waitForFrame()
    scene.renderScene()
    await waitForFrame()
    samples.push((performance.now() - sampleStart) / 2)
  }
  if (interactive) {
    const canvas = getRenderer(scene).domElement
    for (let index = 0; index < HOVER_EVENT_COUNT; index += 1) {
      canvas.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 24 + (index % 80), clientY: 24 }))
    }
    await waitForFrame()
    await waitForFrame()
  }
  const renderer = getRenderer(scene)
  const result = {
    buildMs,
    medianMs: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99),
    meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    stdevMs: Math.sqrt(samples.reduce((sum, value) => sum + (value - samples.reduce((total, sample) => total + sample, 0) / samples.length) ** 2, 0) / samples.length),
    drawCalls: renderer.info.render.calls,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    triangles: renderer.info.render.triangles,
    memory: { before: memoryBefore, afterBuild: memoryAfterBuild, afterDestroy: null, after3Seconds: null, after6Seconds: null, afterPressureSettled: null },
  }
  scene.onDestroy()
  await waitForFrame()
  result.memory.afterDestroy = readHeap()
  Object.assign(result.memory, await waitForMemoryReclamation())
  return interactive ? { ...result, hoverRaycasts } : result
}
const statsForMemory = <T,>(rounds: T[], selector: (round: T) => MemorySample) => {
  const values = rounds.map(selector).filter((value): value is number => typeof value === 'number')
  return values.length > 0 ? summarize(values) : null
}
const statsForDelta = <T,>(rounds: T[], base: (round: T) => MemorySample, value: (round: T) => MemorySample) => {
  const values = rounds.map((round) => { const left = base(round); const right = value(round); return typeof left === 'number' && typeof right === 'number' ? right - left : null }).filter((value): value is number => typeof value === 'number')
  return values.length > 0 ? summarize(values) : null
}
const runScenario = async (mount: HTMLElement, atomCount: number, update: (label: string) => void) => {
  const rounds = []
  const data = createSceneData(atomCount)
  for (let round = 0; round < ROUND_COUNT; round += 1) { update(\`旧版静态 \${atomCount}：\${round + 1}/\${ROUND_COUNT}\`); rounds.push(await measureScene(mount, data)) }
  return { atomCount, rounds, summary: { buildMs: statsFor(rounds, (round) => round.buildMs), medianFrameMs: statsFor(rounds, (round) => round.medianMs), p95FrameMs: statsFor(rounds, (round) => round.p95Ms), p99FrameMs: statsFor(rounds, (round) => round.p99Ms), drawCalls: statsFor(rounds, (round) => round.drawCalls), geometries: statsFor(rounds, (round) => round.geometries), textures: statsFor(rounds, (round) => round.textures), memoryAfterBuild: statsForMemory(rounds, (round) => round.memory.afterBuild), memoryAfterDestroy: statsForMemory(rounds, (round) => round.memory.afterDestroy), memoryAfter3Seconds: statsForMemory(rounds, (round) => round.memory.after3Seconds), memoryAfter6Seconds: statsForMemory(rounds, (round) => round.memory.after6Seconds), memoryAfterPressureSettled: statsForMemory(rounds, (round) => round.memory.afterPressureSettled), stableDelta3Seconds: statsForDelta(rounds, (round) => round.memory.afterBuild, (round) => round.memory.after3Seconds), stableDelta6Seconds: statsForDelta(rounds, (round) => round.memory.afterBuild, (round) => round.memory.after6Seconds), pressureSettledDelta: statsForDelta(rounds, (round) => round.memory.afterBuild, (round) => round.memory.afterPressureSettled) } }
}
const runInteractive = async (mount: HTMLElement, update: (label: string) => void) => {
  const rounds = []
  const data = createSceneData(1000, true)
  for (let round = 0; round < INTERACTIVE_ROUND_COUNT; round += 1) { update(\`旧版交互：\${round + 1}/\${INTERACTIVE_ROUND_COUNT}\`); rounds.push(await measureScene(mount, data, true)) }
  return { rounds, summary: { buildMs: statsFor(rounds, (round) => round.buildMs), medianFrameMs: statsFor(rounds, (round) => round.medianMs), p95FrameMs: statsFor(rounds, (round) => round.p95Ms), drawCalls: statsFor(rounds, (round) => round.drawCalls), geometries: statsFor(rounds, (round) => round.geometries), textures: statsFor(rounds, (round) => round.textures), triangles: statsFor(rounds, (round) => round.triangles), memoryAfterBuild: statsForMemory(rounds, (round) => round.memory.afterBuild), memoryAfterDestroy: statsForMemory(rounds, (round) => round.memory.afterDestroy), memoryAfter3Seconds: statsForMemory(rounds, (round) => round.memory.after3Seconds), memoryAfter6Seconds: statsForMemory(rounds, (round) => round.memory.after6Seconds), memoryAfterPressureSettled: statsForMemory(rounds, (round) => round.memory.afterPressureSettled), stableDelta3Seconds: statsForDelta(rounds, (round) => round.memory.afterBuild, (round) => round.memory.after3Seconds), stableDelta6Seconds: statsForDelta(rounds, (round) => round.memory.afterBuild, (round) => round.memory.after6Seconds), pressureSettledDelta: statsForDelta(rounds, (round) => round.memory.afterBuild, (round) => round.memory.afterPressureSettled), hoverRaycasts: statsFor(rounds, (round) => round.hoverRaycasts) } }
}
const runLifecycle = async (mount: HTMLElement, update: (label: string) => void) => {
  const rounds = []
  const data = createSceneData(1000)
  for (let round = 0; round < ROUND_COUNT; round += 1) {
    update(\`旧版生命周期：\${round + 1}/\${ROUND_COUNT}\`)
    const scene = createScene(mount, data)
    const geometryCounts: number[] = []
    const textureCounts: number[] = []
    for (let replacement = 0; replacement < LIFECYCLE_REPLACEMENTS; replacement += 1) { scene.addToScene(data, true); scene.renderScene(); await waitForFrame(); const renderer = getRenderer(scene); geometryCounts.push(renderer.info.memory.geometries); textureCounts.push(renderer.info.memory.textures) }
    const memoryAfterBuild = readHeap()
    scene.onDestroy()
    await waitForFrame()
    rounds.push({ geometryCounts, textureCounts, memory: { before: null, afterBuild: memoryAfterBuild, afterDestroy: readHeap(), ...(await waitForMemoryReclamation()) } })
  }
  const peakGeometry = rounds.map((round) => Math.max(...round.geometryCounts))
  const finalGeometry = rounds.map((round) => round.geometryCounts.at(-1) ?? 0)
  const peakTexture = rounds.map((round) => Math.max(...round.textureCounts))
  const finalTexture = rounds.map((round) => round.textureCounts.at(-1) ?? 0)
  const stableValues = rounds.map((round) => round.memory.after6Seconds).filter((value): value is number => typeof value === 'number')
  const first = stableValues[0] ?? null
  const last = stableValues.at(-1) ?? null
  return { rounds, peakGeometry: summarize(peakGeometry), finalGeometry: summarize(finalGeometry), peakTexture: summarize(peakTexture), finalTexture: summarize(finalTexture), memoryAfterBuild: statsForMemory(rounds, (round) => round.memory.afterBuild), memoryAfterDestroy: statsForMemory(rounds, (round) => round.memory.afterDestroy), memoryAfter3Seconds: statsForMemory(rounds, (round) => round.memory.after3Seconds), memoryAfter6Seconds: statsForMemory(rounds, (round) => round.memory.after6Seconds), memoryAfterPressureSettled: statsForMemory(rounds, (round) => round.memory.afterPressureSettled), stableDelta6Seconds: statsForDelta(rounds, (round) => round.memory.afterBuild, (round) => round.memory.after6Seconds), pressureSettledDelta: statsForDelta(rounds, (round) => round.memory.afterBuild, (round) => round.memory.afterPressureSettled), stableHeapTrend: { first, last, delta: first !== null && last !== null ? last - first : null, slopePerRound: null } }
}
const formatMiB = (value: number | null) => value === null ? 'n/a' : \`\${(value / 1024 / 1024).toFixed(1)} MiB\`
const formatStats = (value: { median: number, p95: number } | null) => value ? \`\${formatMiB(value.median)} / \${formatMiB(value.p95)}\` : 'n/a'
const reportToMarkdown = (report) => [
  '# Crystal Toolkit 参考实现旧版固定基线',
  '',
  '- 旧版基线仅运行一次，后续性能回归只测当前组件库。',
  '',
  '| 原子数 | 构建耗时中位数 / P95 | 帧间隔中位数 / P95 | draw calls | geometry |',
  '| ---: | ---: | ---: | ---: | ---: |',
  ...report.static.map((scenario) => \`| \${scenario.atomCount.toLocaleString()} | \${scenario.summary.buildMs.median.toFixed(2)} / \${scenario.summary.buildMs.p95.toFixed(2)} ms | \${scenario.summary.medianFrameMs.median.toFixed(2)} / \${scenario.summary.medianFrameMs.p95.toFixed(2)} ms | \${scenario.summary.drawCalls.median.toFixed(2)} | \${scenario.summary.geometries.median.toFixed(2)} |\`),
  '',
  \`交互构建耗时中位数 / P95：\${report.interactive.summary.buildMs.median.toFixed(2)} / \${report.interactive.summary.buildMs.p95.toFixed(2)} ms；hover raycast：\${report.interactive.summary.hoverRaycasts.median.toFixed(2)} / \${report.interactive.summary.hoverRaycasts.p95.toFixed(2)}\`,
  '',
  '| 场景 | 构建后 Heap | 销毁后一帧 | 销毁 3 秒后 | 销毁 6 秒后 | 压力释放稳定后 |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  ...report.static.map((scenario) => \`| \${scenario.atomCount.toLocaleString()} | \${formatStats(scenario.summary.memoryAfterBuild)} | \${formatStats(scenario.summary.memoryAfterDestroy)} | \${formatStats(scenario.summary.memoryAfter3Seconds)} | \${formatStats(scenario.summary.memoryAfter6Seconds)} | \${formatStats(scenario.summary.memoryAfterPressureSettled)} |\`),
  '',
  \`生命周期 geometry 峰值/最终值：\${report.lifecycle.peakGeometry.median.toFixed(2)} / \${report.lifecycle.finalGeometry.median.toFixed(2)}；texture 峰值/最终值：\${report.lifecycle.peakTexture.median.toFixed(2)} / \${report.lifecycle.finalTexture.median.toFixed(2)}。\`,
].join('\\n')
type LegacyWindow = Window & { __CRYSTAL_TOOLKIT_LEGACY_REPORT_JSON__?: string, __CRYSTAL_TOOLKIT_LEGACY_PROGRESS__?: string }
const meta = { title: 'Crystal Toolkit/Viewer Legacy Many Round Benchmark' } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>
export const Protocol: Story = { render: () => <LegacyBenchmark /> }
function LegacyBenchmark() {
  const mountRef = useRef<HTMLDivElement>(null)
  const runningRef = useRef(false)
  const [status, setStatus] = useState('未运行')
  const run = useCallback(async () => {
    const mount = mountRef.current
    if (!mount || runningRef.current) return
    runningRef.current = true
    try {
      const update = (label: string) => {
        setStatus(label)
        ;(window as LegacyWindow).__CRYSTAL_TOOLKIT_LEGACY_PROGRESS__ = label
      }
      const staticResults = []
      for (const atomCount of ATOM_COUNTS) staticResults.push(await runScenario(mount, atomCount, update))
      const interactive = await runInteractive(mount, update)
      const lifecycle = await runLifecycle(mount, update)
      const report = { protocol: { roundCount: ROUND_COUNT, interactiveRoundCount: INTERACTIVE_ROUND_COUNT, sampleCount: SAMPLE_COUNT, warmupCount: WARMUP_COUNT, hoverEventCount: HOVER_EVENT_COUNT, lifecycleReplacements: LIFECYCLE_REPLACEMENTS }, environment: { devicePixelRatio: window.devicePixelRatio, heapAvailable: readHeap() !== null, userAgent: navigator.userAgent, completedAt: new Date().toISOString() }, static: staticResults, interactive, lifecycle }
      const benchmarkWindow = window as LegacyWindow
      benchmarkWindow.__CRYSTAL_TOOLKIT_LEGACY_REPORT_JSON__ = JSON.stringify(report)
      setStatus('已完成')
    } catch (error) { setStatus(\`运行失败：\${error instanceof Error ? error.message : String(error)}\`) }
    finally { runningRef.current = false }
  }, [])
  return <div className="legacy-benchmark"><button onClick={run}>运行旧版固定基线</button><strong>{status}</strong><div ref={mountRef} className="legacy-mount" /></div>
}
`.replaceAll('\\`', '`').replaceAll('\\${', '${')

const CSS_SOURCE = '.legacy-benchmark{padding:16px}.legacy-benchmark button{margin-right:12px}.legacy-mount{width:720px;height:720px;position:relative}'


const firstExecutable = async (paths) => {
  for (const path of paths) {
    try { await access(path); return path } catch { /* Try next candidate. */ }
  }
  return null
}

const findChromiumExecutable = async () => {
  const explicit = process.env.CHROMIUM_EXECUTABLE_PATH
  if (explicit) return firstExecutable([explicit])

  const bundled = chromium.executablePath()
  const bundledPath = await firstExecutable([bundled])
  if (bundledPath) return bundledPath

  const cacheDir = join(homedir(), 'Library', 'Caches', 'ms-playwright')
  const entries = await readFile(join(cacheDir, '.lastVersion')).catch(() => null)
  const candidates = entries ? [
    join(cacheDir, `chromium-${entries.toString().trim()}`, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
    join(cacheDir, `chromium-${entries.toString().trim()}`, 'chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
  ] : []
  return firstExecutable(candidates)
}

const isReady = async () => { try { return (await fetch(STORYBOOK_URL)).ok } catch { return false } }

const startStorybook = async () => {
  if (await isReady()) return null
  const child = spawn('pnpm', ['exec', 'storybook', 'dev', '--port', String(STORYBOOK_PORT), '--no-open', '--disable-telemetry'], { cwd: LEGACY_REPO_DIR, env: process.env, stdio: 'inherit' })
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) { if (await isReady()) return child; await sleep(1000) }
  child.kill('SIGTERM')
  throw new Error(`Reference Storybook did not become ready at ${STORYBOOK_URL}`)
}

const getFrame = (page) => page.frames().find((frame) => frame.url().includes('/iframe.html'))
const readFrameText = async (frame) => frame.locator('body').innerText().catch(() => '')
const waitForStatus = async (frame) => {
  const deadline = Date.now() + MAX_WAIT_MS
  let lastProgress = ''
  while (Date.now() < deadline) {
    const text = await readFrameText(frame)
    const progress = await frame.evaluate(() => (window).__CRYSTAL_TOOLKIT_LEGACY_PROGRESS__ ?? '').catch(() => '')
    if (progress && progress !== lastProgress) {
      console.log(`[legacy-benchmark] ${progress}`)
      lastProgress = progress
    }
    if (!text && frame.url().includes('error')) throw new Error(`Legacy Storybook iframe failed: ${frame.url()}`)
    const status = text.split('\n').map((line) => line.trim()).find((line) => line === '已完成' || line.startsWith('运行失败：'))
    if (status === '已完成') return
    if (status?.startsWith('运行失败：')) throw new Error(status)
    await sleep(5000)
  }
  throw new Error('Legacy benchmark timeout exceeded')
}

const run = async () => {
  if (existsSync(OUTPUT_PATH) && !process.argv.includes('--force')) throw new Error(`Legacy baseline already exists: ${OUTPUT_PATH}. Use --force only to replace it.`)
  if (!existsSync(join(LEGACY_REPO_DIR, 'node_modules'))) throw new Error(`Reference dependencies are missing: ${LEGACY_REPO_DIR}`)
  if (existsSync(TEMP_STORY_PATH) || existsSync(TEMP_CSS_PATH)) throw new Error('Reference repository already contains a temporary benchmark file; refusing to overwrite it.')
  const executablePath = await findChromiumExecutable()
  if (!executablePath) throw new Error('Chromium executable not found. Set CHROMIUM_EXECUTABLE_PATH.')
  let temporaryFilesCreated = false
  let storybook = null
  try {
    await writeFile(TEMP_STORY_PATH, STORY_SOURCE)
    await writeFile(TEMP_CSS_PATH, CSS_SOURCE)
    temporaryFilesCreated = true
    storybook = await startStorybook()
    const browser = await chromium.launch({ executablePath, headless: true })
    try {
      const page = await browser.newPage()
      page.on('pageerror', (error) => console.error(`Legacy Storybook page error: ${error.message}`))
      page.on('requestfailed', (request) => console.error(`Legacy Storybook request failed: ${request.url()} ${request.failure()?.errorText ?? ''}`))
      await page.goto(`${STORYBOOK_URL}${STORY_PATH}`, { waitUntil: 'domcontentloaded' })
      let frame = getFrame(page)
      const frameDeadline = Date.now() + 120000
      while (!frame && Date.now() < frameDeadline) { await sleep(1000); frame = getFrame(page) }
      if (!frame) throw new Error('Legacy Storybook iframe was not found')
      const button = frame.getByRole('button', { name: '运行旧版固定基线' })
      try {
        await button.waitFor({ state: 'visible', timeout: 120000 })
      } catch {
        throw new Error(`Legacy Storybook story did not render. Frame text: ${(await readFrameText(frame)).slice(0, 500)}`)
      }
      await button.click()
      await waitForStatus(frame)
      const reportJson = await frame.evaluate(() => (window).__CRYSTAL_TOOLKIT_LEGACY_REPORT_JSON__)
      if (!reportJson) throw new Error('Legacy benchmark completed without a report')
      const report = JSON.parse(reportJson)
      const markdown = reportToMarkdown(report)
      await mkdir(OUTPUT_DIR, { recursive: true })
      await writeFile(OUTPUT_PATH, `${JSON.stringify({ ...report, baseline: { kind: 'reference-implementation', fixedAt: new Date().toISOString() } }, null, 2)}\n`)
      await writeFile(OUTPUT_MARKDOWN_PATH, markdown)
      console.log(`Legacy JSON: ${OUTPUT_PATH}`)
      console.log(`Legacy Markdown: ${OUTPUT_MARKDOWN_PATH}`)
    } finally { await browser.close() }
  } finally {
    if (storybook) storybook.kill('SIGTERM')
    if (temporaryFilesCreated) {
      await rm(TEMP_STORY_PATH, { force: true })
      await rm(TEMP_CSS_PATH, { force: true })
    }
  }
}

run().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
