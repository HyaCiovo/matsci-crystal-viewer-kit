import { existsSync } from 'node:fs'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'
import process from 'node:process'
import { chromium } from 'playwright'

const REPO_DIR = fileURLToPath(new URL('..', import.meta.url))
// The reference repository is normally checked out next to this component library.
const LEGACY_REPO_DIR = process.env.LEGACY_REPO_DIR ?? join(REPO_DIR, '..', 'matsci-ui')
const STORYBOOK_PORT = Number(process.env.LEGACY_STORYBOOK_PORT ?? 6007)
const STORYBOOK_URL = process.env.LEGACY_STORYBOOK_URL ?? `http://127.0.0.1:${STORYBOOK_PORT}`
const STORY_PATH = '/?path=/story/crystal-toolkit-viewer-legacy-many-round-benchmark--protocol'
const OUTPUT_DIR = process.env.LEGACY_BENCHMARK_OUTPUT_DIR ?? join(REPO_DIR, 'benchmark-results', 'legacy-reference')
const OUTPUT_PATH = join(OUTPUT_DIR, 'latest.json')
const OUTPUT_MARKDOWN_PATH = join(OUTPUT_DIR, 'latest.md')
const TEMP_STORY_PATH = join(LEGACY_REPO_DIR, 'src', 'stories', '__codexLegacyManyRoundBenchmark.stories.tsx')
const TEMP_CSS_PATH = join(LEGACY_REPO_DIR, 'src', 'stories', 'legacy-many-round-benchmark.css')
const MAX_WAIT_MS = Number(process.env.LEGACY_BENCHMARK_TIMEOUT_MS ?? 2 * 60 * 60 * 1000)
const STORYBOOK_START_TIMEOUT_MS = 120000
const CHILD_STOP_TIMEOUT_MS = 10000
const BENCHMARK_VIEWPORT = { width: 1280, height: 720 }
const BENCHMARK_DEVICE_SCALE_FACTOR = 1
const STORY_QUERY_PARAMETERS = Object.entries({
  legacyRounds: process.env.LEGACY_BENCHMARK_ROUNDS,
  legacyInteractiveRounds: process.env.LEGACY_BENCHMARK_INTERACTIVE_ROUNDS,
  legacySampleCount: process.env.LEGACY_BENCHMARK_SAMPLE_COUNT,
  legacyWarmupCount: process.env.LEGACY_BENCHMARK_WARMUP_COUNT,
  legacyLifecycleReplacements: process.env.LEGACY_BENCHMARK_LIFECYCLE_REPLACEMENTS,
  legacyMemoryShortDelayMs: process.env.LEGACY_BENCHMARK_MEMORY_SHORT_DELAY_MS,
  legacyMemoryLongDelayMs: process.env.LEGACY_BENCHMARK_MEMORY_LONG_DELAY_MS,
  legacyMemoryPressureDelayMs: process.env.LEGACY_BENCHMARK_MEMORY_PRESSURE_DELAY_MS,
}).filter(([, value]) => value !== undefined && value !== '')
const STORY_URL = `${STORYBOOK_URL}${STORY_PATH}${STORY_QUERY_PARAMETERS.length > 0 ? `&${new URLSearchParams(STORY_QUERY_PARAMETERS).toString()}` : ''}`
const IS_FIXED_BASELINE_RUN = STORY_QUERY_PARAMETERS.length === 0
const GENERATED_STORY_MARKER = "title: 'Crystal Toolkit/Viewer Legacy Many Round Benchmark'"

