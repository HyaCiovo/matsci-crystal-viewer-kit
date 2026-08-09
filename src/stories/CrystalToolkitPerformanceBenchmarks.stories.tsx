import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CrystalToolkitScene, Scene } from '../index'
import type { WebGLRenderer } from 'three'
import { Renderer, type JSON3DObject, type ThreePosition } from '../components/crystal-toolkit/scene/constants'
import type { SceneJsonObject } from '../components/crystal-toolkit/scene/scene-types'
import './viewer-story.css'

type BenchmarkResult = {
  atomCount: number
  buildMs: number
  renderMedianMs: number
  renderP95Ms: number
  estimatedFps: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  hoverEvents: number
  hoverPickingPasses: number
  hoverPickingReduction: number
}

type PerformanceScene = {
  name: string
  contents: Array<{
    name: string
    contents: Array<{
      type: JSON3DObject
      positions: ThreePosition[]
      color: string
      radius: number
      clickable?: boolean
      tooltip?: string
    }>
  }>
}

const SAMPLE_COUNT = 120
const WARMUP_COUNT = 20
const HOVER_EVENT_COUNT = 240

const percentile = (values: number[], ratio: number) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))]
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

const createBenchmarkScene = (atomCount: number, interactive: boolean): PerformanceScene => ({
  name: `performance-${atomCount}-${interactive ? 'interactive' : 'instanced'}`,
  contents: [
    {
      name: 'atoms',
      contents: [
        {
          type: 'spheres' as JSON3DObject,
          positions: buildPositionGrid(atomCount),
          color: '#5d8fbe',
          radius: 0.46,
          clickable: interactive,
          tooltip: interactive ? 'Benchmark atom' : undefined,
        },
      ],
    },
  ],
})

const waitForAnimationFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

const measureRenderBatch = async (scene: Scene, frameCount: number) => {
  const start = performance.now()
  for (let index = 0; index < frameCount; index += 1) {
    scene.renderScene()
    await waitForAnimationFrame()
  }
  return (performance.now() - start) / frameCount
}

