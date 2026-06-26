import type { Meta, StoryObj } from '@storybook/react-vite'
import { CrystalToolkitScene } from '../index'
import { s2 } from '../components/crystal-toolkit/fixtures/simple-scene'
import { demoFixtures, defaultDemoMeta } from '../demo/fixtureIndex'
import { StoryShell, ViewerCard } from './viewerStoryShared'

const meta = {
  title: 'Crystal Toolkit Viewer/Real Structure Fixtures',
  component: CrystalToolkitScene,
  parameters: {
    controls: { disable: true },
  },
} satisfies Meta<typeof CrystalToolkitScene>

export default meta

type Story = StoryObj<typeof meta>

export const RealStructureFixtures: Story = {
  args: {
    data: s2,
  },
  render: () => (
    <StoryShell title={defaultDemoMeta.title} subtitle={defaultDemoMeta.subtitle}>
      <div className="grid gap-6 xl:grid-cols-2">
        {demoFixtures.map((item) => (
          <ViewerCard
            key={item.id}
            title={item.formula}
            scene={item.payload.scene ?? null}
          />
        ))}
      </div>
    </StoryShell>
  ),
}