const STORY_SOURCE = String.raw`import { useCallback, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import * as THREE from 'three'
import Scene from '../components/crystal-toolkit/scene/Scene'
import { Renderer, type JSON3DObject, type ThreePosition } from '../components/crystal-toolkit/scene/constants'
import type { SceneJsonObject } from '../components/crystal-toolkit/scene/simple-scene'
import './legacy-many-round-benchmark.css'

const readPositiveIntegerParameter = (name: string, fallback: number) => {
  const value = Number(new URLSearchParams(window.location.search).get(name))
  return Number.isInteger(value) && value > 0 ? value : fallback
}
const ATOM_COUNTS = [1000, 5000, 10000]
const ROUND_COUNT = readPositiveIntegerParameter('legacyRounds', 30)
const SAMPLE_COUNT = readPositiveIntegerParameter('legacySampleCount', 8)
const WARMUP_COUNT = readPositiveIntegerParameter('legacyWarmupCount', 5)
const HOVER_EVENT_COUNT = 240
const INTERACTIVE_ROUND_COUNT = readPositiveIntegerParameter('legacyInteractiveRounds', 30)
const LIFECYCLE_REPLACEMENTS = readPositiveIntegerParameter('legacyLifecycleReplacements', 30)
const MEMORY_SHORT_DELAY_MS = readPositiveIntegerParameter('legacyMemoryShortDelayMs', 3000)
const MEMORY_LONG_DELAY_MS = Math.max(MEMORY_SHORT_DELAY_MS, readPositiveIntegerParameter('legacyMemoryLongDelayMs', 6000))
const MEMORY_PRESSURE_SETTLE_MS = readPositiveIntegerParameter('legacyMemoryPressureDelayMs', 2000)
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
const waitForFrame = () => new Promise<void>((resolve) => {
  let settled = false
  const finish = () => {
    if (settled) return
    settled = true
    resolve()
  }
  const fallback = window.setTimeout(finish, 100)
  requestAnimationFrame(() => {
    window.clearTimeout(fallback)
    finish()
  })
})
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
type LegacyWindow = Window & { __CRYSTAL_TOOLKIT_LEGACY_REPORT_JSON__?: string, __CRYSTAL_TOOLKIT_LEGACY_MARKDOWN__?: string, __CRYSTAL_TOOLKIT_LEGACY_PROGRESS__?: string, __CRYSTAL_TOOLKIT_LEGACY_ERROR__?: string }
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
      const report = { protocol: { version: 'crystal-viewer-benchmark-v2', roundCount: ROUND_COUNT, interactiveRoundCount: INTERACTIVE_ROUND_COUNT, sampleCount: SAMPLE_COUNT, warmupCount: WARMUP_COUNT, hoverEventCount: HOVER_EVENT_COUNT, lifecycleReplacements: LIFECYCLE_REPLACEMENTS, mountWidth: 800, mountHeight: 600, sphereSegments: settings.sphereSegments, deviceScaleFactor: window.devicePixelRatio }, environment: { devicePixelRatio: window.devicePixelRatio, heapAvailable: readHeap() !== null, userAgent: navigator.userAgent, completedAt: new Date().toISOString() }, static: staticResults, interactive, lifecycle }
      const benchmarkWindow = window as LegacyWindow
      benchmarkWindow.__CRYSTAL_TOOLKIT_LEGACY_REPORT_JSON__ = JSON.stringify(report)
      benchmarkWindow.__CRYSTAL_TOOLKIT_LEGACY_MARKDOWN__ = reportToMarkdown(report)
      benchmarkWindow.__CRYSTAL_TOOLKIT_LEGACY_PROGRESS__ = '已完成'
      setStatus('已完成')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const benchmarkWindow = window as LegacyWindow
      benchmarkWindow.__CRYSTAL_TOOLKIT_LEGACY_ERROR__ = message
      benchmarkWindow.__CRYSTAL_TOOLKIT_LEGACY_PROGRESS__ = \`运行失败：\${message}\`
      setStatus(\`运行失败：\${message}\`)
    }
    finally { runningRef.current = false }
  }, [])
  return <div className="legacy-benchmark"><button onClick={run}>运行旧版固定基线</button><strong>{status}</strong><div ref={mountRef} className="legacy-mount" /></div>
}
`.replaceAll('\\`', '`').replaceAll('\\${', '${')

const CSS_SOURCE = '.legacy-benchmark{padding:16px}.legacy-benchmark button{margin-right:12px}.legacy-mount{width:800px;height:600px;position:relative}'


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

const waitForChildExit = async (child, timeoutMs) => {
  if (child.exitCode !== null || child.signalCode !== null) return true
  return Promise.race([
    once(child, 'exit').then(() => true),
    sleep(timeoutMs).then(() => false),
  ])
}

