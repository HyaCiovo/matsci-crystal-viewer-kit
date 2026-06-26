import { CameraContextProvider, CrystalToolkitScene } from '../index'
import './viewer-story.css'

export function StoryShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="mcv-story-page">
      <div className="mcv-story-shell">
        <header className="mcv-story-hero">
          <h1 className="mcv-story-title">{title}</h1>
          <p className="mcv-story-subtitle">{subtitle}</p>
        </header>
        <div className="mcv-story-surface">{children}</div>
      </div>
    </div>
  )
}

export function ViewerCard({
  title,
  scene,
}: {
  title: string
  scene: Record<string, unknown> | null | undefined
}) {
  return (
    <section className="mcv-story-card">
      <div className="mcv-story-card-header">
        <h2 className="mcv-story-card-title">{title}</h2>
      </div>
      <div className="mcv-story-card-body">
        {scene ? (
          <CameraContextProvider>
            <CrystalToolkitScene
              data={scene}
              sceneSize="100%"
              className="mcv-story-viewer"
              settings={{
                renderer: 'webgl',
                background: '#ffffff',
                staticScene: true,
                extractAxis: true,
                secondaryObjectView: true,
                defaultZoom: 0.9,
              }}
              inletSize={104}
              inletPadding={18}
              axisView="SW"
              showControls
              showExpandButton
              showImageButton
              showExportButton
              showPositionButton
            />
          </CameraContextProvider>
        ) : (
          <div className="mcv-story-empty">
            <div className="mcv-story-empty-title">Fixture unavailable</div>
            <p className="mcv-story-empty-copy">
              Replace the checked-in JSON file in <code>src/demo/fixtures</code> with a real scene payload.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
