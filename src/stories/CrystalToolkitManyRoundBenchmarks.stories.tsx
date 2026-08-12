import { useCallback, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import * as THREE from 'three'
import { Scene } from '../index'
import { downloadBlob, downloadJSON } from '../utils/download'
import { Renderer, type JSON3DObject, type ThreePosition } from '../components/crystal-toolkit/scene/constants'
import type { SceneJsonObject } from '../components/crystal-toolkit/scene/scene-types'
import './viewer-story.css'

const ATOM_COUNTS = [1000, 5000, 10000] as const
const ROUND_COUNT = 30
const SAMPLE_COUNT = 8
const WARMUP_COUNT = 5
const HOVER_EVENT_COUNT = 240
const LIFECYCLE_REPLACEMENTS = 30
const MEMORY_SHORT_DELAY_MS = 3000
const MEMORY_LONG_DELAY_MS = 6000
const MEMORY_PRESSURE_SETTLE_MS = 2000

type MemorySample = number | null

type FrameStats = {
  buildMs: number
  medianMs: number
  p95Ms: number
  p99Ms: number
  meanMs: number
  stdevMs: number
  drawCalls: number
  geometries: number
  textures: number
  triangles: number
  memory: {
    before: MemorySample
    afterBuild: MemorySample
    afterDestroy: MemorySample
    after3Seconds: MemorySample
    after6Seconds: MemorySample
    afterPressureSettled: MemorySample
  }
}

type InteractiveRound = FrameStats & { hoverRaycasts: number }

type LifecycleRound = {
  geometryCounts: number[]
  textureCounts: number[]
  memory: {
    before: MemorySample
    afterBuild: MemorySample
    afterDestroy: MemorySample
    after3Seconds: MemorySample
    after6Seconds: MemorySample
    afterPressureSettled: MemorySample
  }
}

type NumberStats = {
  n: number
  mean: number
  median: number
  p95: number
  p99: number
  stdev: number
  min: number
  max: number
}

type ScenarioResult = {
  atomCount: number
  rounds: FrameStats[]
  summary: {
    buildMs: NumberStats
    medianFrameMs: NumberStats
    p95FrameMs: NumberStats
    p99FrameMs: NumberStats
    drawCalls: NumberStats
    geometries: NumberStats
    textures: NumberStats
    memoryAfterBuild: NumberStats | null
    memoryAfterDestroy: NumberStats | null
    memoryAfter3Seconds: NumberStats | null
    memoryAfter6Seconds: NumberStats | null
    memoryAfterPressureSettled: NumberStats | null
    stableDelta3Seconds: NumberStats | null
    stableDelta6Seconds: NumberStats | null
    pressureSettledDelta: NumberStats | null
  }
}

type LifecycleResult = {
  rounds: LifecycleRound[]
  peakGeometry: NumberStats
  finalGeometry: NumberStats
  peakTexture: NumberStats
  finalTexture: NumberStats
  memoryAfterBuild: NumberStats | null
  memoryAfterDestroy: NumberStats | null
  memoryAfter3Seconds: NumberStats | null
  memoryAfter6Seconds: NumberStats | null
  memoryAfterPressureSettled: NumberStats | null
  stableDelta6Seconds: NumberStats | null
  pressureSettledDelta: NumberStats | null
  stableHeapTrend: {
    first: MemorySample
    last: MemorySample
    delta: MemorySample
    slopePerRound: MemorySample
  }
}

type ManyRoundReport = {
  protocol: {
    roundCount: number
    sampleCount: number
    warmupCount: number
    hoverEventCount: number
    lifecycleReplacements: number
  }
  environment: {
    devicePixelRatio: number
    heapAvailable: boolean
    userAgent: string
    completedAt: string
  }
  static: ScenarioResult[]
  interactive: {
    rounds: InteractiveRound[]
    summary: {
      buildMs: NumberStats
      medianFrameMs: NumberStats
      p95FrameMs: NumberStats
      drawCalls: NumberStats
      geometries: NumberStats
      textures: NumberStats
      triangles: NumberStats
      memoryAfterBuild: NumberStats | null
      memoryAfterDestroy: NumberStats | null
      memoryAfter3Seconds: NumberStats | null
      memoryAfter6Seconds: NumberStats | null
      memoryAfterPressureSettled: NumberStats | null
      stableDelta3Seconds: NumberStats | null
      stableDelta6Seconds: NumberStats | null
      pressureSettledDelta: NumberStats | null
      hoverRaycasts: NumberStats
    }
  }
  lifecycle: LifecycleResult
}

type BenchmarkWindow = Window & {
  __CRYSTAL_TOOLKIT_MANY_ROUND_REPORT__?: ManyRoundReport
  __CRYSTAL_TOOLKIT_MANY_ROUND_MARKDOWN__?: string
}

type BenchmarkScene = SceneJsonObject & {
  name: string
  contents: Array<SceneJsonObject & { contents: Array<SceneJsonObject> }>
}

type PerformanceWithMemory = Performance & {
  memory?: { usedJSHeapSize?: number }
}

const settings = {
  renderer: Renderer.WEBGL,
  background: '#ffffff',
  staticScene: true,
  secondaryObjectView: false,
  maxPixelRatio: 2,
  sphereSegments: 20,
  maxLabelCount: 0,
}

const percentile = (values: number[], ratio: number) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]
}