const signalStorybook = (child, signal) => {
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    if (process.platform !== 'win32' && child.pid) {
      process.kill(-child.pid, signal)
      return
    }
  } catch {
    // Fall back to the direct child when process-group signalling is unavailable.
  }
  child.kill(signal)
}

const stopStorybook = async (child) => {
  if (!child) return
  signalStorybook(child, 'SIGTERM')
  if (await waitForChildExit(child, CHILD_STOP_TIMEOUT_MS)) return
  signalStorybook(child, 'SIGKILL')
  await waitForChildExit(child, CHILD_STOP_TIMEOUT_MS)
}

const startStorybook = async () => {
  if (await isReady()) return null
  const child = spawn('pnpm', ['exec', 'storybook', 'dev', '--port', String(STORYBOOK_PORT), '--no-open', '--disable-telemetry'], { cwd: LEGACY_REPO_DIR, env: process.env, stdio: 'inherit', detached: process.platform !== 'win32' })
  const deadline = Date.now() + STORYBOOK_START_TIMEOUT_MS
  while (Date.now() < deadline) { if (await isReady()) return child; await sleep(1000) }
  await stopStorybook(child)
  throw new Error(`Reference Storybook did not become ready at ${STORYBOOK_URL}`)
}

const removeGeneratedTemporaryFiles = async () => {
  const hasStory = existsSync(TEMP_STORY_PATH)
  const hasCss = existsSync(TEMP_CSS_PATH)
  if (!hasStory && !hasCss) return false

  const [storySource, cssSource] = await Promise.all([
    hasStory ? readFile(TEMP_STORY_PATH, 'utf8') : Promise.resolve(''),
    hasCss ? readFile(TEMP_CSS_PATH, 'utf8') : Promise.resolve(''),
  ])
  const hasOnlyGeneratedFiles = (!hasStory || storySource.includes(GENERATED_STORY_MARKER))
    && (!hasCss || cssSource === CSS_SOURCE)
  if (!hasOnlyGeneratedFiles) {
    throw new Error('Reference repository contains temporary benchmark files not generated by this script; refusing to overwrite them.')
  }
  await Promise.all([
    hasStory ? rm(TEMP_STORY_PATH, { force: true }) : Promise.resolve(),
    hasCss ? rm(TEMP_CSS_PATH, { force: true }) : Promise.resolve(),
  ])
  console.log('Removed stale temporary benchmark files from an interrupted run.')
  return true
}

const getFrame = (page) => page.frames().find((frame) => frame.url().includes('/iframe.html'))
const readFrameText = async (frame) => frame.locator('body').innerText().catch(() => '')
const waitForStatus = async (frame) => {
  const deadline = Date.now() + MAX_WAIT_MS
  let lastProgress = ''
  while (Date.now() < deadline) {
    const text = await readFrameText(frame)
    const state = await frame.evaluate(() => ({
      progress: (window).__CRYSTAL_TOOLKIT_LEGACY_PROGRESS__ ?? '',
      reportJson: (window).__CRYSTAL_TOOLKIT_LEGACY_REPORT_JSON__ ?? '',
      markdown: (window).__CRYSTAL_TOOLKIT_LEGACY_MARKDOWN__ ?? '',
      error: (window).__CRYSTAL_TOOLKIT_LEGACY_ERROR__ ?? '',
    })).catch(() => ({ progress: '', reportJson: '', markdown: '', error: '' }))
    const progress = state.progress
    if (progress && progress !== lastProgress) {
      console.log(`[legacy-benchmark] ${progress}`)
      lastProgress = progress
    }
    if (state.reportJson) return
    if (state.error) throw new Error(`运行失败：${state.error}`)
    if (!text && frame.url().includes('error')) throw new Error(`Legacy Storybook iframe failed: ${frame.url()}`)
    const status = text.split('\n').map((line) => line.trim()).find((line) => line === '已完成' || line.startsWith('运行失败：'))
    if (status === '已完成') return
    if (status?.startsWith('运行失败：')) throw new Error(status)
    await sleep(5000)
  }
  throw new Error('Legacy benchmark timeout exceeded')
}