const meta = {
  title: 'Crystal Toolkit Viewer/Performance Benchmarks',
  component: CrystalToolkitScene,
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof CrystalToolkitScene>

export default meta
type Story = StoryObj<typeof meta>

export const LargeAtomAndInteraction: Story = {
  args: { data: createBenchmarkScene(1000, false) },
  render: () => <CrystalToolkitPerformanceBenchmarks />,
}

function CrystalToolkitPerformanceBenchmarks() {
  const [atomCount, setAtomCount] = useState(1000)
  const [interactive, setInteractive] = useState(false)
  const [runToken, setRunToken] = useState(0)
  const [result, setResult] = useState<BenchmarkResult | null>(null)
  const [sceneBuildMs, setSceneBuildMs] = useState(0)
  const sceneRef = useRef<Scene | null>(null)
  const scene = useMemo(() => createBenchmarkScene(atomCount, interactive), [atomCount, interactive, runToken])

  const handleSceneReady = useCallback((sceneInstance: Scene, buildMs: number) => {
    sceneRef.current = sceneInstance
    setSceneBuildMs(buildMs)
  }, [])

  const handleRun = useCallback(async () => {
    const sceneInstance = sceneRef.current
    if (!sceneInstance) return

    for (let index = 0; index < WARMUP_COUNT; index += 1) {
      sceneInstance.renderScene()
    }

    const renderSamples: number[] = []
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      renderSamples.push(await measureRenderBatch(sceneInstance, 2))
    }

    const canvas = sceneInstance.getRenderer().domElement as HTMLCanvasElement
    const hoverPickingPassesBefore = sceneInstance.getHoverPickingPasses()
    for (let index = 0; index < HOVER_EVENT_COUNT; index += 1) {
      canvas.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 24 + (index % 80), clientY: 24 }))
    }
    await waitForAnimationFrame()
    const hoverPickingPasses = sceneInstance.getHoverPickingPasses() - hoverPickingPassesBefore

    const renderer = sceneInstance.getRenderer() as WebGLRenderer
    const median = percentile(renderSamples, 0.5)
    const p95 = percentile(renderSamples, 0.95)
    setResult({
      atomCount,
      buildMs: sceneBuildMs,
      renderMedianMs: median,
      renderP95Ms: p95,
      estimatedFps: median > 0 ? 1000 / median : 0,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      hoverEvents: HOVER_EVENT_COUNT,
      hoverPickingPasses,
      hoverPickingReduction: interactive ? 1 - hoverPickingPasses / HOVER_EVENT_COUNT : 0,
    })
  }, [atomCount, interactive, sceneBuildMs])

  const handleScenarioChange = (nextAtomCount: number, nextInteractive: boolean) => {
    setResult(null)
    setAtomCount(nextAtomCount)
    setInteractive(nextInteractive)
    setRunToken((value) => value + 1)
  }

  return (
    <div className="mcv-story-page">
      <div className="mcv-story-shell">
        <header className="mcv-story-hero">
          <h1 className="mcv-story-title">可复现性能基准</h1>
          <p className="mcv-story-subtitle">
            以真实 WebGL 场景测量建图、静态渲染与高频悬停事件。数值仅代表当前浏览器、屏幕和 GPU。
          </p>
        </header>
        <div className="mcv-benchmark-layout">
          <section className="mcv-story-card mcv-benchmark-controls">
            <h2 className="mcv-story-card-title">场景参数</h2>
            <div className="mcv-benchmark-actions">
              {[1000, 5000, 10000].map((count) => (
                <button key={count} type="button" onClick={() => handleScenarioChange(count, false)}>
                  {count.toLocaleString()} 原子
                </button>
              ))}
            </div>
            <label className="mcv-benchmark-toggle">
              <input
                type="checkbox"
                checked={interactive}
                onChange={(event) => handleScenarioChange(atomCount, event.target.checked)}
              />
              开启可点击和悬停提示，用于测量拾取开销
            </label>
            <button type="button" className="mcv-benchmark-run" onClick={handleRun}>
              运行当前场景基准
            </button>
            <p className="mcv-benchmark-note">
              无交互原子采用 InstancedMesh。交互场景保留单原子可拾取语义，因此不与实例化场景混同对比。
            </p>
            {result && <BenchmarkResultTable result={result} />}
          </section>
          <section className="mcv-story-card mcv-benchmark-viewer">
            <div className="mcv-story-card-header">
              <h2 className="mcv-story-card-title">
                {atomCount.toLocaleString()} 原子，{interactive ? '可交互' : '实例化静态'}
              </h2>
            </div>
            <div className="mcv-story-card-body">
              <BenchmarkSceneHost
                key={`${atomCount}-${interactive}-${runToken}`}
                data={scene}
                onReady={handleSceneReady}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function BenchmarkSceneHost({
  data,
  onReady,
}: {
  data: PerformanceScene
  onReady: (scene: Scene, buildMs: number) => void
}) {
  const mountNodeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mountNode = mountNodeRef.current
    if (!mountNode) return

    const buildStart = performance.now()
    const scene = new Scene(
      data as SceneJsonObject & Record<string, unknown>,
      mountNode,
      {
        renderer: Renderer.WEBGL,
        background: '#ffffff',
        staticScene: true,
        secondaryObjectView: false,
        maxPixelRatio: 1.5,
        sphereSegments: 20,
        maxLabelCount: 0,
      },
      0,
      0,
      () => undefined,
      () => undefined,
    )
    scene.addToScene(data as SceneJsonObject)
    onReady(scene, performance.now() - buildStart)

    return () => {
      scene.onDestroy()
    }
  }, [data, onReady])

  return <div ref={mountNodeRef} className="mcv-benchmark-mount" />
}

function BenchmarkResultTable({ result }: { result: BenchmarkResult }) {
  return (
    <dl className="mcv-benchmark-results">
      <div><dt>场景构建</dt><dd>{result.buildMs.toFixed(1)} ms</dd></div>
      <div><dt>渲染中位数</dt><dd>{result.renderMedianMs.toFixed(2)} ms</dd></div>
      <div><dt>渲染 P95</dt><dd>{result.renderP95Ms.toFixed(2)} ms</dd></div>
      <div><dt>估算帧率</dt><dd>{result.estimatedFps.toFixed(1)} FPS</dd></div>
      <div><dt>绘制调用</dt><dd>{result.drawCalls}</dd></div>
      <div><dt>三角形</dt><dd>{result.triangles.toLocaleString()}</dd></div>
      <div><dt>GPU 几何体</dt><dd>{result.geometries}</dd></div>
      <div><dt>GPU 纹理</dt><dd>{result.textures}</dd></div>
      <div><dt>悬停事件</dt><dd>{result.hoverEvents}</dd></div>
      <div><dt>帧内拾取上限</dt><dd>{result.hoverPickingPasses}</dd></div>
      <div><dt>拾取请求减少</dt><dd>{(result.hoverPickingReduction * 100).toFixed(1)}%</dd></div>
    </dl>
  )
}
