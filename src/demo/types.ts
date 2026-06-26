export interface SceneFixturePayload {
  formula?: string
  nsites?: number
  legend?: Record<string, unknown> | null
  scene?: Record<string, unknown> | null
}

export interface SceneFixture {
  id: string
  formula: string
  payload: SceneFixturePayload
}

export interface Meta {
  title: string
  subtitle: string
}