const summarize = (values: number[]): NumberStats => {
  if (values.length === 0) {
    return { n: 0, mean: 0, median: 0, p95: 0, p99: 0, stdev: 0, min: 0, max: 0 }
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return {
    n: values.length,
    mean,
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    stdev: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length),
    min: Math.min(...values),
    max: Math.max(...values),
  }
}

const statsFor = <TRound,>(rounds: TRound[], selector: (round: TRound) => number) =>
  summarize(rounds.map(selector))

const statsForMemory = <TRound,>(
  rounds: TRound[],
  selector: (round: TRound) => MemorySample,
) => {
  const values = rounds
    .map(selector)
    .filter((value): value is number => typeof value === 'number')
  return values.length > 0 ? summarize(values) : null
}

const statsForMemoryDelta = <TRound,>(
  rounds: TRound[],
  baseSelector: (round: TRound) => MemorySample,
  valueSelector: (round: TRound) => MemorySample,
) => {
  const values = rounds
    .map((round) => {
      const base = baseSelector(round)
      const value = valueSelector(round)
      return typeof base === 'number' && typeof value === 'number' ? value - base : null
    })
    .filter((value): value is number => typeof value === 'number')
  return values.length > 0 ? summarize(values) : null
}

const memoryTrend = <TRound,>(
  rounds: TRound[],
  selector: (round: TRound) => MemorySample,
) => {
  const values = rounds.map(selector)
  const first = values.find((value): value is number => typeof value === 'number') ?? null
  const last = [...values].reverse().find((value): value is number => typeof value === 'number') ?? null
  const points = values
    .map((value, index) => typeof value === 'number' ? { x: index + 1, y: value } : null)
    .filter((point): point is { x: number; y: number } => point !== null)
  if (points.length < 2) {
    return {
      first,
      last,
      delta: first !== null && last !== null ? last - first : null,
      slopePerRound: null,
    }
  }
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length
  const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0)
  const numerator = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0)
  return {
    first,
    last,
    delta: first !== null && last !== null ? last - first : null,
    slopePerRound: denominator === 0 ? null : numerator / denominator,
  }
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

const createSceneData = (atomCount: number, interactive = false): BenchmarkScene => ({
  name: `many-rounds-${atomCount}-${interactive ? 'interactive' : 'static'}`,
  contents: [{
    name: 'atoms',
    contents: [{
      type: 'spheres' as JSON3DObject,
      positions: buildPositionGrid(atomCount),
      color: '#5d8fbe',
      radius: 0.46,
      clickable: interactive,
      tooltip: interactive ? 'Benchmark atom' : undefined,
    }],
  }],
})

const waitForFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

const readHeap = (): MemorySample => {
  const used = (performance as PerformanceWithMemory).memory?.usedJSHeapSize
  return typeof used === 'number' ? used : null
}

const waitForMemorySample = async (delayMs: number): Promise<MemorySample> => {
  if (readHeap() === null) return null
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
  await waitForFrame()
  return readHeap()
}

const waitForMemoryPressureSample = async (): Promise<MemorySample> => {
  if (readHeap() === null) return null

  // Trigger allocation pressure, then let the temporary buffers become unreachable
  // before taking the post-pressure sample. This is not a forced GC signal.
  for (let index = 0; index < 4; index += 1) {
    const pressure = new Uint8Array(8 * 1024 * 1024)
    pressure.fill(index)
    await waitForFrame()
  }
  await new Promise<void>((resolve) => setTimeout(resolve, MEMORY_PRESSURE_SETTLE_MS))
  await waitForFrame()
  return readHeap()
}