const synchronizeComparisonDocuments = async () => {
  if (!IS_FIXED_BASELINE_RUN) return false
  const currentReportPath = join(REPO_DIR, 'benchmark-results', 'latest.json')
  if (!existsSync(currentReportPath)) {
    console.log('Current benchmark report is not available; legacy baseline files were written, and comparison documents will update after the next current benchmark run.')
    return false
  }
  const child = spawn(process.execPath, ['scripts/run-many-round-benchmark.mjs', '--sync-only'], {
    cwd: REPO_DIR,
    env: process.env,
    stdio: 'inherit',
  })
  const [exitCode] = await once(child, 'exit')
  if (exitCode !== 0) throw new Error(`Failed to synchronize benchmark documents (exit code ${exitCode ?? 'unknown'})`)
  return true
}

let activeBrowser = null
let activeStorybook = null
let temporaryFilesCreated = false
let cleanupPromise = null

const cleanupRun = () => {
  if (cleanupPromise) return cleanupPromise
  cleanupPromise = (async () => {
    await activeBrowser?.close().catch(() => undefined)
    activeBrowser = null
    await stopStorybook(activeStorybook)
    activeStorybook = null
    if (temporaryFilesCreated) {
      await Promise.all([
        rm(TEMP_STORY_PATH, { force: true }),
        rm(TEMP_CSS_PATH, { force: true }),
      ])
      temporaryFilesCreated = false
    }
  })()
  return cleanupPromise
}

const handleInterruption = (signal) => {
  console.error(`Legacy benchmark interrupted by ${signal}; cleaning up generated resources.`)
  void cleanupRun().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143))
}

process.once('SIGINT', () => handleInterruption('SIGINT'))
process.once('SIGTERM', () => handleInterruption('SIGTERM'))

const run = async () => {
  if (existsSync(OUTPUT_PATH) && !process.argv.includes('--force')) throw new Error(`Legacy baseline already exists: ${OUTPUT_PATH}. Use --force only to replace it.`)
  if (!existsSync(join(LEGACY_REPO_DIR, 'node_modules'))) throw new Error(`Reference dependencies are missing: ${LEGACY_REPO_DIR}`)
  await removeGeneratedTemporaryFiles()
  const executablePath = await findChromiumExecutable()
  if (!executablePath) throw new Error('Chromium executable not found. Set CHROMIUM_EXECUTABLE_PATH.')
  try {
    await writeFile(TEMP_STORY_PATH, STORY_SOURCE)
    await writeFile(TEMP_CSS_PATH, CSS_SOURCE)
    temporaryFilesCreated = true
    activeStorybook = await startStorybook()
    activeBrowser = await chromium.launch({ executablePath, headless: true })
    try {
      const context = await activeBrowser.newContext({
        viewport: BENCHMARK_VIEWPORT,
        deviceScaleFactor: BENCHMARK_DEVICE_SCALE_FACTOR,
      })
      const page = await context.newPage()
      page.on('pageerror', (error) => console.error(`Legacy Storybook page error: ${error.message}`))
      page.on('requestfailed', (request) => console.error(`Legacy Storybook request failed: ${request.url()} ${request.failure()?.errorText ?? ''}`))
      await page.goto(STORY_URL, { waitUntil: 'domcontentloaded' })
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
      const markdown = await frame.evaluate(() => (window).__CRYSTAL_TOOLKIT_LEGACY_MARKDOWN__)
      if (!markdown) throw new Error('Legacy benchmark completed without Markdown output')
      await mkdir(OUTPUT_DIR, { recursive: true })
      await writeFile(OUTPUT_PATH, `${JSON.stringify({ ...report, baseline: { kind: 'reference-implementation', fixedAt: new Date().toISOString() } }, null, 2)}\n`)
      await writeFile(OUTPUT_MARKDOWN_PATH, markdown)
      console.log(`Legacy JSON: ${OUTPUT_PATH}`)
      console.log(`Legacy Markdown: ${OUTPUT_MARKDOWN_PATH}`)
      if (await synchronizeComparisonDocuments()) console.log('Comparison documents synchronized with the fixed legacy baseline.')
    } finally {
      await activeBrowser.close()
      activeBrowser = null
    }
  } finally {
    await cleanupRun()
  }
}

run().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
