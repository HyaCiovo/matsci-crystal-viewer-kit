import type { Meta, StoryObj } from '@storybook/react-vite'
import { CrystalToolkitScene } from '../index'
import { s2, s4 } from '../components/crystal-toolkit/fixtures/simple-scene'
import { StoryShell, ViewerCard } from './viewerStoryShared'

const meta = {
  title: 'Crystal Toolkit Viewer/Local Fixtures',
  component: CrystalToolkitScene,
  parameters: {
    controls: { disable: true },
  },
} satisfies Meta<typeof CrystalToolkitScene>

export default meta

type Story = StoryObj<typeof meta>

export const LocalFixtures: Story = {
  args: {
    data: s2,
  },
  render: () => (
    <StoryShell
      title="Fixture Gallery"
      subtitle="Internal scene fixtures used to inspect rendering coverage and interaction behavior."
    >
      <div className="grid gap-6 xl:grid-cols-2">
        <ViewerCard title="Simple Scene S2" scene={s2 as Record<string, unknown>} />
        <ViewerCard title="Animated Geometry S4" scene={s4 as Record<string, unknown>} />
      </div>
    </StoryShell>
  ),
}