const waitForMemoryReclamation = async () => ({
  after3Seconds: await waitForMemorySample(MEMORY_SHORT_DELAY_MS),
  after6Seconds: await waitForMemorySample(MEMORY_LONG_DELAY_MS - MEMORY_SHORT_DELAY_MS),
  afterPressureSettled: await waitForMemoryPressureSample(),
})

const createScene = (mount: HTMLElement, data: BenchmarkScene) => new Scene(
  data,
  mount,
  settings,
  0,
  0,
  () => undefined,
  () => undefined,
)

const measureScene = async (
  mount: HTMLElement,
  data: BenchmarkScene,
  interactive = false,
): Promise<FrameStats | InteractiveRound> => {
  const memoryBefore = readHeap()
  const buildStart = performance.now()
  const scene = createScene(mount, data)
  scene.addToScene(data, true)
  const buildMs = performance.now() - buildStart
  const memoryAfterBuild = readHeap()

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

  let hoverRaycasts = 0
  if (interactive) {
    const before = scene.getHoverPickingPasses()
    const canvas = scene.getRenderer().domElement
    for (let index = 0; index < HOVER_EVENT_COUNT; index += 1) {
      canvas.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientX: 24 + (index % 80),
        clientY: 24,
      }))
    }
    await waitForFrame()
    await waitForFrame()
    hoverRaycasts = scene.getHoverPickingPasses() - before
  }

  const renderer = scene.getRenderer() as THREE.WebGLRenderer
  const meanMs = samples.reduce((sum, value) => sum + value, 0) / samples.length
  const result = {
    buildMs,
    medianMs: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99),
    meanMs,
    stdevMs: Math.sqrt(samples.reduce((sum, value) => sum + (value - meanMs) ** 2, 0) / samples.length),
    drawCalls: renderer.info.render.calls,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    triangles: renderer.info.render.triangles,
    memory: {
      before: memoryBefore,
      afterBuild: memoryAfterBuild,
      afterDestroy: null as MemorySample,
      after3Seconds: null as MemorySample,
      after6Seconds: null as MemorySample,
      afterPressureSettled: null as MemorySample,
    },
  }
  scene.onDestroy()
  await waitForFrame()
  result.memory.afterDestroy = readHeap()
  Object.assign(result.memory, await waitForMemoryReclamation())
  return interactive ? { ...result, hoverRaycasts } : result
}

const runStaticScenario = async (mount: HTMLElement, atomCount: number, update: (label: string) => void) => {
  const data = createSceneData(atomCount)
  const rounds: FrameStats[] = []
  for (let round = 0; round < ROUND_COUNT; round += 1) {
    update(`静态 ${atomCount.toLocaleString()} 原子：${round + 1}/${ROUND_COUNT}`)
    rounds.push(await measureScene(mount, data) as FrameStats)
  }
  return {
    atomCount,
    rounds,
    summary: {
      buildMs: statsFor(rounds, (round) => round.buildMs),
      medianFrameMs: statsFor(rounds, (round) => round.medianMs),
      p95FrameMs: statsFor(rounds, (round) => round.p95Ms),
      p99FrameMs: statsFor(rounds, (round) => round.p99Ms),
      drawCalls: statsFor(rounds, (round) => round.drawCalls),
      geometries: statsFor(rounds, (round) => round.geometries),
      textures: statsFor(rounds, (round) => round.textures),
      memoryAfterBuild: statsForMemory(rounds, (round) => round.memory.afterBuild),
      memoryAfterDestroy: statsForMemory(rounds, (round) => round.memory.afterDestroy),
      memoryAfter3Seconds: statsForMemory(rounds, (round) => round.memory.after3Seconds),
      memoryAfter6Seconds: statsForMemory(rounds, (round) => round.memory.after6Seconds),
      memoryAfterPressureSettled: statsForMemory(rounds, (round) => round.memory.afterPressureSettled),
      stableDelta3Seconds: statsForMemoryDelta(rounds, (round) => round.memory.afterBuild, (round) => round.memory.after3Seconds),
      stableDelta6Seconds: statsForMemoryDelta(rounds, (round) => round.memory.afterBuild, (round) => round.memory.after6Seconds),
      pressureSettledDelta: statsForMemoryDelta(rounds, (round) => round.memory.afterBuild, (round) => round.memory.afterPressureSettled),
    },
  }
}

const runInteractiveScenario = async (mount: HTMLElement, update: (label: string) => void) => {
  const data = createSceneData(1000, true)
  const rounds: InteractiveRound[] = []
  for (let round = 0; round < ROUND_COUNT; round += 1) {
    update(`交互 1,000 原子：${round + 1}/${ROUND_COUNT}`)
    rounds.push(await measureScene(mount, data, true) as InteractiveRound)
  }
  return {
    rounds,
    summary: {
      buildMs: statsFor(rounds, (round) => round.buildMs),
      medianFrameMs: statsFor(rounds, (round) => round.medianMs),
      p95FrameMs: statsFor(rounds, (round) => round.p95Ms),
      drawCalls: statsFor(rounds, (round) => round.drawCalls),
      geometries: statsFor(rounds, (round) => round.geometries),
      textures: statsFor(rounds, (round) => round.textures),
      triangles: statsFor(rounds, (round) => round.triangles),
      memoryAfterBuild: statsForMemory(rounds, (round) => round.memory.afterBuild),
      memoryAfterDestroy: statsForMemory(rounds, (round) => round.memory.afterDestroy),
      memoryAfter3Seconds: statsForMemory(rounds, (round) => round.memory.after3Seconds),
      memoryAfter6Seconds: statsForMemory(rounds, (round) => round.memory.after6Seconds),
      memoryAfterPressureSettled: statsForMemory(rounds, (round) => round.memory.afterPressureSettled),
      stableDelta3Seconds: statsForMemoryDelta(rounds, (round) => round.memory.afterBuild, (round) => round.memory.after3Seconds),
      stableDelta6Seconds: statsForMemoryDelta(rounds, (round) => round.memory.afterBuild, (round) => round.memory.after6Seconds),
      pressureSettledDelta: statsForMemoryDelta(rounds, (round) => round.memory.afterBuild, (round) => round.memory.afterPressureSettled),
      hoverRaycasts: statsFor(rounds, (round) => round.hoverRaycasts),
    },
  }
}

const runLifecycleScenario = async (mount: HTMLElement, update: (label: string) => void): Promise<LifecycleResult> => {
  const data = createSceneData(1000)
  const rounds: LifecycleRound[] = []
  for (let round = 0; round < ROUND_COUNT; round += 1) {
    update(`生命周期：${round + 1}/${ROUND_COUNT}`)
    const memoryBefore = readHeap()
    const scene = createScene(mount, data)
    const geometryCounts: number[] = []
    const textureCounts: number[] = []
    for (let replacement = 0; replacement < LIFECYCLE_REPLACEMENTS; replacement += 1) {
      scene.addToScene(data, true)
      scene.renderScene()
      await waitForFrame()
      const renderer = scene.getRenderer() as THREE.WebGLRenderer
      geometryCounts.push(renderer.info.memory.geometries)
      textureCounts.push(renderer.info.memory.textures)
    }
    const memoryAfterBuild = readHeap()
    scene.onDestroy()
    await waitForFrame()
    rounds.push({
      geometryCounts,
      textureCounts,
      memory: {
        before: memoryBefore,
        afterBuild: memoryAfterBuild,
        afterDestroy: readHeap(),
        ...(await waitForMemoryReclamation()),
      },
    })
  }

  const peakGeometry = rounds.map((round) => Math.max(...round.geometryCounts))
  const finalGeometry = rounds.map((round) => round.geometryCounts.at(-1) ?? 0)
  const peakTexture = rounds.map((round) => Math.max(...round.textureCounts))
  const finalTexture = rounds.map((round) => round.textureCounts.at(-1) ?? 0)
  return {
    rounds,
    peakGeometry: summarize(peakGeometry),
    finalGeometry: summarize(finalGeometry),
    peakTexture: summarize(peakTexture),
    finalTexture: summarize(finalTexture),
    memoryAfterBuild: statsForMemory(rounds, (round) => round.memory.afterBuild),
    memoryAfterDestroy: statsForMemory(rounds, (round) => round.memory.afterDestroy),
    memoryAfter3Seconds: statsForMemory(rounds, (round) => round.memory.after3Seconds),
    memoryAfter6Seconds: statsForMemory(rounds, (round) => round.memory.after6Seconds),
    memoryAfterPressureSettled: statsForMemory(rounds, (round) => round.memory.afterPressureSettled),
    stableDelta6Seconds: statsForMemoryDelta(rounds, (round) => round.memory.afterBuild, (round) => round.memory.after6Seconds),
    pressureSettledDelta: statsForMemoryDelta(rounds, (round) => round.memory.afterBuild, (round) => round.memory.afterPressureSettled),
    stableHeapTrend: memoryTrend(rounds, (round) => round.memory.after6Seconds),
  }
}

const formatNumber = (value: number) => value.toFixed(2)
const formatMiB = (value: MemorySample) => value === null ? 'n/a' : `${(value / 1024 / 1024).toFixed(1)} MiB`
const formatMemoryStats = (value: NumberStats | null) =>
  value ? `${formatMiB(value.median)} / ${formatMiB(value.p95)}` : 'n/a'

const reportToMarkdown = (report: ManyRoundReport) => {
  const lines = [
    '# Crystal Toolkit 多轮性能基准报告',
    '',
    `- 完成时间：${report.environment.completedAt}`,
    `- DPR：${report.environment.devicePixelRatio}`,
    `- JS Heap 可用：${report.environment.heapAvailable ? '是' : '否'}`,
    `- 协议：${report.protocol.roundCount} 轮；每轮 ${report.protocol.warmupCount} 帧预热、${report.protocol.sampleCount} 个双帧样本；销毁后观察 3 秒、6 秒，并在临时压力缓冲释放后等待 ${MEMORY_PRESSURE_SETTLE_MS / 1000} 秒再采样`,
    '',
    '## 旧实现与新实现的对照状态',
    '',
    '旧实现来自参考仓库，新实现来自当前组件库。当前脚本只运行新实现；旧实现没有同一机器、同一浏览器、同一场景和同一协议的实测值时统一标记为“待同协议补测”，不从源码差异推算百分比。',
    '',
    '| 场景 | 旧实现构建耗时 | 新实现构建耗时 | 旧实现 draw calls/geometry | 新实现 draw calls/geometry | 量化结论 |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
    ...report.static.map((scenario) => `| ${scenario.atomCount.toLocaleString()} 原子静态 | 待同协议补测 | ${formatNumber(scenario.summary.buildMs.median)} / ${formatNumber(scenario.summary.buildMs.p95)} ms | 待同协议补测 | ${formatNumber(scenario.summary.drawCalls.median)} / ${formatNumber(scenario.summary.geometries.median)} | 新实现实例化路径已确认；百分比待 A/B |`),
    `| 1,000 原子交互 | 待同协议补测 | ${formatNumber(report.interactive.summary.buildMs.median)} / ${formatNumber(report.interactive.summary.buildMs.p95)} ms | 待同协议补测 | ${formatNumber(report.interactive.summary.drawCalls.median)} / ${formatNumber(report.interactive.summary.geometries.median)} | 240 次指针事件合并为 ${formatNumber(report.interactive.summary.hoverRaycasts.median)} 次拾取 |`,
    '',
    '## 静态场景',
    '',
    '| 原子数 | 构建耗时中位数 / P95 | 帧间隔中位数 / P95 | 帧间隔 P95 / P95 | draw calls 中位数 | geometry 中位数 |',
    '| ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.static.map((scenario) => `| ${scenario.atomCount.toLocaleString()} | ${formatNumber(scenario.summary.buildMs.median)} / ${formatNumber(scenario.summary.buildMs.p95)} ms | ${formatNumber(scenario.summary.medianFrameMs.median)} / ${formatNumber(scenario.summary.medianFrameMs.p95)} ms | ${formatNumber(scenario.summary.p95FrameMs.median)} / ${formatNumber(scenario.summary.p95FrameMs.p95)} ms | ${formatNumber(scenario.summary.drawCalls.median)} | ${formatNumber(scenario.summary.geometries.median)} |`),
    '',
    '## 交互场景',
    '',
    `- 构建耗时中位数 / P95：${formatNumber(report.interactive.summary.buildMs.median)} / ${formatNumber(report.interactive.summary.buildMs.p95)} ms`,
    `- 帧间隔中位数 / P95：${formatNumber(report.interactive.summary.medianFrameMs.median)} / ${formatNumber(report.interactive.summary.medianFrameMs.p95)} ms`,
    `- 帧间隔 P95 中位数 / P95：${formatNumber(report.interactive.summary.p95FrameMs.median)} / ${formatNumber(report.interactive.summary.p95FrameMs.p95)} ms`,
    `- hover raycast 中位数 / P95：${formatNumber(report.interactive.summary.hoverRaycasts.median)} / ${formatNumber(report.interactive.summary.hoverRaycasts.p95)}`,
    `- draw calls 中位数 / P95：${formatNumber(report.interactive.summary.drawCalls.median)} / ${formatNumber(report.interactive.summary.drawCalls.p95)}`,
    `- geometry 中位数 / P95：${formatNumber(report.interactive.summary.geometries.median)} / ${formatNumber(report.interactive.summary.geometries.p95)}`,
    '',
    '## JS Heap（MiB）',
    '',
    '| 场景 | 构建后 | 销毁后一帧 | 销毁 3 秒后 | 销毁 6 秒后 | 压力释放稳定后 | 6 秒相对构建差值 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.static.map((scenario) => `| ${scenario.atomCount.toLocaleString()} 原子静态 | ${formatMemoryStats(scenario.summary.memoryAfterBuild)} | ${formatMemoryStats(scenario.summary.memoryAfterDestroy)} | ${formatMemoryStats(scenario.summary.memoryAfter3Seconds)} | ${formatMemoryStats(scenario.summary.memoryAfter6Seconds)} | ${formatMemoryStats(scenario.summary.memoryAfterPressureSettled)} | ${formatMemoryStats(scenario.summary.stableDelta6Seconds)} |`),
    `| 1,000 原子交互 | ${formatMemoryStats(report.interactive.summary.memoryAfterBuild)} | ${formatMemoryStats(report.interactive.summary.memoryAfterDestroy)} | ${formatMemoryStats(report.interactive.summary.memoryAfter3Seconds)} | ${formatMemoryStats(report.interactive.summary.memoryAfter6Seconds)} | ${formatMemoryStats(report.interactive.summary.memoryAfterPressureSettled)} | ${formatMemoryStats(report.interactive.summary.stableDelta6Seconds)} |`,
    '',
    '## 生命周期',
    '',
    `- geometry 峰值中位数 / P95：${formatNumber(report.lifecycle.peakGeometry.median)} / ${formatNumber(report.lifecycle.peakGeometry.p95)}`,
    `- geometry 最终值中位数 / P95：${formatNumber(report.lifecycle.finalGeometry.median)} / ${formatNumber(report.lifecycle.finalGeometry.p95)}`,
    `- texture 峰值中位数 / P95：${formatNumber(report.lifecycle.peakTexture.median)} / ${formatNumber(report.lifecycle.peakTexture.p95)}`,
    `- 生命周期构建后 / 销毁后即时 / 3 秒后 / 6 秒后 / 压力释放稳定后 JS Heap：${formatMemoryStats(report.lifecycle.memoryAfterBuild)} / ${formatMemoryStats(report.lifecycle.memoryAfterDestroy)} / ${formatMemoryStats(report.lifecycle.memoryAfter3Seconds)} / ${formatMemoryStats(report.lifecycle.memoryAfter6Seconds)} / ${formatMemoryStats(report.lifecycle.memoryAfterPressureSettled)}`,
    `- 生命周期 6 秒稳定值首轮 / 末轮 / 总差值 / 每轮线性斜率：${formatMiB(report.lifecycle.stableHeapTrend.first)} / ${formatMiB(report.lifecycle.stableHeapTrend.last)} / ${formatMiB(report.lifecycle.stableHeapTrend.delta)} / ${formatMiB(report.lifecycle.stableHeapTrend.slopePerRound)}`,
    '',
    '说明：JS Heap 快照受垃圾回收和页面基线影响；压力释放稳定值不是强制 GC 结果；6 秒稳定值的逐轮斜率用于发现线性增长信号，但不能替代 Chrome Heap Snapshot；renderer.info.memory 仅代表 Three.js 可观测 geometry/texture 计数，不等于系统内存或 GPU 显存。',
    '',
  ]
  return lines.join('\n')
}

const meta = {
  title: 'Crystal Toolkit Viewer/Performance Benchmarks',
  parameters: { controls: { disable: true } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ManyRoundProtocol: Story = {
  render: () => <ManyRoundBenchmark />,
}

function ManyRoundBenchmark() {
  const mountRef = useRef<HTMLDivElement>(null)
  const runningRef = useRef(false)
  const [status, setStatus] = useState('未运行')
  const [report, setReport] = useState<ManyRoundReport | null>(null)

  const run = useCallback(async () => {
    const mount = mountRef.current
    if (!mount || runningRef.current) return
    runningRef.current = true
    setReport(null)
    setStatus('准备运行')
    const update = (label: string) => setStatus(label)
    try {
      const staticResults: ScenarioResult[] = []
      for (const atomCount of ATOM_COUNTS) {
        staticResults.push(await runStaticScenario(mount, atomCount, update))
      }
      const interactive = await runInteractiveScenario(mount, update)
    const lifecycle = await runLifecycleScenario(mount, update)
      const nextReport: ManyRoundReport = {
        protocol: {
          roundCount: ROUND_COUNT,
          sampleCount: SAMPLE_COUNT,
          warmupCount: WARMUP_COUNT,
          hoverEventCount: HOVER_EVENT_COUNT,
          lifecycleReplacements: LIFECYCLE_REPLACEMENTS,
        },
        environment: {
          devicePixelRatio: window.devicePixelRatio,
          heapAvailable: readHeap() !== null,
          userAgent: navigator.userAgent,
          completedAt: new Date().toISOString(),
        },
        static: staticResults,
        interactive,
        lifecycle,
      }
      const benchmarkWindow = window as BenchmarkWindow
      benchmarkWindow.__CRYSTAL_TOOLKIT_MANY_ROUND_REPORT__ = nextReport
      benchmarkWindow.__CRYSTAL_TOOLKIT_MANY_ROUND_MARKDOWN__ = reportToMarkdown(nextReport)
      setReport(nextReport)
      setStatus('已完成')
    } catch (error) {
      setStatus(`运行失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      runningRef.current = false
    }
  }, [])

  const downloadReportJSON = () => report && downloadJSON(report, 'crystal-toolkit-many-round-report')
  const downloadReportMarkdown = () => report && downloadBlob(
    new Blob([reportToMarkdown(report)], { type: 'text/markdown;charset=utf-8' }),
    'crystal-toolkit-many-round-report.md',
  )

  return (
    <div className="mcv-story-page">
      <div className="mcv-story-shell">
        <header className="mcv-story-hero">
          <h1 className="mcv-story-title">30 轮自动性能基准</h1>
          <p className="mcv-story-subtitle">
            一键执行 1,000、5,000、10,000 原子静态渲染、交互悬停和生命周期替换，并自动计算中位数、P95、P99、标准差及资源计数。
          </p>
        </header>
        <section className="mcv-story-card mcv-many-benchmark-panel">
          <div className="mcv-many-benchmark-toolbar">
            <div>
              <strong>{status}</strong>
              <span>每次完整运行约需几分钟，请不要在运行中刷新页面。</span>
            </div>
            <div className="mcv-many-benchmark-actions">
              <button type="button" className="mcv-benchmark-run" onClick={run} disabled={runningRef.current}>
                {status === '已完成' ? '重新运行完整基准' : '运行完整基准'}
              </button>
              <button type="button" onClick={downloadReportJSON} disabled={!report}>导出 JSON</button>
              <button type="button" onClick={downloadReportMarkdown} disabled={!report}>导出 Markdown</button>
            </div>
          </div>
          <p className="mcv-benchmark-note">
            该入口自动统计当前组件版本，不包含参考组件 A/B 对照；A/B 对照需要在相同浏览器条件下分别运行两个版本后比较导出报告。
          </p>
          {report && <ManyRoundResult report={report} />}
        </section>
        <div ref={mountRef} className="mcv-many-benchmark-mount" aria-hidden="true" />
      </div>
    </div>
  )
}

function ManyRoundResult({ report }: { report: ManyRoundReport }) {
  return (
    <div className="mcv-many-benchmark-results">
      <h2 className="mcv-story-card-title">汇总结果</h2>
      <p className="mcv-benchmark-note">
            表格格式为“30 轮结果的中位数 / P95”；帧间隔越低越好，hover raycast、draw calls 和 geometry 计数用于观察高频操作与生命周期资源稳定性。Heap 行展示构建后、销毁后一帧、3 秒后、6 秒后和压力缓冲释放稳定后的 JS Heap。
      </p>
      <div className="mcv-many-benchmark-table-wrap">
        <table className="mcv-many-benchmark-table">
          <thead>
            <tr><th>场景</th><th>构建耗时</th><th>帧间隔中位数</th><th>帧间隔 P95</th><th>draw calls</th><th>geometry</th></tr>
          </thead>
          <tbody>
            {report.static.map((scenario) => (
              <tr key={scenario.atomCount}>
                <th>{scenario.atomCount.toLocaleString()} 原子</th>
                <td>{scenario.summary.buildMs.median.toFixed(2)} / {scenario.summary.buildMs.p95.toFixed(2)} ms</td>
                <td>{scenario.summary.medianFrameMs.median.toFixed(2)} / {scenario.summary.medianFrameMs.p95.toFixed(2)} ms</td>
                <td>{scenario.summary.p95FrameMs.median.toFixed(2)} / {scenario.summary.p95FrameMs.p95.toFixed(2)} ms</td>
                <td>{scenario.summary.drawCalls.median.toFixed(0)}</td>
                <td>{scenario.summary.geometries.median.toFixed(0)}</td>
              </tr>
            ))}
            {report.static.map((scenario) => (
              <tr key={`heap-${scenario.atomCount}`}>
                <th>{scenario.atomCount.toLocaleString()} 原子 JS Heap</th>
                <td colSpan={2}>构建后中位数 / P95</td>
                <td>{formatMemoryStats(scenario.summary.memoryAfterBuild)}</td>
                <td>销毁后一帧：{formatMemoryStats(scenario.summary.memoryAfterDestroy)}</td>
                <td>3 秒后：{formatMemoryStats(scenario.summary.memoryAfter3Seconds)}</td>
                <td>6 秒后：{formatMemoryStats(scenario.summary.memoryAfter6Seconds)}</td>
                <td>压力释放稳定后：{formatMemoryStats(scenario.summary.memoryAfterPressureSettled)}</td>
              </tr>
            ))}
            <tr>
              <th>交互 1,000 原子</th>
              <td>{report.interactive.summary.buildMs.median.toFixed(2)} / {report.interactive.summary.buildMs.p95.toFixed(2)} ms</td>
              <td>{report.interactive.summary.medianFrameMs.median.toFixed(2)} / {report.interactive.summary.medianFrameMs.p95.toFixed(2)} ms</td>
              <td>{report.interactive.summary.p95FrameMs.median.toFixed(2)} / {report.interactive.summary.p95FrameMs.p95.toFixed(2)} ms</td>
              <td>{report.interactive.summary.drawCalls.median.toFixed(0)}</td>
              <td>{report.interactive.summary.geometries.median.toFixed(0)}</td>
            </tr>
            <tr>
              <th>交互 JS Heap</th>
              <td colSpan={2}>构建后中位数 / P95</td>
              <td>{formatMemoryStats(report.interactive.summary.memoryAfterBuild)}</td>
              <td>销毁后一帧：{formatMemoryStats(report.interactive.summary.memoryAfterDestroy)}</td>
              <td>3 秒后：{formatMemoryStats(report.interactive.summary.memoryAfter3Seconds)}</td>
              <td>6 秒后：{formatMemoryStats(report.interactive.summary.memoryAfter6Seconds)}</td>
              <td>压力释放稳定后：{formatMemoryStats(report.interactive.summary.memoryAfterPressureSettled)}</td>
            </tr>
            <tr>
              <th>生命周期</th>
              <td>30 次替换 × 30 轮</td>
              <td>{report.lifecycle.finalGeometry.median.toFixed(0)} / {report.lifecycle.finalGeometry.p95.toFixed(0)} geometry</td>
              <td>{report.lifecycle.finalTexture.median.toFixed(0)} texture</td>
              <td>构建后：{formatMemoryStats(report.lifecycle.memoryAfterBuild)}</td>
              <td>即时：{formatMemoryStats(report.lifecycle.memoryAfterDestroy)}</td>
              <td>3 秒：{formatMemoryStats(report.lifecycle.memoryAfter3Seconds)}</td>
              <td>6 秒/压力释放稳定：{formatMemoryStats(report.lifecycle.memoryAfter6Seconds)} / {formatMemoryStats(report.lifecycle.memoryAfterPressureSettled)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
